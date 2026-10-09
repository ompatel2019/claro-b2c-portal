// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => {
  const client = { from: vi.fn() };
  return { admin: () => client };
});
vi.mock("@/lib/marking/engine", () => ({
  markAttempt: vi.fn(),
  rescoreSession: vi.fn(),
}));
vi.mock("./data", () => ({ loadReview: vi.fn(), adjacentReview: vi.fn() }));
import { requireAdmin } from "@/lib/auth";
import { rescoreSession } from "@/lib/marking/engine";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { addSpotChecks, markManually, resolveReview } from "./actions";
import { adjacentReview, loadReview } from "./data";

function query(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    throwOnError: vi.fn(() =>
      error ? Promise.reject(error) : Promise.resolve({ data }),
    ),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  for (const key of [
    "select",
    "eq",
    "gte",
    "or",
    "order",
    "limit",
    "range",
    "maybeSingle",
    "single",
    "insert",
    "update",
    "upsert",
  ] as const)
    chain[key].mockReturnValue(chain);
  return chain;
}
function client(...rows: ReturnType<typeof query>[]) {
  const db = { from: vi.fn() };
  for (const row of rows) db.from.mockReturnValueOnce(row);
  vi.mocked(createClient).mockResolvedValue(db as never);
  return db;
}
function service(...rows: ReturnType<typeof query>[]) {
  const svc = admin() as unknown as { from: ReturnType<typeof vi.fn> };
  for (const row of rows) svc.from.mockReturnValueOnce(row);
  return svc;
}

const reviewId = "9c4d0f2e-7a1b-4c3d-8e5f-0a1b2c3d4e5f";
const attemptId = "75f2a40b-3e20-4a56-9e14-1b237cfc8396";
const answer =
  "Priya Sharma thinks inflation rose because demand grew. Email priya@example.com. Wages lagged.";
const raw = [
  {
    quote: "inflation rose",
    start: 20,
    kind: "fix",
    tag: "Evidence",
    body: "Give a CPI figure, Priya.",
    next_mark: "Quote the CPI.",
  },
  {
    quote: "demand grew",
    start: 43,
    kind: "strength",
    tag: "Knowledge",
    body: "Correct cause.",
    next_mark: null,
  },
  {
    quote: "",
    start: null,
    kind: "fix",
    tag: "Structure",
    body: "Add a conclusion.",
    next_mark: null,
  },
];
const criteria = [
  { min: 5, max: 6, descriptor: "Thorough" },
  { min: 3, max: 4, descriptor: "Sound" },
];
function loaded(
  overrides: Record<string, unknown> = {},
  attempt: Record<string, unknown> = {},
) {
  return {
    review: {
      id: reviewId,
      attempt_id: attemptId,
      user_id: "student",
      status: "open",
      reason: "check_disagreed",
      ai_mark: 3,
      check_mark: 4,
      final_mark: null,
      created_at: "2026-10-08T00:00:00.000Z",
      resolved_at: null,
      ...overrides,
    },
    attempt: {
      id: attemptId,
      user_id: "student",
      session_id: "session",
      question_id: "q1",
      marked_at: "2026-10-08T00:00:00.000Z",
      mark: 3,
      max_marks: 6,
      answer_text: answer,
      transcript: null,
      feedback: { comments: raw, justification: "Sound." },
      question: { type: "short", marks: 6, criteria },
      ...attempt,
    },
    name: "Priya Sharma",
    fullName: "Priya Sharma",
    resolver: "Admin",
    session: null,
  };
}
/** The editor's submission: comment 0 edited, 1 deleted, 2 kept, one added. */
function form(extra: Record<string, string> = {}) {
  const f = new FormData();
  f.set("mark", "4");
  f.set("admin_note", "Checked the CPI line.");
  f.set("next_mark_line", "Quote a CPI figure.");
  f.set(
    "comments",
    JSON.stringify([
      { ...raw[0], id: 0, body: "Give a CPI figure." },
      { ...raw[2], id: 2 },
      {
        id: -1,
        quote: "Wages lagged",
        start: answer.indexOf("Wages lagged"),
        kind: "strength",
        tag: "Analysis",
        body: "Links wages to prices.",
        next_mark: null,
      },
    ]),
  );
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    id: "admin-1",
    role: "admin",
    full_name: "Admin",
  } as never);
  vi.useRealTimers();
});

it("refuses to resolve a review that is already resolved", async () => {
  vi.mocked(loadReview).mockResolvedValue(
    loaded({
      status: "resolved",
      resolved_at: new Date(Date.now() - 120_000).toISOString(),
    }) as never,
  );
  const svc = service();
  expect(await resolveReview(reviewId, null, form())).toBe(
    "Resolved by another admin 2 min ago",
  );
  expect(svc.from).not.toHaveBeenCalled();
});

it("claims the review first and stops when another admin won the race", async () => {
  vi.mocked(loadReview)
    .mockResolvedValueOnce(loaded() as never)
    .mockResolvedValueOnce(
      loaded({
        status: "resolved",
        resolved_at: new Date().toISOString(),
      }) as never,
    );
  const claim = query([]);
  const svc = service(claim);
  expect(await resolveReview(reviewId, null, form())).toBe(
    "Resolved by another admin 0 min ago",
  );
  expect(svc.from.mock.calls).toEqual([["mark_reviews"]]);
  expect(claim.eq).toHaveBeenCalledWith("status", "open");
  expect(rescoreSession).not.toHaveBeenCalled();
});

it("resolves: attempt, rescore, anonymised example with rejected AI comments, then next review", async () => {
  vi.mocked(loadReview).mockResolvedValue(loaded() as never);
  const claim = query([{ id: reviewId }]);
  const attempt = query({ id: attemptId });
  const example = query(null);
  const svc = service(claim, attempt, example);
  const db = client();
  vi.mocked(adjacentReview).mockResolvedValue({ id: "next-review" });
  await expect(resolveReview(reviewId, null, form())).rejects.toThrow(
    `redirect:/admin/marking/review/next-review?notice=${encodeURIComponent("Resolved. Next review")}`,
  );
  expect(adjacentReview).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ id: reviewId }),
    "next",
  );
  expect(db.from).not.toHaveBeenCalled();
  expect(svc.from.mock.calls).toEqual([
    ["mark_reviews"],
    ["attempts"],
    ["marking_examples"],
  ]);
  expect(claim.update).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "resolved",
      final_mark: 4,
      admin_note: "Checked the CPI line.",
      resolved_by: "admin-1",
    }),
  );
  expect(claim.eq.mock.calls).toEqual([
    ["id", reviewId],
    ["status", "open"],
  ]);
  const saved = attempt.update.mock.calls[0][0];
  expect(saved).toMatchObject({
    mark: 4,
    band: "Sound",
    marked_by_model: "admin",
    check_status: "reviewed",
    status: "marked",
  });
  expect(saved.feedback.justification).toBe("Sound.");
  expect(saved.feedback.next_mark_line).toBe("Quote a CPI figure.");
  expect(saved.feedback.comments.map((c: { body: string }) => c.body)).toEqual([
    "Give a CPI figure.",
    "Links wages to prices.",
    "Add a conclusion.",
  ]);
  expect(saved.feedback.comments[2]).toBe(raw[2]);
  expect(saved.feedback.comments[1]).toMatchObject({
    start: answer.indexOf("Wages lagged"),
    tag: "Analysis",
  });
  expect(rescoreSession).toHaveBeenCalledWith("session");
  const [row, options] = example.upsert.mock.calls[0];
  expect(options).toEqual({
    onConflict: "source_hash",
    ignoreDuplicates: true,
  });
  expect(row).toMatchObject({
    question_id: "q1",
    tutor_mark: 4,
    band: "Sound",
    split: "example",
    origin: "admin_override",
    source_hash: createHash("sha256")
      .update(`admin_override:${attemptId}`)
      .digest("hex"),
  });
  expect(row.answer_text).toBe(
    "[name] [name] thinks inflation rose because demand grew. Email [email]. Wages lagged.",
  );
  expect(row.rejected_ai_comments).toEqual([
    { ...raw[0], body: "Give a CPI figure, [name]." },
    raw[1],
  ]);
  expect(
    row.accepted_tutor_comments.map((c: { body: string }) => c.body),
  ).toEqual([
    "Give a CPI figure.",
    "Links wages to prices.",
    "Add a conclusion.",
  ]);
  expect(JSON.stringify(row)).not.toMatch(/Priya|Sharma|example\.com/);
});

function unchanged() {
  const f = new FormData();
  f.set("unchanged", "yes");
  return f;
}

it("resolve unchanged keeps the stored comments and mark, wrapping to the oldest open review", async () => {
  vi.mocked(loadReview).mockResolvedValue(loaded() as never);
  const attempt = query({ id: attemptId });
  const example = query(null);
  service(query([{ id: reviewId }]), attempt, example);
  const oldest = query(null);
  const db = client(oldest);
  vi.mocked(adjacentReview).mockResolvedValue(null);
  await expect(resolveReview(reviewId, null, unchanged())).rejects.toThrow(
    "redirect:/admin/marking/review?notice=",
  );
  expect(db.from).toHaveBeenCalledWith("mark_reviews");
  expect(oldest.eq).toHaveBeenCalledWith("status", "open");
  expect(oldest.order.mock.calls).toEqual([["created_at"], ["id"]]);
  const saved = attempt.update.mock.calls[0][0];
  expect(saved.mark).toBe(3);
  expect(saved.feedback.comments).toBe(raw);
  expect(saved.feedback).not.toHaveProperty("next_mark_line");
  expect(example.upsert.mock.calls[0][0].rejected_ai_comments).toEqual([]);
});

it("resolve unchanged needs an explicit mark when the attempt has none", async () => {
  vi.mocked(loadReview).mockResolvedValue(
    loaded({ reason: "spot_check", ai_mark: null }, { mark: null }) as never,
  );
  const svc = service();
  expect(await resolveReview(reviewId, null, unchanged())).toBe(
    "This attempt has no mark. Choose an explicit final mark and use Resolve.",
  );
  expect(svc.from).not.toHaveBeenCalled();
});

it.each([
  ["mark", "7", "whole mark within"],
  ["admin_note", "x".repeat(1001), "at most 1,000"],
  ["comments", JSON.stringify([{ ...raw[0], id: 9 }]), "Invalid comment"],
  ["comments", "{", "Check comment bodies"],
])("rejects %s=%s before writing", async (key, value, message) => {
  vi.mocked(loadReview).mockResolvedValue(loaded() as never);
  const svc = service();
  expect(await resolveReview(reviewId, null, form({ [key]: value }))).toMatch(
    message,
  );
  expect(svc.from).not.toHaveBeenCalled();
});

it("only strips the student's real name: no name leaves 'student' alone, short tokens stay", async () => {
  const text =
    "A student thinks demand grew. Li and Sharma agree: Li is right. Email li@example.com.";
  const cases = [
    {
      fullName: null,
      name: "Student",
      expected:
        "A student thinks demand grew. Li and Sharma agree: Li is right. Email [email].",
    },
    {
      fullName: "Li Sharma",
      name: "Li Sharma",
      expected:
        "A student thinks demand grew. Li and [name] agree: Li is right. Email [email].",
    },
  ];
  for (const { fullName, name, expected } of cases) {
    vi.mocked(loadReview).mockResolvedValue({
      ...loaded({}, { answer_text: text }),
      fullName,
      name,
    } as never);
    const example = query(null);
    service(query([{ id: reviewId }]), query({ id: attemptId }), example);
    client(query(null));
    vi.mocked(adjacentReview).mockResolvedValue(null);
    await expect(resolveReview(reviewId, null, unchanged())).rejects.toThrow(
      "redirect:",
    );
    expect(example.upsert.mock.calls[0][0].answer_text).toBe(expected);
  }
});

it("reports a missing attempt before any write", async () => {
  vi.mocked(loadReview).mockResolvedValueOnce({
    ...loaded(),
    attempt: null,
  } as never);
  const svc = service();
  expect(await resolveReview(reviewId, null, form())).toBe("Attempt missing.");
  expect(svc.from).not.toHaveBeenCalled();
});

it("reopens the claimed review when a later write fails, and says so when reopening fails too", async () => {
  vi.mocked(loadReview).mockResolvedValue(loaded() as never);
  const reopen = query({ id: reviewId });
  const svc = service(
    query([{ id: reviewId }]),
    query(null, new Error("db down")),
    reopen,
  );
  expect(await resolveReview(reviewId, null, form())).toBe(
    "Could not resolve: saving the attempt failed. The review is open; try again.",
  );
  expect(rescoreSession).not.toHaveBeenCalled();
  expect(svc.from.mock.calls).toEqual([
    ["mark_reviews"],
    ["attempts"],
    ["mark_reviews"],
  ]);
  expect(reopen.update).toHaveBeenCalledWith({
    status: "open",
    final_mark: null,
    admin_note: null,
    resolved_by: null,
    resolved_at: null,
  });
  expect(reopen.eq.mock.calls).toEqual([
    ["id", reviewId],
    ["status", "resolved"],
    ["resolved_by", "admin-1"],
  ]);

  vi.mocked(rescoreSession).mockRejectedValueOnce(new Error("rescore down"));
  service(
    query([{ id: reviewId }]),
    query({ id: attemptId }),
    query(null, new Error("still down")),
  );
  expect(await resolveReview(reviewId, null, form())).toBe(
    "Could not reopen the review after rescoring the session failed. Reload the review before continuing.",
  );
  expect(svc.from).toHaveBeenCalledTimes(6);
});

it("adds 5 spot checks from agreed marks in the last 7 days, skipping attempts already under review", async () => {
  vi.useFakeTimers({ now: new Date("2026-10-09T12:00:00.000Z") });
  const candidates = query(
    Array.from({ length: 7 }, (_, i) => ({
      id: `a${i}`,
      user_id: `u${i}`,
      mark: i,
      marked_by_model: "model",
    })),
  );
  client(candidates);
  const inserts = [
    query(null),
    query(null, { code: "23505" }),
    query(null),
    query(null),
    query(null),
    query(null),
  ];
  const svc = service(...inserts);
  await expect(addSpotChecks()).rejects.toThrow(
    `redirect:/admin/marking/review?notice=${encodeURIComponent("Added 5 spot checks.")}`,
  );
  expect(candidates.eq.mock.calls).toEqual([
    ["status", "marked"],
    ["check_status", "agreed"],
  ]);
  expect(candidates.gte).toHaveBeenCalledWith(
    "marked_at",
    "2026-10-02T12:00:00.000Z",
  );
  expect(svc.from.mock.calls).toHaveLength(6);
  const rows = inserts.map((q) => q.insert.mock.calls[0][0]);
  expect(new Set(rows.map((r) => r.attempt_id)).size).toBe(6);
  for (const r of rows)
    expect(r).toMatchObject({
      reason: "spot_check",
      user_id: `u${r.attempt_id.slice(1)}`,
      ai_mark: Number(r.attempt_id.slice(1)),
      ai_model: "model",
    });
});

it("mark manually opens a spot check for a failed attempt, reusing an open one", async () => {
  client(
    query({
      id: attemptId,
      user_id: "student",
      status: "failed",
      mark: null,
      marked_by_model: null,
    }),
  );
  const insert = query({ id: "new-review" });
  service(insert);
  await expect(markManually(attemptId)).rejects.toThrow(
    "redirect:/admin/marking/review/new-review",
  );
  expect(insert.insert).toHaveBeenCalledWith({
    attempt_id: attemptId,
    user_id: "student",
    reason: "spot_check",
    ai_mark: null,
    ai_model: null,
  });
  client(
    query({ id: attemptId, user_id: "student", status: "unreadable" }),
    query({ id: "open-review" }),
  );
  service(query(null, { code: "23505" }));
  await expect(markManually(attemptId)).rejects.toThrow(
    "redirect:/admin/marking/review/open-review",
  );
  client(query({ id: attemptId, status: "marked" }));
  await expect(markManually(attemptId)).rejects.toThrow(
    "redirect:/admin/marking/review?tab=failed&notice=",
  );
});
