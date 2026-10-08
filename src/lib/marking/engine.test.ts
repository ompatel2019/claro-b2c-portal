// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { MarkableQuestion } from "./grade";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/openai", () => ({ callJson: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn() };
  return { admin: () => client };
});

import { callJson } from "@/lib/ai/openai";
import { admin } from "@/utils/supabase/admin";
import {
  AlreadyMarking,
  finishSession,
  markAttempt,
  rescoreSession,
  markFlashcard,
  markWritten,
  summariseSession,
  transcribeImage,
} from "./engine";
import { MODELS } from "@/lib/ai/prices";
import {
  FlashcardSchema,
  GradeSchema,
  SummarySchema,
  TranscriptSchema,
} from "./schemas";

const q: MarkableQuestion = {
  id: "q1",
  type: "short",
  marks: 4,
  stem: "Explain TWO effects.",
  stimulus: null,
  criteria: [
    { min: 3, max: 4, descriptor: "Explains two effects" },
    { min: 1, max: 2, descriptor: "Identifies an effect" },
  ],
  guideline_notes: null,
  sample_answer: null,
  source: "HSC",
};
const grade = {
  analysis: { strengths: ["First effect"], imprecise: [], missing: [] },
  elements_identified: "Two effects",
  bands_considered: [
    {
      band: q.criteria[0].descriptor,
      satisfied: true,
      evidence: "prices rise",
    },
  ],
  band_selected: q.criteria[0].descriptor,
  justification: 'Quotes "prices rise"',
  why_not_higher: "",
  mark: 4,
  comments: [
    {
      quote: "prices rise",
      kind: "strength" as const,
      body: "Clear",
      tag: "Analysis" as const,
      next_mark: null,
    },
    {
      quote: "invented",
      kind: "fix" as const,
      body: "More detail",
      tag: "Analysis" as const,
      next_mark: "Explain the mechanism",
    },
  ],
  earned: ["Effect"],
  missing_points: [],
  next_band: "",
  better_answer_outline: ["Cause", "Mechanism", "Effect"],
};
const mockedCall = vi.mocked(callJson);

beforeEach(() => vi.resetAllMocks());

it("labels both marking attempts as eval when requested", async () => {
  mockedCall
    .mockResolvedValueOnce({ ...grade, mark: 2 })
    .mockResolvedValueOnce(grade);
  await markWritten(q, "The prices rise rapidly", null, "eval");
  expect(mockedCall).toHaveBeenCalledTimes(2);
  for (const [options] of mockedCall.mock.calls)
    expect(options.task).toBe("eval");
});

it("returns validated grade on the first reply and anchors quotes", async () => {
  mockedCall.mockResolvedValue(grade);
  const result = await markWritten(q, "The prices rise rapidly", "user");
  expect(result).toMatchObject({
    mark: 4,
    band: q.criteria[0].descriptor,
    feedback: { validated: true, comments: [{ start: 4 }, { start: null }] },
  });
  expect(mockedCall).toHaveBeenCalledTimes(1);
  expect(mockedCall).toHaveBeenCalledWith(
    expect.objectContaining({
      task: "mark_written",
      model: MODELS.strong,
      effort: "low",
      schema: GradeSchema,
      userId: "user",
    }),
  );
});

it("retries once with the invalid assistant reply and correction", async () => {
  const invalid = { ...grade, band_selected: "Invented" };
  mockedCall.mockResolvedValueOnce(invalid).mockResolvedValueOnce(grade);
  expect(
    (await markWritten(q, "The prices rise rapidly", "user")).feedback
      .validated,
  ).toBe(true);
  expect(mockedCall).toHaveBeenCalledTimes(2);
  const messages = mockedCall.mock.calls[1][0].messages;
  expect(messages[2]).toEqual({
    role: "assistant",
    content: JSON.stringify(invalid),
  });
  expect(messages[3].content).toContain("Your band/mark was invalid");
  expect(messages[3].content).toContain(q.criteria[0].descriptor);
});

it.each(["missing fix", "missing strength", "empty next mark"])(
  "retries once for %s",
  async (problem) => {
    const strength = grade.comments[0];
    const fix = grade.comments[1];
    const invalid = {
      ...grade,
      mark: 3,
      comments:
        problem === "missing fix"
          ? [strength, strength]
          : problem === "missing strength"
            ? [fix, fix]
            : [strength, { ...fix, next_mark: "  " }],
    };
    mockedCall.mockResolvedValueOnce(invalid).mockResolvedValueOnce(grade);
    expect(
      (await markWritten(q, "The prices rise rapidly", "user")).feedback
        .validated,
    ).toBe(true);
    expect(mockedCall).toHaveBeenCalledTimes(2);
    expect(mockedCall.mock.calls[1][0].messages[3].content).toContain(
      "comment",
    );
  },
);

it("returns original quote slices and cleaned prose from a canned reply", async () => {
  mockedCall.mockResolvedValue({
    ...grade,
    mark: 3,
    comments: [
      {
        ...grade.comments[0],
        quote: "PRICES rise",
        body: " Clear. ",
        next_mark: "Ignored",
      },
      {
        ...grade.comments[1],
        body: " Add detail. ",
        next_mark: " Explain demand. ",
      },
    ],
  });
  expect(
    (await markWritten(q, "The prices\n  rise rapidly", "user")).feedback
      .comments,
  ).toEqual([
    {
      ...grade.comments[0],
      quote: "prices\n  rise",
      start: 4,
      body: "Clear.",
      next_mark: null,
    },
    {
      ...grade.comments[1],
      start: null,
      body: "Add detail.",
      next_mark: "Explain demand.",
    },
  ]);
});

it("falls back after two invalid replies, clamping and matching the resulting band", async () => {
  mockedCall.mockResolvedValue({
    ...grade,
    band_selected: "Invented",
    mark: 99,
  });
  expect(await markWritten(q, "The prices rise rapidly", "user")).toMatchObject(
    { mark: 4, band: q.criteria[0].descriptor, feedback: { validated: false } },
  );
  expect(mockedCall).toHaveBeenCalledTimes(2);
});

it("passes flashcard results through using the cheap model", async () => {
  mockedCall.mockResolvedValue({ mark: 0.5, reason: "Partly correct" });
  expect(
    await markFlashcard(
      { kind: "term", front: "Inflation", back: "Rising price level" },
      "Prices",
      "user",
    ),
  ).toEqual({ mark: 0.5, reason: "Partly correct" });
  expect(mockedCall).toHaveBeenCalledWith(
    expect.objectContaining({
      model: MODELS.cheap,
      schema: FlashcardSchema,
      effort: "low",
      userId: "user",
    }),
  );
});

it.each([
  Buffer.from("image"),
  new Uint8Array([105, 109, 97, 103, 101]).buffer,
])("transcribes bytes without a network call %#", async (bytes) => {
  mockedCall.mockResolvedValue({
    lines: ["Prices rise", "Demand falls"],
    notes: "Diagram",
  });
  expect(await transcribeImage(bytes, "image/png", q.stem, "user")).toEqual({
    transcript: "Prices rise\nDemand falls",
    lines: ["Prices rise", "Demand falls"],
    notes: "Diagram",
  });
  const options = mockedCall.mock.calls[0][0];
  expect(options).toMatchObject({
    model: MODELS.strong,
    schema: TranscriptSchema,
    effort: "low",
  });
  expect(options.messages[1].content).toContainEqual({
    type: "image_url",
    image_url: { url: "data:image/png;base64,aW1hZ2U=" },
  });
});

it("summarises with the cheap model", async () => {
  const summary = {
    strengths: ["You explain"],
    improvements: ["Add effects"],
    next_steps: ["Practise"],
  };
  mockedCall.mockResolvedValue(summary);
  expect(await summariseSession([], "user")).toEqual(summary);
  expect(mockedCall).toHaveBeenCalledWith(
    expect.objectContaining({
      model: MODELS.cheap,
      schema: SummarySchema,
      effort: "low",
    }),
  );
});

function query(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data }),
  };
  for (const key of [
    "select",
    "eq",
    "in",
    "or",
    "order",
    "update",
    "single",
  ] as const)
    chain[key].mockReturnValue(chain);
  return chain;
}

it("marks MCQ deterministically and stores the answer key", async () => {
  const load = query({
    id: "attempt",
    user_id: "user",
    status: "pending",
    choice_index: 2,
    question: { ...q, type: "mcq", correct_index: 2 },
  });
  const save = query({ id: "attempt", mark: 1, status: "marked" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(save as never);
  expect(await markAttempt("attempt")).toMatchObject({
    mark: 1,
    status: "marked",
  });
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      mark: 1,
      max_marks: 1,
      band: null,
      feedback: { correct_index: 2, chosen_index: 2 },
      marked_at: expect.any(String),
    }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it("uses an empty confirmed transcript in preference to answer_text", async () => {
  const load = query({
    id: "attempt",
    status: "transcribed",
    transcript: "",
    answer_text: "The prices rise rapidly",
    question: q,
  });
  const save = query({ mark: 0, status: "marked" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(save as never);
  await markAttempt("attempt");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      mark: 0,
      max_marks: 4,
      feedback: { note: "No answer" },
    }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it("sets failed and rethrows when grading fails", async () => {
  const load = query({
    id: "attempt",
    user_id: "user",
    status: "pending",
    transcript: null,
    answer_text: "The prices rise rapidly",
    question: q,
  });
  const marking = query([{ id: "attempt" }]);
  const failed = query(null);
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(marking as never)
    .mockReturnValueOnce(failed as never);
  mockedCall.mockRejectedValue(new Error("Budget reached"));
  await expect(markAttempt("attempt")).rejects.toThrow("Budget reached");
  expect(marking.update).toHaveBeenCalledWith({
    status: "marking",
    claimed_at: expect.any(String),
  });
  expect(marking.eq).toHaveBeenCalledWith("id", "attempt");
  expect(marking.or).toHaveBeenCalledWith(
    expect.stringMatching(
      /^status.in.\(pending,transcribed,failed\),and\(status.eq.marking,claimed_at.lt./,
    ),
  );
  expect(marking.select).toHaveBeenCalledWith("id");
  expect(failed.update).toHaveBeenCalledWith({ status: "failed" });
});

it("throws AlreadyMarking without setting failed when no attempt is claimed", async () => {
  const load = query({
    id: "attempt",
    user_id: "user",
    status: "pending",
    answer_text: "The prices rise rapidly",
    question: q,
  });
  const marking = query([]);
  const failed = query(null);
  vi.mocked(admin().from)
    .mockReturnValueOnce(load as never)
    .mockReturnValueOnce(marking as never)
    .mockReturnValueOnce(failed as never);
  await expect(markAttempt("attempt")).rejects.toBeInstanceOf(AlreadyMarking);
  expect(marking.update).toHaveBeenCalledExactlyOnceWith({
    status: "marking",
    claimed_at: expect.any(String),
  });
  expect(admin().from).toHaveBeenCalledTimes(2);
  expect(failed.update).not.toHaveBeenCalled();
  expect(mockedCall).not.toHaveBeenCalled();
});

it("returns an already finished session without marking or summarising", async () => {
  const session = {
    id: "session",
    finished_at: "2026-10-08",
    score: 3,
    max_score: 4,
  };
  vi.mocked(admin().from).mockReturnValueOnce(query(session) as never);
  expect(await finishSession("session")).toEqual(session);
  expect(admin().from).toHaveBeenCalledTimes(1);
  expect(mockedCall).not.toHaveBeenCalled();
});

it("totals flashcard reviews without calling the model", async () => {
  const save = query({ score: 1.5, max_score: 3, summary: null });
  vi.mocked(admin().from)
    .mockReturnValueOnce(
      query({
        id: "session",
        user_id: "user",
        kind: "flashcards",
        finished_at: null,
      }) as never,
    )
    .mockReturnValueOnce(
      query([
        { flashcard_id: "a", mark: 1 },
        { flashcard_id: "b", mark: 0.5 },
        { flashcard_id: "c", mark: 0 },
        { flashcard_id: "c", mark: 1 },
        { flashcard_id: "b", mark: 1 },
      ]) as never,
    )
    .mockReturnValueOnce(save as never);
  expect(await finishSession("session")).toMatchObject({
    score: 1.5,
    max_score: 3,
  });
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 1.5, max_score: 3, summary: null }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it("persists a written grade and skips grading an already marked attempt", async () => {
  const save = query({ id: "attempt", mark: 4, status: "marked" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(
      query({
        id: "attempt",
        user_id: "user",
        status: "transcribed",
        transcript: "The prices rise rapidly",
        answer_text: "Older answer",
        question: q,
      }) as never,
    )
    .mockReturnValueOnce(query([{ id: "attempt" }]) as never)
    .mockReturnValueOnce(save as never);
  mockedCall.mockResolvedValue(grade);
  await markAttempt("attempt");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      mark: 4,
      max_marks: 4,
      band: q.criteria[0].descriptor,
      status: "marked",
      feedback: expect.objectContaining({ validated: true }),
    }),
  );
  expect(mockedCall.mock.calls[0][0].messages[1].content).toContain(
    "The prices rise rapidly",
  );
  vi.mocked(admin().from).mockReturnValueOnce(
    query({ id: "attempt", mark: 4, status: "marked", question: q }) as never,
  );
  expect(await markAttempt("attempt")).toEqual({
    id: "attempt",
    mark: 4,
    status: "marked",
  });
  expect(mockedCall).toHaveBeenCalledTimes(1);
});

it("marks unfinished session attempts in parallel before totalling and summarising", async () => {
  const first = {
    id: "first",
    user_id: "user",
    status: "pending",
    answer_text: "The prices rise rapidly",
    transcript: null,
    question: q,
  };
  const second = { ...first, id: "second" };
  const alreadyMarked = {
    ...first,
    id: "third",
    status: "marked",
    mark: 2,
    max_marks: 4,
    band: q.criteria[1].descriptor,
    feedback: {
      analysis: { strengths: ["Identifies an effect"] },
      missing_points: ["Explain mechanism"],
    },
  };
  const completed = [first, second].map((a) => ({
    ...a,
    status: "marked",
    mark: 4,
    max_marks: 4,
    band: q.criteria[0].descriptor,
    feedback: {
      analysis: { strengths: ["Clear effects"] },
      missing_points: [],
    },
  }));
  const save = query({ score: 10, max_score: 12 });
  const chains = [
    query({
      id: "session",
      user_id: "user",
      kind: "sprint",
      finished_at: null,
    }),
    query([first, second, alreadyMarked]),
    query(first),
    query(second),
    query([{ id: "first" }]),
    query([{ id: "second" }]),
    query(completed[0]),
    query(completed[1]),
    query([...completed, alreadyMarked]),
    save,
  ];
  for (const chain of chains)
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  let resolveFirst!: (value: typeof grade) => void;
  let resolveSecond!: (value: typeof grade) => void;
  mockedCall
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    )
    .mockResolvedValueOnce({
      strengths: ["You explain"],
      improvements: ["Explain mechanism"],
      next_steps: ["Practise"],
    });
  const finishing = finishSession("session");
  await vi.waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
  expect(save.update).not.toHaveBeenCalled();
  resolveFirst(grade);
  resolveSecond(grade);
  expect(await finishing).toMatchObject({ score: 10, max_score: 12 });
  expect(mockedCall).toHaveBeenCalledTimes(3);
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      score: 10,
      max_score: 12,
      summary: expect.objectContaining({ improvements: ["Explain mechanism"] }),
    }),
  );
});

it("retries failures once and finishes with all possible marks in the denominator", async () => {
  const attempt = {
    id: "attempt",
    user_id: "user",
    status: "pending",
    answer_text: "The prices rise rapidly",
    transcript: null,
    question: q,
  };
  const failed = { ...attempt, status: "failed", mark: 99 };
  const save = query({ score: 0, max_score: 4, summary: null });
  for (const chain of [
    query({ user_id: "user", kind: "sprint" }),
    query([attempt]),
    query(attempt),
    query([{ id: "attempt" }]),
    query(null),
    query([failed]),
    query(failed),
    query([{ id: "attempt" }]),
    query(null),
    query([failed]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  mockedCall.mockRejectedValue(new Error("Budget reached"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await finishSession("session")).toMatchObject({
    score: 0,
    max_score: 4,
  });
  expect(mockedCall).toHaveBeenCalledTimes(2);
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 0, max_score: 4, summary: null }),
  );
  log.mockRestore();
});

it("finishes an empty sprint without a summary call", async () => {
  const save = query({ score: 0, max_score: 0, summary: null });
  for (const chain of [
    query({
      id: "session",
      user_id: "user",
      kind: "sprint",
      finished_at: null,
    }),
    query([]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  await finishSession("session");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 0, max_score: 0, summary: null }),
  );
  expect(mockedCall).not.toHaveBeenCalled();
});

it("waits for fresh in-flight marking and uses a deterministic topic summary", async () => {
  vi.useFakeTimers();
  try {
    const inflight = {
      id: "a",
      status: "marking",
      claimed_at: new Date().toISOString(),
      question: { ...q, type: "mcq", topic: { name: "Inflation" } },
    };
    const marked = {
      ...inflight,
      status: "marked",
      mark: 1,
      max_marks: 1,
      feedback: { correct_index: 0 },
    };
    const save = query({ score: 1, max_score: 1 });
    for (const chain of [
      query({ user_id: "user", kind: "sprint" }),
      query([inflight]),
      query([marked]),
      save,
    ])
      vi.mocked(admin().from).mockReturnValueOnce(chain as never);
    const finishing = finishSession("s");
    await vi.advanceTimersByTimeAsync(1500);
    await finishing;
    expect(mockedCall).not.toHaveBeenCalled();
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({
          strengths: ["1/1 correct on Inflation."],
        }),
      }),
    );
  } finally {
    vi.useRealTimers();
  }
});
it("finishes even when the AI summary fails", async () => {
  const row = {
    status: "marked",
    mark: 2,
    max_marks: 4,
    feedback: { analysis: { strengths: [] } },
    question: q,
  };
  const save = query({ score: 2, max_score: 4 });
  for (const chain of [
    query({ user_id: "user", kind: "sprint" }),
    query([row]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  mockedCall.mockRejectedValue(new Error("Summary failed"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await finishSession("s");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({ score: 2, summary: null }),
  );
  log.mockRestore();
});
it("rescores a finished session using marked marks over all possible marks", async () => {
  const save = query(null);
  for (const chain of [
    query({ user_id: "user", finished_at: "2026-10-08" }),
    query([
      { status: "marked", mark: 3, max_marks: 4, question: q },
      { status: "failed", mark: 99, max_marks: null, question: q },
    ]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  await rescoreSession("s");
  expect(save.update).toHaveBeenCalledWith({ score: 3, max_score: 8 });
});
it("does not rescore an unfinished session", async () => {
  vi.mocked(admin().from).mockReturnValueOnce(
    query({ user_id: "user", finished_at: null }) as never,
  );
  await rescoreSession("s");
  expect(admin().from).toHaveBeenCalledTimes(1);
});
