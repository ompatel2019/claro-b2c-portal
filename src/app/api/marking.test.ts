// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { singleSlotIds } from "@/lib/single-check";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } };
  return { admin: () => client };
});
vi.mock("@/lib/single-check-marking", () => ({
  markOwnCheck: vi.fn(),
  markBankCheck: vi.fn(),
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  assertStudentAiRateLimit: vi.fn(async () => ({ ok: true })),
  rateLimitedResponse: (result: { error: string; retryAfterSec: number }) =>
    Response.json(
      { error: result.error },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfterSec) },
      },
    ),
  AI_RATE_LIMIT_MESSAGE: "You're going a bit fast, try again in a minute",
}));
vi.mock("@/lib/marking/engine", () => ({
  AlreadyMarking: class extends Error {
    message = "This answer is already being marked.";
  },
  STALE_CLAIM_MS: 3 * 60_000,
  markAttempt: vi.fn(),
  rescoreSession: vi.fn(),
  transcribeImage: vi.fn(),
  markFlashcard: vi.fn(),
  finishSession: vi.fn(),
  summariseSession: vi.fn(),
}));

import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";
import {
  AlreadyMarking,
  finishSession,
  markAttempt,
  rescoreSession,
  markFlashcard,
  transcribeImage,
} from "@/lib/marking/engine";
import { POST as mark } from "./attempts/[id]/mark/route";
import { POST as transcribe } from "./attempts/[id]/transcribe/route";
import { POST as flashcard } from "./flashcards/[id]/mark/route";
import { POST as finish } from "./sessions/[id]/finish/route";
import { assertStudentAiRateLimit } from "@/lib/ai/rate-limit";

const userId = "d0d38222-b9bb-4089-81d5-383878dd9d9d";
const sessionId = "75f2a40b-3e20-4a56-9e14-1b237cfc8396";
const singleStarted = "2026-10-09T01:00:00Z";
const singleSessionId = (
  await singleSlotIds(userId, new Date(singleStarted))
)[0];
const ctx = { params: Promise.resolve({ id: "id" }) };
const request = (body?: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
  });

function client(rows: unknown[], signedIn = true) {
  const chains = rows.map((data) => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data }),
      throwOnError: vi.fn().mockResolvedValue({ data }),
    };
    for (const key of ["select", "eq", "order", "single"] as const)
      chain[key].mockReturnValue(chain);
    return chain;
  });
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: signedIn ? { id: userId } : null },
      }),
    },
    from: vi.fn(),
  };
  for (const chain of chains) supabase.from.mockReturnValueOnce(chain);
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  return { supabase, chains };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(admin().rpc).mockResolvedValue({ data: 0, error: null } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each([mark, transcribe, flashcard, finish])(
  "requires authentication for handler %#",
  async (handler) => {
    const { supabase } = client([], false);
    expect((await handler(request({ answer: "Answer" }), ctx)).status).toBe(
      401,
    );
    expect(supabase.from).not.toHaveBeenCalled();
    expect(admin().from).not.toHaveBeenCalled();
  },
);

it.each([mark, transcribe, flashcard, finish])(
  "returns 404 for invisible rows in handler %#",
  async (handler) => {
    client([null]);
    expect((await handler(request({ answer: "Answer" }), ctx)).status).toBe(
      404,
    );
    expect(markAttempt).not.toHaveBeenCalled();
    expect(markFlashcard).not.toHaveBeenCalled();
    expect(transcribeImage).not.toHaveBeenCalled();
    expect(finishSession).not.toHaveBeenCalled();
  },
);

it("returns the MCQ answer key after marking an owned attempt", async () => {
  const { chains } = client([
    {
      id: "id",
      session_id: sessionId,
      session: { finished_at: "2026-10-08" },
      question: { type: "mcq" },
    },
  ]);
  vi.mocked(markAttempt).mockResolvedValue({
    mark: 1,
    max_marks: 1,
    band: null,
    feedback: { correct_index: 2, chosen_index: 2 },
    status: "marked",
  } as never);
  const response = await mark(request(), ctx);
  expect(await response.json()).toMatchObject({
    mark: 1,
    correct_index: 2,
    status: "marked",
  });
  expect(chains[0].eq).toHaveBeenCalledWith("user_id", userId);
});

it.each([
  { answer: "" },
  { answer: "a".repeat(2001) },
  { answer: "Valid", sessionId: "invalid" },
  { answer: 1 },
])("rejects invalid flashcard body %#", async (body) => {
  const { supabase } = client([]);
  expect((await flashcard(request(body), ctx)).status).toBe(400);
  expect(supabase.from).not.toHaveBeenCalled();
});

it("rejects malformed JSON", async () => {
  client([]);
  expect(
    (
      await flashcard(
        new Request("http://localhost/api", { method: "POST", body: "{" }),
        ctx,
      )
    ).status,
  ).toBe(400);
});

it.each([
  [null, 404],
  [{ finished_at: "2026-10-08" }, 409],
] as const)(
  "rejects absent or finished review session %#",
  async (session, status) => {
    const { chains } = client([
      { kind: "term", front: "Front", back: "Back" },
      session,
    ]);
    expect(
      (await flashcard(request({ answer: "Answer", sessionId }), ctx)).status,
    ).toBe(status);
    expect(chains[1].eq).toHaveBeenCalledWith("user_id", userId);
    expect(markFlashcard).not.toHaveBeenCalled();
    expect(admin().from).not.toHaveBeenCalled();
  },
);

it("stores an AI review against the caller and returns the card back", async () => {
  client([
    { kind: "term", front: "Front", back: "Back" },
    {
      finished_at: null,
      kind: "flashcards",
      config: { mode: "test", card_ids: ["id"] },
    },
  ]);
  vi.mocked(markFlashcard).mockResolvedValue({ mark: 1, reason: "Correct" });
  const insertChain = adminQuery({ id: "review" });
  const insert = insertChain.insert;
  const progress = adminQuery(null);
  vi.mocked(admin().from)
    .mockReturnValueOnce(insertChain as never)
    .mockReturnValueOnce(adminQuery({ id: "review" }) as never)
    .mockReturnValueOnce(adminQuery({ interval_days: 3, reviews: 2 }) as never)
    .mockReturnValueOnce(progress as never);
  const response = await flashcard(
    request({ answer: "Answer", sessionId }),
    ctx,
  );
  expect(await response.json()).toEqual({
    mark: 1,
    reason: "Correct",
    back: "Back",
    local: false,
    reviewId: "review",
    source: "ai",
  });
  expect(progress.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: userId,
      flashcard_id: "id",
      interval_days: 8,
      last_mark: 1,
      reviews: 3,
      due_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }),
    { onConflict: "user_id,flashcard_id" },
  );
  expect(insert).toHaveBeenCalledWith({
    flashcard_id: "id",
    user_id: userId,
    session_id: sessionId,
    answer: "Answer",
    answer_mode: "typed",
    source: "ai",
    mark: 1,
    reason: "Correct",
  });
});

it("rejects an image path outside the caller's storage folder", async () => {
  client([{ image_paths: ["another-user/image.jpg"], status: "pending" }]);
  expect((await transcribe(request(), ctx)).status).toBe(400);
  expect(admin().storage.from).not.toHaveBeenCalled();
});

it("rejects photo pages when any page is outside the caller's folder", async () => {
  client([
    {
      image_paths: [`${userId}/page-1.jpg`, "another-user/page-2.jpg"],
      status: "pending",
    },
  ]);
  expect((await transcribe(request(), ctx)).status).toBe(400);
  expect(admin().storage.from).not.toHaveBeenCalled();
});

it("does not reopen a marked attempt for transcription", async () => {
  client([{ image_paths: [`${userId}/image.jpg`], status: "marked" }]);
  expect((await transcribe(request(), ctx)).status).toBe(409);
  expect(admin().storage.from).not.toHaveBeenCalled();
});

it("downloads handwriting and saves the transcript for confirmation", async () => {
  client([
    {
      image_paths: [`${userId}/image.png`],
      status: "pending",
      question_id: "q",
      question: { type: "short", stem: "Explain" },
      session: { kind: "sprint" },
    },
    { stem: "Explain" },
  ]);
  const download = vi.fn().mockResolvedValue({
    data: new Blob(["image"], { type: "image/png" }),
    error: null,
  });
  vi.mocked(admin().storage.from).mockReturnValue({ download } as never);
  const update = vi.fn();
  const save = {
    update,
    eq: vi.fn(),
    in: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ error: null }),
  };
  update.mockReturnValue(save);
  save.eq.mockReturnValue(save);
  save.in.mockReturnValue(save);
  vi.mocked(admin().from).mockReturnValue(save as never);
  const result = {
    transcript: "Written answer",
    lines: ["Written answer"],
    notes: "",
  };
  vi.mocked(transcribeImage).mockResolvedValue(result);
  expect(await (await transcribe(request(), ctx)).json()).toEqual(result);
  expect(admin().storage.from).toHaveBeenCalledWith("answers");
  expect(download).toHaveBeenCalledWith(`${userId}/image.png`);
  expect(update).toHaveBeenCalledWith({
    transcript: "Written answer",
    status: "transcribed",
  });
});

it("returns only the score and summary for an owned session", async () => {
  const { chains } = client([
    {
      id: "id",
      session_id: sessionId,
      session: { finished_at: "2026-10-08" },
      question: { type: "mcq" },
    },
  ]);
  vi.mocked(finishSession).mockResolvedValue({
    score: 3,
    max_score: 4,
    summary: null,
    user_id: userId,
  });
  expect(await (await finish(request(), ctx)).json()).toEqual({
    score: 3,
    max_score: 4,
    summary: null,
    finished: true,
  });
  expect(chains[0].eq).toHaveBeenCalledWith("user_id", userId);
});

it("returns a generic failure if marking throws", async () => {
  client([
    {
      id: "id",
      session_id: sessionId,
      session: { finished_at: "2026-10-08" },
      question: { type: "mcq" },
    },
  ]);
  vi.mocked(markAttempt).mockRejectedValue(new Error("Internal details"));
  const response = await mark(request(), ctx);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Could not mark answer" });
});

it("returns 409 when an owned attempt is already being marked", async () => {
  client([
    {
      id: "id",
      session_id: sessionId,
      session: { finished_at: "2026-10-08" },
      question: { type: "mcq" },
    },
  ]);
  const error = new AlreadyMarking();
  vi.mocked(markAttempt).mockRejectedValue(error);
  const response = await mark(request(), ctx);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: error.message });
  expect(markAttempt).toHaveBeenCalledExactlyOnceWith("id");
});

it("prevents marking multiple choice before finishing", async () => {
  client([
    {
      session_id: sessionId,
      session: { finished_at: null },
      question: { type: "mcq" },
    },
  ]);
  expect((await mark(request(), ctx)).status).toBe(409);
  expect(markAttempt).not.toHaveBeenCalled();
  expect(rescoreSession).not.toHaveBeenCalled();
});
it("check mode marks multiple choice early and returns key and explanation", async () => {
  client([
    {
      session_id: sessionId,
      question_id: "q1",
      session: { finished_at: null, config: { feedback: "each" } },
      question: { type: "mcq" },
    },
  ]);
  vi.mocked(markAttempt).mockResolvedValue({
    mark: 0,
    max_marks: 1,
    band: null,
    feedback: { correct_index: 2, chosen_index: 1 },
    status: "marked",
  } as never);
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { explanation: "Because C." } }),
  };
  vi.mocked(admin().from).mockReturnValue(chain as never);
  const response = await mark(request(), ctx);
  expect(await response.json()).toMatchObject({
    mark: 0,
    correct_index: 2,
    explanation: "Because C.",
  });
  expect(chain.eq).toHaveBeenCalledWith("id", "q1");
  // Deterministic: no AI rate limit, and no rescore before finish.
  expect(assertStudentAiRateLimit).not.toHaveBeenCalled();
  expect(rescoreSession).not.toHaveBeenCalled();
});
it("rescores a finished session after a retry", async () => {
  client([
    {
      session_id: sessionId,
      session: { finished_at: "2026-10-08" },
      question: { type: "short" },
    },
  ]);
  vi.mocked(markAttempt).mockResolvedValue({
    mark: 2,
    status: "marked",
  } as never);
  expect((await mark(request(), ctx)).status).toBe(200);
  expect(rescoreSession).toHaveBeenCalledWith(sessionId);
});
it("marks written answers in progress without rescoring", async () => {
  client([
    {
      session_id: sessionId,
      session: { finished_at: null },
      question: { type: "short" },
    },
  ]);
  vi.mocked(markAttempt).mockResolvedValue({
    mark: 2,
    status: "marked",
  } as never);
  expect((await mark(request(), ctx)).status).toBe(200);
  expect(rescoreSession).not.toHaveBeenCalled();
});

function adminQuery(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    neq: vi.fn(),
    in: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    range: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data }),
  };
  for (const key of [
    "select",
    "eq",
    "not",
    "neq",
    "in",
    "order",
    "limit",
    "maybeSingle",
    "single",
    "insert",
    "upsert",
    "update",
    "range",
  ] as const)
    chain[key].mockReturnValue(chain);
  return chain;
}
it("does not reschedule a recycled AI review", async () => {
  client([
    { kind: "term", front: "Front", back: "Back" },
    {
      finished_at: null,
      kind: "flashcards",
      config: { mode: "test", card_ids: ["id"] },
    },
  ]);
  vi.mocked(markFlashcard).mockResolvedValue({ mark: 1, reason: "Correct" });
  vi.mocked(admin().from)
    .mockReturnValueOnce(adminQuery({ id: "repeat" }) as never)
    .mockReturnValueOnce(adminQuery({ id: "first" }) as never);
  expect(
    (await flashcard(request({ answer: "Answer", sessionId }), ctx)).status,
  ).toBe(200);
  expect(admin().from).toHaveBeenCalledTimes(2);
  expect(admin().from).not.toHaveBeenCalledWith("flashcard_progress");
});
it("schedules a new AI card from its first review", async () => {
  client([
    { kind: "term", front: "Front", back: "Back" },
    {
      finished_at: null,
      kind: "flashcards",
      config: { mode: "test", card_ids: ["id"] },
    },
  ]);
  vi.mocked(markFlashcard).mockResolvedValue({ mark: 0.5, reason: "Partial" });
  const save = adminQuery(null);
  for (const chain of [
    adminQuery({ id: "first" }),
    adminQuery({ id: "first" }),
    adminQuery(null),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  expect(
    (await flashcard(request({ answer: "Answer", sessionId }), ctx)).status,
  ).toBe(200);
  expect(save.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: userId,
      flashcard_id: "id",
      interval_days: 1,
      last_mark: 0.5,
      reviews: 1,
    }),
    { onConflict: "user_id,flashcard_id" },
  );
});
it.each([
  { kind: "sprint", config: { mode: "test", card_ids: ["id"] } },
  { kind: "flashcards", config: { mode: "study", card_ids: ["id"] } },
  { kind: "flashcards", config: { mode: "test", card_ids: ["other"] } },
])(
  "rejects cards outside an active test before calling AI %#",
  async (session) => {
    client([
      { kind: "term", front: "Front", back: "Back" },
      { finished_at: null, ...session },
    ]);
    expect(
      (await flashcard(request({ answer: "Answer", sessionId }), ctx)).status,
    ).toBe(400);
    expect(markFlashcard).not.toHaveBeenCalled();
  },
);

it("returns 429 when the student AI rate limit is hit on mark", async () => {
  client([
    {
      id: "id",
      session_id: sessionId,
      session: { finished_at: null },
      question: { type: "short" },
    },
  ]);
  vi.mocked(assertStudentAiRateLimit).mockResolvedValueOnce({
    ok: false,
    error: "You're going a bit fast, try again in a minute",
    retryAfterSec: 60,
  });
  const response = await mark(request(), ctx);
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({
    error: "You're going a bit fast, try again in a minute",
  });
  expect(markAttempt).not.toHaveBeenCalled();
});

it("overrides only the caller's review and replays first-review schedules without adding a review", async () => {
  const reviewId = "00000000-0000-4000-8000-000000000001";
  client([
    { kind: "term", front: "Front", back: "Back" },
    {
      kind: "flashcards",
      finished_at: null,
      config: { mode: "test", card_ids: ["id"] },
    },
  ]);
  const update = adminQuery({ id: reviewId });
  const history = adminQuery([
    {
      id: "old",
      session_id: "old-session",
      mark: 1,
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: reviewId,
      session_id: sessionId,
      mark: 0.5,
      created_at: "2026-10-08T00:00:00Z",
    },
    {
      id: "repeat",
      session_id: sessionId,
      mark: 1,
      created_at: "2026-10-08T01:00:00Z",
    },
  ]);
  const progress = adminQuery(null);
  vi.mocked(admin().from)
    .mockReturnValueOnce(update as never)
    .mockReturnValueOnce(history as never)
    .mockReturnValueOnce(progress as never);
  const response = await flashcard(
    request({ sessionId, override: { reviewId, mark: 0.5 } }),
    ctx,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    reviewId,
    mark: 0.5,
    source: "self",
  });
  expect(update.eq).toHaveBeenCalledWith("user_id", userId);
  expect(update.eq).toHaveBeenCalledWith("session_id", sessionId);
  expect(update.eq).toHaveBeenCalledWith("flashcard_id", "id");
  expect(history.not).toHaveBeenCalledWith("session_id", "is", null);
  expect(progress.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      interval_days: 4,
      reviews: 2,
      last_mark: 0.5,
      due_on: "2026-10-12",
    }),
    { onConflict: "user_id,flashcard_id" },
  );
  expect(markFlashcard).not.toHaveBeenCalled();
  expect(update.insert).not.toHaveBeenCalled();
});
it.each([null, { finished_at: "2026-10-08" }])(
  "rejects overrides in missing or finished sessions",
  async (session) => {
    client([{ kind: "term", front: "Front", back: "Back" }, session]);
    const response = await flashcard(
      request({ sessionId, override: { reviewId: sessionId, mark: 0 } }),
      ctx,
    );
    expect(response.status).toBe(session ? 409 : 404);
    expect(admin().from).not.toHaveBeenCalled();
    expect(markFlashcard).not.toHaveBeenCalled();
  },
);
it("rejects an override whose review is not owned or belongs to another session", async () => {
  client([
    { kind: "term", front: "Front", back: "Back" },
    {
      kind: "flashcards",
      finished_at: null,
      config: { mode: "test", card_ids: ["id"] },
    },
  ]);
  const update = adminQuery(null);
  vi.mocked(admin().from).mockReturnValueOnce(update as never);
  expect(
    (
      await flashcard(
        request({ sessionId, override: { reviewId: sessionId, mark: 1 } }),
        ctx,
      )
    ).status,
  ).toBe(404);
  expect(admin().from).toHaveBeenCalledTimes(1);
});

const paperConfig = {
  time_limit_min: 180,
  reading_min: 5,
  strict: true,
  sections: [
    { position: 24, section: "III", choice_group: 1 },
    { position: 25, section: "III", choice_group: 1 },
  ],
};
const paperAttempts = [24, 25].map((position) => ({
  id: String(position),
  position,
  choice_index: null,
  answer_text: "Draft answer",
  transcript: null,
  question: { marks: 20 },
}));
it("requires a paper choice and does not trust an early automatic flag", async () => {
  client([
    {
      id: "id",
      kind: "paper",
      config: paperConfig,
      started_at: new Date().toISOString(),
      finished_at: null,
    },
  ]);
  vi.mocked(admin().from).mockReturnValueOnce(
    adminQuery(paperAttempts) as never,
  );
  expect((await finish(request({ automatic: true }), ctx)).status).toBe(400);
  expect(markAttempt).not.toHaveBeenCalled();
  expect(finishSession).not.toHaveBeenCalled();
});
it("accepts an expired paper, skips the other choice, and scores only chosen rows", async () => {
  client([
    {
      id: "id",
      kind: "paper",
      config: paperConfig,
      started_at: "2020-01-01T00:00:00Z",
      finished_at: null,
    },
  ]);
  const skip = adminQuery(null);
  const save = adminQuery(null);
  for (const chain of [
    adminQuery(paperAttempts),
    skip,
    adminQuery([{ id: "24", status: "pending", question: { marks: 20 } }]),
    adminQuery([
      {
        id: "24",
        status: "marked",
        mark: 12,
        max_marks: 20,
        question: { marks: 20 },
      },
    ]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  vi.mocked(markAttempt).mockResolvedValue({
    status: "marked",
    mark: 12,
    max_marks: 20,
  } as never);
  const response = await finish(request(), ctx);
  expect(await response.json()).toEqual({
    finished: true,
    score: 12,
    max_score: 20,
    summary: expect.objectContaining({
      strengths: expect.any(Array),
      improvements: expect.any(Array),
      next_steps: expect.any(Array),
    }),
  });
  expect(skip.in).toHaveBeenCalledWith("id", ["25"]);
  expect(skip.update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "skipped", max_marks: 0 }),
  );
  expect(markAttempt).toHaveBeenCalledExactlyOnceWith("24");
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      score: 12,
      max_score: 20,
      finished_at: expect.any(String),
    }),
  );
  expect(finishSession).not.toHaveBeenCalled();
});
it("honours the selected paper draft without marking its alternative", async () => {
  client([
    {
      id: "id",
      kind: "paper",
      config: paperConfig,
      started_at: new Date().toISOString(),
      finished_at: null,
    },
  ]);
  const skip = adminQuery(null);
  for (const chain of [
    adminQuery(paperAttempts),
    skip,
    adminQuery([{ id: "25", status: "pending", question: { marks: 20 } }]),
    adminQuery([
      {
        id: "25",
        status: "marked",
        mark: 0,
        max_marks: 20,
        question: { marks: 20 },
      },
    ]),
    adminQuery(null),
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  expect((await finish(request({ choices: { 1: 25 } }), ctx)).status).toBe(200);
  expect(markAttempt).toHaveBeenCalledExactlyOnceWith("25");
  expect(skip.in).toHaveBeenCalledWith("id", ["24"]);
});
it("transcribes every photo page in its saved order", async () => {
  client([
    {
      image_paths: [`${userId}/2.png`, `${userId}/1.png`],
      status: "pending",
      question_id: "q",
      question: { type: "short", stem: "Explain" },
      session: { kind: "sprint" },
    },
    { stem: "Explain" },
  ]);
  const download = vi.fn().mockResolvedValue({
    data: new Blob(["image"], { type: "image/png" }),
    error: null,
  });
  vi.mocked(admin().storage.from).mockReturnValue({ download } as never);
  const save = adminQuery(null);
  vi.mocked(admin().from).mockReturnValue(save as never);
  vi.mocked(transcribeImage)
    .mockResolvedValueOnce({
      transcript: "Second page",
      lines: ["Second page"],
      notes: "",
    })
    .mockResolvedValueOnce({
      transcript: "First page",
      lines: ["First page"],
      notes: "Check",
    });
  expect(await (await transcribe(request(), ctx)).json()).toEqual({
    transcript: "Second page\n\nFirst page",
    lines: ["Second page", "First page"],
    notes: "Check",
  });
  expect(download.mock.calls).toEqual([
    [`${userId}/2.png`],
    [`${userId}/1.png`],
  ]);
});

it.each([
  ["short", "sprint", 4, 3],
  ["extended", "sprint", 9, 8],
  ["short", "paper", 9, 8],
])(
  "enforces the %s %s photo limit before AI calls",
  async (type, kind, count, limit) => {
    client([
      {
        status: "pending",
        image_paths: Array.from(
          { length: count as number },
          (_, i) => `${userId}/${i}.png`,
        ),
        question: { type },
        session: { kind },
      },
    ]);
    const response = await transcribe(request(), ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: `Upload up to ${limit} pages per question.`,
    });
    expect(transcribeImage).not.toHaveBeenCalled();
    expect(assertStudentAiRateLimit).not.toHaveBeenCalled();
  },
);
it("retries failed paper marking once, logs rejection, and scores the retry", async () => {
  client([
    {
      kind: "paper",
      config: paperConfig,
      started_at: new Date().toISOString(),
      finished_at: null,
    },
  ]);
  const save = adminQuery(null);
  for (const chain of [
    adminQuery(paperAttempts),
    adminQuery(null),
    adminQuery([{ id: "24", status: "pending", question: { marks: 20 } }]),
    adminQuery([{ id: "24", status: "failed", question: { marks: 20 } }]),
    adminQuery([
      {
        id: "24",
        status: "marked",
        mark: 15,
        max_marks: 20,
        question: { marks: 20 },
      },
    ]),
    save,
  ])
    vi.mocked(admin().from).mockReturnValueOnce(chain as never);
  const error = new Error("Temporary marking failure");
  vi.mocked(markAttempt)
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce({ status: "marked" } as never);
  const response = await finish(request({ choices: { 1: 24 } }), ctx);
  expect(await response.json()).toEqual({
    score: 15,
    max_score: 20,
    finished: true,
    summary: expect.objectContaining({
      strengths: expect.any(Array),
      improvements: expect.any(Array),
      next_steps: expect.any(Array),
    }),
  });
  expect(vi.mocked(markAttempt).mock.calls).toEqual([["24"], ["24"]]);
  expect(console.error).toHaveBeenCalledWith(error);
});

it("marks a nullable-question single session through the same marking endpoint", async () => {
  const { markOwnCheck } = await import("@/lib/single-check-marking");
  const config = {
    question: {
      stem: "Explain inflation.",
      marks: 4,
      verb: "explain",
      topic_id: null,
      criteria_text: null,
    },
  };
  client([
    {
      session_id: singleSessionId,
      question_id: null,
      question: null,
      session: {
        kind: "single",
        started_at: singleStarted,
        finished_at: "2026-10-09",
        config,
      },
    },
  ]);
  vi.mocked(admin().from).mockReturnValue(adminQuery(null) as never);
  vi.mocked(markOwnCheck).mockResolvedValue({
    mark: 3,
    max_marks: 4,
    status: "marked",
    feedback: null,
  } as never);
  expect((await mark(request(), ctx)).status).toBe(200);
  expect(markOwnCheck).toHaveBeenCalledWith("id", userId, config);
  expect(markAttempt).not.toHaveBeenCalled();
  expect(rescoreSession).not.toHaveBeenCalled();
  expect(admin().from).toHaveBeenCalledWith("sessions");
});
it("refuses marking at the AI budget without invoking the engine", async () => {
  vi.mocked(admin().from).mockReturnValue(adminQuery(null) as never);
  client([
    {
      session_id: singleSessionId,
      question: { type: "short" },
      session: {
        kind: "single",
        started_at: singleStarted,
        finished_at: singleStarted,
      },
    },
  ]);
  vi.mocked(admin().rpc).mockResolvedValue({ data: 90, error: null } as never);
  const response = await mark(request(), ctx);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("Marking is paused"),
  });
  expect(markAttempt).not.toHaveBeenCalled();
});
it("handles an own-question photo without dereferencing a bank row", async () => {
  client([
    {
      session_id: singleSessionId,
      question_id: null,
      question: null,
      status: "pending",
      image_paths: [`${userId}/1.png`],
      session: {
        kind: "single",
        started_at: singleStarted,
        config: { question: { stem: "Explain inflation." } },
      },
    },
  ]);
  const download = vi.fn().mockResolvedValue({
    data: new Blob(["image"], { type: "image/png" }),
    error: null,
  });
  vi.mocked(admin().storage.from).mockReturnValue({ download } as never);
  vi.mocked(admin().from).mockReturnValue(adminQuery(null) as never);
  vi.mocked(transcribeImage).mockResolvedValue({
    transcript: "Some answer",
    lines: ["Some answer"],
    notes: "",
  });
  expect((await transcribe(request(), ctx)).status).toBe(200);
  expect(transcribeImage).toHaveBeenCalledWith(
    expect.any(ArrayBuffer),
    "image/png",
    "Explain inflation.",
    userId,
  );
});
it("allows up to eight pages for a short single check", async () => {
  client([
    {
      session_id: singleSessionId,
      question_id: null,
      question: null,
      status: "pending",
      image_paths: Array.from({ length: 9 }, (_, i) => `${userId}/${i}.png`),
      session: {
        kind: "single",
        started_at: singleStarted,
        config: { question: { stem: "Explain inflation." } },
      },
    },
  ]);
  const response = await transcribe(request(), ctx);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "Upload up to 8 pages per question.",
  });
  expect(transcribeImage).not.toHaveBeenCalled();
});

it("rejects unsubmitted single checks before any AI or rate-limit call", async () => {
  client([
    {
      session_id: singleSessionId,
      question: null,
      session: { kind: "single", started_at: singleStarted, finished_at: null },
    },
  ]);
  expect((await mark(request(), ctx)).status).toBe(409);
  expect(markAttempt).not.toHaveBeenCalled();
  expect(assertStudentAiRateLimit).not.toHaveBeenCalled();
});
it("rejects single sessions created outside the daily reservation path", async () => {
  client([
    {
      session_id: sessionId,
      question: null,
      session: {
        kind: "single",
        started_at: singleStarted,
        finished_at: singleStarted,
      },
    },
  ]);
  expect((await mark(request(), ctx)).status).toBe(404);
  expect(markAttempt).not.toHaveBeenCalled();
  expect(assertStudentAiRateLimit).not.toHaveBeenCalled();
});

it("keeps single checks out of the generic finish engine", async () => {
  client([{ kind: "single", finished_at: null }]);
  expect((await finish(request(), ctx)).status).toBe(409);
  expect(finishSession).not.toHaveBeenCalled();
  expect(markAttempt).not.toHaveBeenCalled();
});
it("rejects an unreserved single photo before downloading or transcribing", async () => {
  client([
    {
      session_id: sessionId,
      status: "pending",
      image_paths: [`${userId}/1.png`],
      question: null,
      session: {
        kind: "single",
        started_at: singleStarted,
        config: { question: { stem: "Explain inflation." } },
      },
    },
  ]);
  expect((await transcribe(request(), ctx)).status).toBe(404);
  expect(transcribeImage).not.toHaveBeenCalled();
  expect(admin().storage.from).not.toHaveBeenCalled();
});
it("validates every stored photo before spending on transcription", async () => {
  client([
    {
      status: "pending",
      image_paths: [`${userId}/1.png`, `${userId}/2.png`],
      question: { type: "short", stem: "Explain inflation." },
      session: { kind: "sprint" },
    },
  ]);
  const download = vi
    .fn()
    .mockResolvedValueOnce({ data: new Blob(["photo"], { type: "image/png" }) })
    .mockResolvedValueOnce({ data: new Blob(["bad"], { type: "text/plain" }) });
  vi.mocked(admin().storage.from).mockReturnValue({ download } as never);
  expect((await transcribe(request(), ctx)).status).toBe(400);
  expect(transcribeImage).not.toHaveBeenCalled();
});

it("persists the unreadable state for a single photo with no usable transcript", async () => {
  client([
    {
      session_id: singleSessionId,
      status: "pending",
      image_paths: [`${userId}/1.png`],
      question: null,
      session: {
        kind: "single",
        started_at: singleStarted,
        config: { question: { stem: "Explain inflation." } },
      },
    },
  ]);
  const download = vi
    .fn()
    .mockResolvedValue({ data: new Blob(["photo"], { type: "image/png" }) });
  vi.mocked(admin().storage.from).mockReturnValue({ download } as never);
  const save = adminQuery(null);
  vi.mocked(admin().from).mockReturnValue(save as never);
  vi.mocked(transcribeImage).mockResolvedValue({
    transcript: "",
    lines: [],
    notes: "",
  });
  expect(await (await transcribe(request(), ctx)).json()).toMatchObject({
    status: "unreadable",
    unreadable: true,
  });
  expect(save.update).toHaveBeenCalledWith({
    transcript: "",
    status: "unreadable",
  });
});

it("checks the AI rate limit again before transcribing another page", async () => {
  client([
    {
      status: "pending",
      image_paths: [`${userId}/1.png`, `${userId}/2.png`],
      question: { type: "short", stem: "Explain inflation." },
      session: { kind: "sprint" },
    },
  ]);
  const download = vi
    .fn()
    .mockResolvedValue({ data: new Blob(["photo"], { type: "image/png" }) });
  vi.mocked(admin().storage.from).mockReturnValue({ download } as never);
  vi.mocked(assertStudentAiRateLimit)
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({
      ok: false,
      error: "You're going a bit fast, try again in a minute",
      retryAfterSec: 60,
    });
  vi.mocked(transcribeImage).mockResolvedValue({
    transcript: "First page",
    lines: ["First page"],
    notes: "",
  });
  expect((await transcribe(request(), ctx)).status).toBe(429);
  expect(transcribeImage).toHaveBeenCalledTimes(1);
});

it("rejects transcription of a submitted single before any AI call", async () => {
  client([
    {
      session_id: singleSessionId,
      status: "pending",
      image_paths: [`${userId}/page.png`],
      question: { type: "short", stem: "Explain" },
      session: {
        kind: "single",
        started_at: singleStarted,
        finished_at: singleStarted,
      },
    },
  ]);
  expect((await transcribe(request(), ctx)).status).toBe(409);
  expect(transcribeImage).not.toHaveBeenCalled();
  expect(assertStudentAiRateLimit).not.toHaveBeenCalled();
  expect(admin().storage.from).not.toHaveBeenCalled();
});

it("marks a bank single through the single pipeline and rescores its one question", async () => {
  const { markBankCheck } = await import("@/lib/single-check-marking");
  client([
    {
      session_id: singleSessionId,
      question_id: "q",
      question: { type: "short" },
      session: {
        kind: "single",
        started_at: singleStarted,
        finished_at: singleStarted,
      },
    },
  ]);
  vi.mocked(admin().from).mockReturnValue(adminQuery(null) as never);
  vi.mocked(markBankCheck).mockResolvedValue({
    mark: 3,
    max_marks: 4,
    status: "marked",
    feedback: null,
  } as never);
  expect((await mark(request(), ctx)).status).toBe(200);
  expect(markBankCheck).toHaveBeenCalledWith("id", userId, "q");
  expect(markAttempt).not.toHaveBeenCalled();
  expect(rescoreSession).not.toHaveBeenCalled();
});
