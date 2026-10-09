// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn() };
  return { admin: () => client };
});
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { loadQueue, loadReview } from "./data";

function query(data: unknown, count: number | null = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    rpc: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data, count }),
  };
  for (const key of [
    "select",
    "eq",
    "in",
    "gte",
    "order",
    "range",
    "maybeSingle",
    "single",
  ] as const)
    chain[key].mockReturnValue(chain);
  return chain;
}
function client(rows: ReturnType<typeof query>[], rpc?: unknown) {
  const db = {
    from: vi.fn(),
    rpc: vi.fn().mockReturnValue(query(rpc ?? null)),
    storage: { from: vi.fn() },
  };
  for (const row of rows) db.from.mockReturnValueOnce(row);
  vi.mocked(createClient).mockResolvedValue(db as never);
  return db;
}
const counts = () => [query(null, 2), query(null, 1), query(null, 3)];
const reviewId = "9c4d0f2e-7a1b-4c3d-8e5f-0a1b2c3d4e5f";
beforeEach(() => vi.resetAllMocks());

it("lists open reviews oldest first with student, question and mark columns", async () => {
  const reviews = query([
    {
      id: "r1",
      attempt_id: "a1",
      user_id: "u1",
      created_at: "2026-10-01T00:00:00Z",
      reason: "check_disagreed",
      ai_mark: 3,
      check_mark: 4,
      student_note: null,
      student: { full_name: "Priya Sharma" },
      attempt: {
        question: {
          type: "extended",
          source: "2023 HSC Q24",
          stem: "Discuss.",
          marks: 8,
          topic_id: "t3-inflation",
        },
      },
    },
    {
      id: "r2",
      attempt_id: "a2",
      user_id: "u2",
      created_at: "2026-10-02T00:00:00Z",
      reason: "student_dispute",
      ai_mark: 2,
      check_mark: null,
      student_note: "Please look again.",
      student: null,
      attempt: { question: null },
    },
  ]);
  const topics = query([{ id: "t3", parent_id: null, name: "Inflation" }]);
  const db = client([...counts(), reviews, topics]);
  const result = await loadQueue("open");
  expect(db.from.mock.calls.map((c) => c[0])).toEqual([
    "mark_reviews",
    "attempts",
    "mark_reviews",
    "mark_reviews",
    "topics",
  ]);
  expect(result.counts).toEqual([2, 1, 3]);
  expect(reviews.eq).toHaveBeenCalledWith("status", "open");
  expect(reviews.gte).not.toHaveBeenCalled();
  expect(reviews.order.mock.calls).toEqual([["created_at"], ["id"]]);
  expect(reviews.range).toHaveBeenCalledWith(0, 999);
  expect(result.rows).toEqual([
    expect.objectContaining({
      id: "r1",
      attemptId: "a1",
      userId: "u1",
      name: "Priya Sharma",
      reason: "check_disagreed",
      source: "2023 HSC Q24",
      stem: "Discuss.",
      type: "extended",
      topic: "t3-inflation",
      marks: 8,
      ai: 3,
      check: 4,
      note: null,
    }),
    expect.objectContaining({
      id: "r2",
      name: "Student",
      source: "Own question",
      type: "short",
      marks: null,
      check: null,
      note: "Please look again.",
    }),
  ]);
  expect(result.topics).toEqual([
    { id: "t3", parent_id: null, name: "Inflation" },
  ]);
});

it("resolved tab limits to the last 30 days and reads past the first page", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-09T00:00:00.000Z") });
  const row = (i: number) => ({
    id: `r${i}`,
    attempt_id: `a${i}`,
    user_id: "u",
    created_at: "2026-10-01T00:00:00Z",
    reason: "spot_check",
    ai_mark: 1,
    check_mark: null,
    student_note: null,
    student: null,
    attempt: null,
  });
  const first = query(Array.from({ length: 1000 }, (_, i) => row(i)));
  const second = query([row(1000)]);
  client([...counts(), first, second, query([])]);
  const { rows } = await loadQueue("resolved");
  expect(first.eq).toHaveBeenCalledWith("status", "resolved");
  expect(first.gte).toHaveBeenCalledWith(
    "resolved_at",
    "2026-09-09T00:00:00.000Z",
  );
  expect(second.range).toHaveBeenCalledWith(1000, 1999);
  expect(rows).toHaveLength(1001);
  vi.useRealTimers();
});

it("failed tab lists failed and unreadable attempts with signed photo links", async () => {
  const attempts = query([
    {
      id: "a1",
      user_id: "u1",
      created_at: "2026-10-01T00:00:00Z",
      status: "unreadable",
      mark: null,
      image_paths: ["u1/p1.jpg", "u1/p2.jpg"],
      question: {
        type: "short",
        source: "2022 HSC Q21",
        stem: "Explain.",
        marks: 4,
        topic_id: "t3",
      },
      student: { full_name: "Sam" },
    },
    {
      id: "a2",
      user_id: "u2",
      created_at: "2026-10-02T00:00:00Z",
      status: "failed",
      mark: null,
      image_paths: null,
      question: null,
      student: null,
    },
  ]);
  const db = client([...counts(), attempts, query([])]);
  const createSignedUrls = vi.fn().mockResolvedValue({
    data: [
      { path: "u1/p1.jpg", signedUrl: "https://s/1" },
      { path: "u1/p2.jpg", signedUrl: null },
    ],
    error: null,
  });
  db.storage.from.mockReturnValue({ createSignedUrls });
  const { rows } = await loadQueue("failed");
  expect(db.from.mock.calls[3][0]).toBe("attempts");
  expect(attempts.in).toHaveBeenCalledWith("status", ["failed", "unreadable"]);
  expect(attempts.gte).toHaveBeenCalledWith("created_at", expect.any(String));
  expect(db.storage.from).toHaveBeenCalledWith("answers");
  expect(createSignedUrls).toHaveBeenCalledWith(
    ["u1/p1.jpg", "u1/p2.jpg"],
    3600,
  );
  expect(rows).toEqual([
    expect.objectContaining({
      id: "a1",
      attemptId: "a1",
      reason: "unreadable",
      name: "Sam",
      source: "2022 HSC Q21",
      photos: ["https://s/1"],
    }),
    expect.objectContaining({
      id: "a2",
      reason: "failed",
      name: "Student",
      source: "Own question",
      photos: [],
    }),
  ]);
});

it("loadReview rejects non-uuid ids before querying and returns null for unknown reviews", async () => {
  expect(await loadReview("1; drop table")).toBeNull();
  expect(createClient).not.toHaveBeenCalled();
  const db = client([query(null)]);
  expect(await loadReview(reviewId)).toBeNull();
  expect(db.from).toHaveBeenCalledTimes(1);
});

it("loadReview joins criteria, guideline notes and the student's name, and falls back to the own-question config", async () => {
  const attempt = {
    id: "a1",
    session_id: "s1",
    question_id: "q1",
    user_id: "u1",
    question: { type: "short", source: "HSC", stem: "Explain.", marks: 4 },
  };
  const review = {
    id: reviewId,
    attempt_id: "a1",
    user_id: "u1",
    resolved_by: "admin-1",
  };
  client(
    [
      query(review),
      query(attempt),
      query({ full_name: "Priya Sharma" }),
      query({ full_name: "Om" }),
      query({
        kind: "sprint",
        started_at: "2026-10-01",
        finished_at: "2026-10-01",
        config: {},
      }),
    ],
    [
      {
        attempt_id: "a1",
        criteria: [{ min: 3, max: 4, descriptor: "Sound" }],
        sample_answer: "Model answer.",
      },
    ],
  );
  const notes = query({ guideline_notes: "Reward two causes." });
  const svc = admin() as unknown as { from: ReturnType<typeof vi.fn> };
  svc.from.mockReturnValueOnce(notes);
  const loaded = await loadReview(reviewId);
  expect(loaded).toMatchObject({
    name: "Priya Sharma",
    fullName: "Priya Sharma",
    resolver: "Om",
    attempt: {
      question: {
        source: "HSC",
        criteria: [{ min: 3, max: 4, descriptor: "Sound" }],
        sample_answer: "Model answer.",
        guideline_notes: "Reward two causes.",
      },
    },
  });
  // Guideline notes are column-protected, so they come through the service client.
  expect(svc.from).toHaveBeenCalledWith("questions");
  expect(notes.eq).toHaveBeenCalledWith("id", "q1");

  client([
    query({ ...review, resolved_by: null }),
    query({ ...attempt, question_id: null, question: null, max_marks: 5 }),
    query(null),
    query({
      kind: "sprint",
      started_at: "2026-10-01",
      finished_at: null,
      config: {
        question: {
          stem: "My own question",
          marks: 5,
          criteria_text: "Two causes.",
        },
      },
    }),
  ]);
  const own = await loadReview(reviewId);
  expect(svc.from).toHaveBeenCalledTimes(1);
  expect(own).toMatchObject({
    name: "Student",
    fullName: null,
    resolver: "Admin",
    attempt: {
      question: {
        type: "short",
        source: "Own question",
        stem: "My own question",
        marks: 5,
        criteria: [],
        guideline_notes: "Two causes.",
      },
    },
  });
});
