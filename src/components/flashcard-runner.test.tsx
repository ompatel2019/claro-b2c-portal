import {
  act,
  within,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FlashcardSession } from "@/lib/flashcard-data";
import type { Flashcard, FlashcardReview } from "@/lib/flashcards";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/auth-client", () => ({ ensureSession: async () => {} }));
vi.mock("@/app/(app)/flashcards/actions", () => ({
  drainPersistRating: vi.fn(),
  rateFlashcard: vi.fn(),
  saveFlashcardTime: vi.fn(),
}));
import {
  rateFlashcard,
  saveFlashcardTime,
} from "@/app/(app)/flashcards/actions";
import {
  activeSessions,
  loadPersistQueue,
} from "@/lib/flashcard-persist-queue";
import { FlashcardPersistDrain } from "./flashcard-persist-drain";
import { drainPersistRating } from "@/app/(app)/flashcards/actions";
import { FlashcardRunner } from "./flashcard-runner";
const push = vi.fn();
const refresh = vi.fn();
vi.mock("./feedback-widget", () => ({ useFeedback: () => vi.fn() }));
const session: FlashcardSession = {
  id: "session",
  user_id: "student",
  kind: "flashcards",
  started_at: "2026-10-08T00:00:00Z",
  finished_at: null,
  score: null,
  max_score: null,
  summary: null,
  elapsed_s: 20,
  config: {
    mode: "study",
    topics: [],
    kinds: ["term"],
    due: false,
    card_ids: ["a", "b"],
  },
};
const cards: Flashcard[] = [
  {
    id: "a",
    front: "Inflation",
    back: "Sustained rise in the price level",
    kind: "term",
    topic_id: "t3-inflation",
  },
  {
    id: "b",
    front: "Deflation",
    back: "Falling general prices",
    kind: "term",
    topic_id: "t3-inflation",
  },
];
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(rateFlashcard).mockResolvedValue(undefined);
  vi.mocked(saveFlashcardTime).mockResolvedValue(undefined);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ score: 1, max_score: 2 }),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("flips, recycles missed cards and finishes without any AI request", async () => {
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Inflation"
    />,
  );
  expect(screen.queryByText(cards[0].back)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  expect(screen.getByText(cards[0].back)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Missed it (1)" }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Deflation" })).toBeVisible(),
  );
  expect(screen.getByText("1 card coming back")).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Flip card" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Knew it (3)" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Flip card" })).toBeEnabled(),
  );
  expect(screen.getByText("Card 1 of 2")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Knew it (3)" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(vi.mocked(rateFlashcard).mock.calls).toEqual([
    ["session", "a", 0, "", "typed"],
    ["session", "b", 1, "", "typed"],
    ["session", "a", 1, "", "typed"],
  ]);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "/api/sessions/session/finish",
    expect.objectContaining({ method: "POST" }),
  );
});
it("resumes with only cards whose latest rating is below one", () => {
  const reviews = [
    { flashcard_id: "a", mark: 1 },
    { flashcard_id: "b", mark: 0.5 },
  ] as FlashcardReview[];
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={reviews}
      topics={[]}
      deckName="Deck"
    />,
  );
  expect(screen.getByRole("heading", { name: "Deflation" })).toBeVisible();
  expect(screen.getByText("Card 2 of 2")).toBeVisible();
});
it("checks one typed answer, displays the verdict and can finish immediately", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      mark: 0.5,
      reason: "Include sustained",
      back: cards[0].back,
    }),
  });
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
    target: { value: "Rising prices" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check (⌘Enter)" }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("article")).getByRole("status").textContent,
    ).toBe("Mostly"),
  );
  expect(screen.getByText(cards[0].back)).toBeVisible();
  expect(screen.getByText("Include sustained")).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(rateFlashcard).not.toHaveBeenCalled();
});
it("keeps a failed study rating on the current card for retry", async () => {
  vi.mocked(rateFlashcard).mockRejectedValue(new Error("Could not save"));
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Missed it (1)" }));
  // Persist fails after optimistic advance; component must roll back.
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(
    await screen.findByRole("heading", { name: "Inflation" }),
  ).toBeVisible();
  expect(screen.getByText("Card 1 of 2")).toBeVisible();
  fireEvent(window, new Event("online"));
  await act(async () => {});
  expect(rateFlashcard).toHaveBeenCalledTimes(1);
  expect(loadPersistQueue()).toHaveLength(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("toggles the list without rating and ignores shortcuts while typing", async () => {
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  const input = screen.getByRole("textbox", { name: "Your answer" });
  fireEvent.keyDown(input, { key: "l" });
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "l" });
  expect(screen.getByRole("table")).toHaveTextContent(cards[1].back);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "One by one" }));
  expect(screen.getByRole("textbox")).toBeVisible();
  expect(rateFlashcard).not.toHaveBeenCalled();
});
it("skips to the end then skips the last card without rating it", async () => {
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.keyDown(window, { key: "s" });
  await screen.findByRole("heading", { name: "Deflation" });
  fireEvent.keyDown(window, { key: " " });
  fireEvent.keyDown(window, { key: "3" });
  await screen.findByRole("heading", { name: "Inflation" });
  fireEvent.click(screen.getByRole("button", { name: "Skip (S)" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(rateFlashcard).toHaveBeenCalledExactlyOnceWith(
    "session",
    "b",
    1,
    "",
    "typed",
  );
});
it("rewrites the returned review on disagreement and advances using that mark", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      reviewId: "review",
      mark: 1,
      reason: "Exact match",
      back: cards[0].back,
    }),
  });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      reviewId: "review",
      mark: 0.5,
      reason: "Self-rated",
      back: cards[0].back,
    }),
  });
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: cards[0].back },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check (⌘Enter)" }));
  await screen.findByText("Exact match");
  fireEvent.click(screen.getByRole("button", { name: "Disagree?" }));
  fireEvent.click(screen.getByRole("button", { name: "Mostly" }));
  await screen.findByText("Self-rated");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    sessionId: "session",
    override: { reviewId: "review", mark: 0.5 },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next card" })).toBeEnabled(),
  );
  fireEvent.keyDown(window, { key: "ArrowRight" });
  await screen.findByRole("heading", { name: "Deflation" });
  expect(screen.getByText("1 card coming back")).toBeVisible();
  expect(rateFlashcard).not.toHaveBeenCalled();
});
it("reveals and self-rates without fetching a verdict", async () => {
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
  expect(screen.getByText(cards[0].back)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Mostly (2)" }));
  await waitFor(() =>
    expect(rateFlashcard).toHaveBeenCalledWith(
      "session",
      "a",
      0.5,
      "",
      "typed",
    ),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([500, 429])(
  "offers self rating on check failure %s",
  async (status) => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({
        error:
          status === 429
            ? "You're going a bit fast, try again in a minute"
            : "Error",
      }),
    });
    render(
      <FlashcardRunner
        session={{ ...session, config: { ...session.config, mode: "test" } }}
        cards={cards}
        reviews={[]}
        topics={[]}
        deckName="Deck"
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "answer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check (⌘Enter)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      status === 429
        ? "try again in a minute"
        : "Couldn't check this one. Rate yourself instead.",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Knew it (3)" })).toBeEnabled(),
    );
  },
);
it("keeps typing available when speech is unsupported", () => {
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Speak" }));
  expect(screen.getByText(/Speech isn't supported/)).toBeVisible();
  expect(screen.getByRole("textbox")).toBeEnabled();
});

it("renders speech interim text, stops after silence and submits spoken mode", async () => {
  const stop = vi.fn();
  const recognition = {
    lang: "",
    continuous: false,
    interimResults: false,
    onresult: null as
      | ((e: {
          results: { isFinal: boolean; 0: { transcript: string } }[];
        }) => void)
      | null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop,
  };
  vi.stubGlobal(
    "SpeechRecognition",
    class {
      constructor() {
        return recognition;
      }
    },
  );
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Speak" }));
  expect(recognition!.lang).toBe("en-AU");
  expect(recognition!.interimResults).toBe(true);
  act(() =>
    recognition!.onresult!({
      results: [{ isFinal: false, 0: { transcript: cards[0].back } }],
    }),
  );
  expect(screen.getByRole("textbox")).toHaveValue(cards[0].back);
  act(() => vi.advanceTimersByTime(8000));
  expect(stop).toHaveBeenCalledOnce();
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Check (⌘Enter)" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    answer_mode: "spoken",
    answer: cards[0].back,
  });
});
it("opens the exit dialog with Escape and saves back to Home", async () => {
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.keyDown(window, { key: "Escape" });
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Save and exit" }),
  );
  await waitFor(() => expect(push).toHaveBeenCalledWith("/student"));
});

it("restores an unsaved spoken answer after reopening the session", () => {
  localStorage.setItem(
    "claro.flashcard.draft.session",
    JSON.stringify({ cardId: "a", answer: "Saved answer", spoken: true }),
  );
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  expect(screen.getByRole("textbox")).toHaveValue("Saved answer");
});
it.each([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "no-speech",
  "aborted",
])("handles microphone error %s while keeping typing available", (error) => {
  const recognition = {
    lang: "",
    continuous: false,
    interimResults: false,
    start: vi.fn(),
    stop: vi.fn(),
    onresult: null,
    onend: null,
    onerror: null as ((e: { error: string }) => void) | null,
  };
  vi.stubGlobal(
    "SpeechRecognition",
    class {
      constructor() {
        return recognition;
      }
    },
  );
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Speak" }));
  act(() => recognition.onerror!({ error }));
  const note = screen.queryByText(
    "Couldn't use the microphone. You can type your answer.",
  );
  if (["not-allowed", "service-not-allowed", "audio-capture"].includes(error))
    expect(note).toBeVisible();
  else expect(note).toBeNull();
  expect(screen.getByRole("button", { name: "Speak" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("textbox")).toBeEnabled();
});

it("silently skips removed cards and finishes an empty resumed queue", async () => {
  render(
    <FlashcardRunner
      session={session}
      cards={[]}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "/api/sessions/session/finish",
    expect.objectContaining({ method: "POST" }),
  );
  expect(rateFlashcard).not.toHaveBeenCalled();
});

it("preserves keyboard activation on focused controls and focuses ratings after flip", () => {
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  expect(screen.queryByText("t3-inflation")).toBeNull();
  expect(screen.getByRole("group", { name: "View" })).toBeVisible();
  const flip = screen.getByRole("button", { name: "Flip card" });
  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  act(() => flip.dispatchEvent(enter));
  expect(enter.defaultPrevented).toBe(false);
  expect(screen.queryByText(cards[0].back)).toBeNull();
  fireEvent.click(flip);
  const rating = screen.getByRole("button", { name: "Missed it (1)" });
  expect(rating).toHaveFocus();
  for (const name of ["Missed it (1)", "Mostly (2)", "Knew it (3)"])
    expect(screen.getByRole("button", { name })).toHaveClass(
      "border-border",
      "bg-white",
    );
  expect(
    screen.getByRole("heading", { name: "Model answer" }).parentElement,
  ).toHaveClass("bg-muted", "border");
  const space = new KeyboardEvent("keydown", {
    key: " ",
    bubbles: true,
    cancelable: true,
  });
  act(() => rating.dispatchEvent(space));
  expect(space.defaultPrevented).toBe(false);
  expect(screen.getByText(cards[0].back)).toBeVisible();
});
it("keeps offline ratings advanced and drains them on reconnect without a layout duplicate", async () => {
  vi.mocked(rateFlashcard).mockRejectedValueOnce(
    new TypeError("Failed to fetch"),
  );
  const { unmount } = render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  render(<FlashcardPersistDrain />);
  expect(activeSessions.has(session.id)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Knew it (3)" }));
  await screen.findByText("You're offline. We'll save when you're back.");
  expect(
    await screen.findByRole("heading", { name: "Deflation" }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(loadPersistQueue()).toHaveLength(1);
  fireEvent(window, new Event("online"));
  await waitFor(() => expect(loadPersistQueue()).toHaveLength(0));
  expect(rateFlashcard).toHaveBeenCalledTimes(2);
  expect(drainPersistRating).not.toHaveBeenCalled();
  unmount();
  expect(activeSessions.has(session.id)).toBe(false);
});
it("swallows offline periodic time-save failures", async () => {
  vi.mocked(saveFlashcardTime).mockRejectedValue(
    new TypeError("Failed to fetch"),
  );
  vi.useFakeTimers();
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(
    screen.getByText("You're offline. We'll save when you're back."),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("does not roll back a saved rating when saving time fails", async () => {
  vi.mocked(saveFlashcardTime).mockRejectedValue(new Error("Time save failed"));
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Knew it (3)" }));
  await waitFor(() => expect(saveFlashcardTime).toHaveBeenCalled());
  expect(screen.getByRole("heading", { name: "Deflation" })).toBeVisible();
  expect(loadPersistQueue()).toEqual([]);
  expect(screen.queryByRole("alert")).toBeNull();
});
it.each(["s", "3"])("dismisses the welcome message on %s", async (key) => {
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[{ flashcard_id: "a", mark: 0 }] as FlashcardReview[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  expect(screen.getByText("Welcome back, 2 cards left")).toBeVisible();
  if (key === "3")
    fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.keyDown(window, { key });
  await waitFor(() => expect(screen.queryByText(/Welcome back/)).toBeNull());
});
it("keeps the verdict live region mounted and exposes disagreement expansion", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ reviewId: "r", mark: 1, reason: "Exact match" }),
  });
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  const live = within(screen.getByRole("article")).getByRole("status");
  expect(live).toHaveAttribute("aria-live", "polite");
  expect(live).toBeEmptyDOMElement();
  const mic = screen.getByRole("button", { name: "Speak" });
  expect(mic).toHaveAttribute("aria-keyshortcuts", "m");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: cards[0].back },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check (⌘Enter)" }));
  await waitFor(() => expect(live).toHaveTextContent("Knew it"));
  expect(within(screen.getByRole("article")).getByRole("status")).toBe(live);
  const disagree = screen.getByRole("button", { name: "Disagree?" });
  expect(disagree).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(disagree);
  expect(disagree).toHaveAttribute("aria-expanded", "true");
});
it("shows a loading status after finish and cannot submit finish again", async () => {
  render(
    <FlashcardRunner
      session={session}
      cards={[]}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  await screen.findByText("Loading your results…");
  expect(screen.queryByRole("button", { name: "See results" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  await act(async () => {});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("does not offer self rating after a missing-session check", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({ error: "This session was reset or expired" }),
  });
  render(
    <FlashcardRunner
      session={{ ...session, config: { ...session.config, mode: "test" } }}
      cards={cards}
      reviews={[]}
      topics={[]}
      deckName="Deck"
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "answer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check (⌘Enter)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "reset or expired",
  );
  expect(screen.queryByRole("button", { name: "Knew it (3)" })).toBeNull();
});
