import {
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
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/auth-client", () => ({ ensureSession: async () => {} }));
vi.mock("@/app/(app)/flashcards/actions", () => ({
  rateFlashcard: vi.fn(),
  saveFlashcardTime: vi.fn(),
}));
import {
  rateFlashcard,
  saveFlashcardTime,
} from "@/app/(app)/flashcards/actions";
import { FlashcardRunner } from "./flashcard-runner";
const push = vi.fn();
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
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { assign: push });
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
  vi.unstubAllGlobals();
});
it("flips, recycles missed cards and finishes without any AI request", async () => {
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[]}
      deckName="Inflation"
    />,
  );
  expect(screen.queryByText(cards[0].back)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  expect(screen.getByText(cards[0].back)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Missed" }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Deflation" })).toBeVisible(),
  );
  expect(screen.getByText("1 card coming back")).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Flip card" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Knew it" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Flip card" })).toBeEnabled(),
  );
  expect(screen.getByText("Card 1 of 2 · Study")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Knew it" }));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith("/flashcards/session/results"),
  );
  expect(vi.mocked(rateFlashcard).mock.calls).toEqual([
    ["session", "a", 0],
    ["session", "b", 1],
    ["session", "a", 1],
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
      deckName="Deck"
    />,
  );
  expect(screen.getByRole("heading", { name: "Deflation" })).toBeVisible();
  expect(screen.getByText("Card 2 of 2 · Study")).toBeVisible();
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
      deckName="Deck"
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
    target: { value: "Rising prices" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  await waitFor(() => expect(screen.getByText("Nearly there")).toBeVisible());
  expect(screen.getByText(cards[0].back)).toBeVisible();
  expect(screen.getByText("Include sustained")).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Finish now" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Finish now" }));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith("/flashcards/session/results"),
  );
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
      deckName="Deck"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
  fireEvent.click(screen.getByRole("button", { name: "Missed" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save"),
  );
  expect(screen.getByText("Card 1 of 2 · Study")).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("homework offers typing and self ratings, resumes unseen first and moves to questions without finishing", async () => {
  render(
    <FlashcardRunner
      session={session}
      cards={cards}
      reviews={[
        {
          flashcard_id: "a",
          mark: 0,
          created_at: "2026-10-08",
        } as FlashcardReview,
      ]}
      deckName="Homework"
      homework={{ setId: "set", answered: 0, questions: 2 }}
    />,
  );
  expect(screen.getByRole("heading", { name: "Deflation" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Your answer" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Finish now" }),
  ).not.toBeInTheDocument();
  for (let i = 0; i < 2; i++) {
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Flip and rate myself" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Flip and rate myself" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Knew it" }));
    if (i === 0)
      await waitFor(() =>
        expect(screen.getByText("Card 1 of 2 · Study")).toBeVisible(),
      );
  }
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith("/homework/set/do?stage=questions"),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
