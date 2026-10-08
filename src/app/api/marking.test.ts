// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn(), storage: { from: vi.fn() } };
  return { admin: () => client };
});
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
  markAttempt: vi.fn(),
  rescoreSession: vi.fn(),
  transcribeImage: vi.fn(),
  markFlashcard: vi.fn(),
  finishSession: vi.fn(),
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
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data }),
  };
  for (const key of [
    "select",
    "eq",
    "order",
    "limit",
    "maybeSingle",
    "single",
    "insert",
    "upsert",
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
