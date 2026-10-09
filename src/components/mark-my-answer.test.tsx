import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkMyAnswer } from "./mark-my-answer";
import type { BankQuestion } from "@/lib/single-check";
const createCheck = vi.hoisted(() => vi.fn());
const finishCheck = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(app)/student/mark/actions", () => ({
  createCheck,
  finishCheck,
  restoreUnreadableCheck: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
vi.mock("@/lib/auth-client", () => ({
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
const questions = [
  {
    id: "q1",
    type: "short",
    stem: "Explain the causes of inflation.",
    marks: 4,
    source: "2023 HSC Q22",
    year: 2023,
    topic_id: "t3-inflation",
    stimulus: null,
    options: null,
    verb: "explain",
  },
] satisfies BankQuestion[];
function setup(left = 20) {
  return render(
    <MarkMyAnswer questions={questions} topics={[]} userId="u" left={left} />,
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("searches stems and source, selects the question and enables only a valid answer without creating a session", () => {
  setup();
  const submit = screen.getByRole("button", {
    name: "Mark my answer",
  });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Search questions"), {
    target: { value: "2023 HSC Q22" },
  });
  fireEvent.click(screen.getByRole("option", { name: /Explain the causes/ }));
  expect(screen.getByText("Selected question · 4 marks")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
    target: { value: "Inflation rises as aggregate demand increases." },
  });
  expect(submit).toBeEnabled();
  expect(createCheck).not.toHaveBeenCalled();
});
it("shows inline own-question validation and auto-fills the verb", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "My own question" }));
  const stem = screen.getByRole("textbox", { name: /Question text/ });
  fireEvent.change(stem, { target: { value: "Explain" } });
  fireEvent.blur(stem);
  expect(screen.getByRole("alert")).toHaveTextContent("at least 10 characters");
  fireEvent.change(stem, {
    target: { value: "Assess the impact of fiscal policy." },
  });
  expect(
    screen.getByRole("combobox", { name: "Directive verb" }),
  ).toHaveTextContent("Assess");
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
  expect(createCheck).not.toHaveBeenCalled();
});
it("toggles Photo without uploading or transcribing", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
  expect(screen.getByLabelText("Take photo / Upload")).toBeDisabled();
  expect(screen.getByText(/Upload up to 8 pages/)).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Your answer" })).toBeNull();
  expect(createCheck).not.toHaveBeenCalled();
});
it("shows the daily cap and keeps submit disabled", () => {
  setup(0);
  expect(screen.getByRole("alert")).toHaveTextContent("More at midnight");
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
});

it("keeps a manually selected verb when question text changes", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "My own question" }));
  const stem = screen.getByRole("textbox", { name: /Question text/ });
  fireEvent.change(stem, { target: { value: "Assess fiscal policy." } });
  fireEvent.click(screen.getByRole("combobox", { name: "Directive verb" }));
  const option = await screen.findByRole("option", { name: "Explain" });
  fireEvent.mouseMove(option);
  fireEvent.mouseUp(option);
  fireEvent.click(option);
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Directive verb" }),
    ).toHaveTextContent("Explain"),
  );
  fireEvent.change(stem, { target: { value: "Outline fiscal policy." } });
  expect(
    screen.getByRole("combobox", { name: "Directive verb" }),
  ).toHaveTextContent("Explain");
});
it("routes to live results while marking continues, using one saved attempt", async () => {
  const { createClient } = await import("@/utils/supabase/client");
  const update = vi.fn();
  const query = {
    update,
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn().mockResolvedValue({ data: [{ id: "a" }], error: null }),
  };
  update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({ from: () => query } as never);
  createCheck.mockResolvedValue({ sessionId: "s", attemptId: "a" });
  finishCheck.mockResolvedValue({ error: null });
  const fetch = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  setup();
  fireEvent.click(screen.getByRole("option", { name: /Explain the causes/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
    target: { value: "Demand grows faster than supply." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mark my answer" }));
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith("/student/activity/s"),
  );
  expect(createCheck).toHaveBeenCalledTimes(1);
  expect(finishCheck).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({
    answer_text: "Demand grows faster than supply.",
    transcript: null,
    image_paths: null,
  });
});

it("converts a restored photo transcript to a single typed answer", async () => {
  const { createClient } = await import("@/utils/supabase/client");
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn().mockResolvedValue({ data: [{ id: "a" }], error: null }),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({ from: () => query } as never);
  render(
    <MarkMyAnswer
      questions={questions}
      topics={[]}
      userId="u"
      left={19}
      initial={{
        sessionId: "s",
        questionId: "q1",
        attempt: {
          id: "a",
          question_id: "q1",
          position: 1,
          choice_index: null,
          answer_text: null,
          transcript: "Demand grows faster than supply.",
          image_paths: ["u/photo.png"],
          flagged: false,
          status: "transcribed",
          mark: null,
          max_marks: null,
          band: null,
          feedback: null,
        },
      }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Confirm transcript" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Type$/ }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "Demand grows faster than supply.",
    ),
  );
  expect(query.update).toHaveBeenCalledWith({
    answer_text: "Demand grows faster than supply.",
    transcript: null,
    image_paths: null,
  });
  expect(screen.getByRole("button", { name: "Mark my answer" })).toBeEnabled();
  expect(createCheck).not.toHaveBeenCalled();
});
it("does not redirect every new check to a completed cached session", async () => {
  const { createClient } = await import("@/utils/supabase/client");
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { finished_at: "2026-10-09" }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  vi.mocked(createClient).mockReturnValue({ from: () => query } as never);
  localStorage.setItem(
    "claro.single.u",
    JSON.stringify({
      source: "bank",
      selected: "q1",
      own: {
        stem: "",
        marks: 0,
        verb: "",
        topic_id: null,
        criteria_text: null,
      },
      mode: "type",
      answer: {
        answer_text: "Cached text",
        transcript: null,
        image_paths: null,
      },
      sessionId: "finished",
    }),
  );
  setup();
  await waitFor(() => expect(query.maybeSingle).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "",
    ),
  );
  expect(router.replace).not.toHaveBeenCalled();
});

it("selects a bank question from the search combobox using the keyboard", () => {
  setup();
  const search = screen.getByRole("combobox", { name: "Search questions" });
  fireEvent.change(search, { target: { value: "inflation" } });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  expect(search).toHaveAttribute(
    "aria-activedescendant",
    screen.getByRole("option", { name: /Explain the causes/ }).id,
  );
  fireEvent.keyDown(search, { key: "Enter" });
  expect(screen.getByText("Selected question · 4 marks")).toBeVisible();
  expect(search).toHaveAttribute("aria-expanded", "false");
  expect(createCheck).not.toHaveBeenCalled();
});

it("restores unsaved text without replacing a saved session's immutable question", async () => {
  const savedQuestion = {
    stem: "Explain the causes of inflation.",
    marks: 4,
    verb: "explain",
    topic_id: null,
    criteria_text: null,
  };
  localStorage.setItem(
    "claro.single.u",
    JSON.stringify({
      source: "own",
      selected: "",
      own: {
        ...savedQuestion,
        stem: "Assess a different question.",
        marks: 20,
      },
      mode: "type",
      sessionId: "s",
      answer: {
        answer_text: "Unsaved answer",
        transcript: null,
        image_paths: null,
      },
    }),
  );
  render(
    <MarkMyAnswer
      questions={questions}
      topics={[]}
      userId="u"
      left={19}
      initial={{
        sessionId: "s",
        question: savedQuestion,
        attempt: {
          id: "a",
          question_id: "",
          position: 1,
          choice_index: null,
          answer_text: "Saved answer",
          transcript: null,
          image_paths: null,
          flagged: false,
          status: "pending",
          mark: null,
          max_marks: null,
          band: null,
          feedback: null,
        },
      }}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "Unsaved answer",
    ),
  );
  expect(screen.getByRole("textbox", { name: /Question text/ })).toHaveValue(
    savedQuestion.stem,
  );
  expect(screen.getByRole("combobox", { name: /^Marks$/ })).toHaveTextContent(
    "4 marks",
  );
  expect(screen.getByText(/aim for about 140–200/)).toBeVisible();
});
