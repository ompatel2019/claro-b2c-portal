// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { rateFlashcard, startFlashcards } from "./actions";
function query(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    like: vi.fn(),
    in: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  for (const key of [
    "select",
    "eq",
    "like",
    "in",
    "lte",
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
function client(...rows: ReturnType<typeof query>[]) {
  const db = { from: vi.fn() };
  for (const row of rows) db.from.mockReturnValueOnce(row);
  vi.mocked(createClient).mockResolvedValue(db as never);
  return db;
}
const sessionId = "75f2a40b-3e20-4a56-9e14-1b237cfc8396";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireProfile).mockResolvedValue({
    id: "user",
    role: "student",
  } as never);
});
it.each(["t3", "t3-inflation"])(
  "starts a shuffled deck with one card query filtered by %s",
  async (topic) => {
    const cards = query(
      Array.from({ length: 24 }, (_, i) => ({
        id: `c${i}`,
        topic_id: "t3-inflation",
        kind: "term",
      })),
    );
    const session = query({ id: sessionId });
    const db = client(cards, session);
    const form = new FormData();
    form.set("topic", topic);
    form.set("type", "term");
    await expect(startFlashcards({}, form)).rejects.toThrow(
      `redirect:/flashcards/${sessionId}`,
    );
    expect(db.from.mock.calls).toEqual([["flashcards"], ["sessions"]]);
    expect(cards.in).toHaveBeenCalledWith("kind", ["term"]);
    if (topic === "t3")
      expect(cards.like).toHaveBeenCalledWith("topic_id", "t3-%");
    else expect(cards.eq).toHaveBeenCalledWith("topic_id", topic);
    const config = session.insert.mock.calls[0][0].config;
    expect(config.card_ids).toHaveLength(20);
    expect(new Set(config.card_ids).size).toBe(20);
  },
);
it("loads due cards through progress joined to flashcards", async () => {
  const due = query([
    { card: { id: "c", topic_id: "t3-inflation", kind: "stat" } },
  ]);
  client(due, query({ id: sessionId }));
  const form = new FormData();
  form.set("due", "1");
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(due.select).toHaveBeenCalledWith(
    expect.stringContaining("flashcards!inner"),
  );
  expect(due.eq).toHaveBeenCalledWith("user_id", "user");
  expect(due.lte).toHaveBeenCalledWith(
    "due_on",
    expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  );
});
it("returns a friendly empty-deck error without creating a session", async () => {
  const db = client(query([]));
  expect(await startFlashcards({}, new FormData())).toEqual({
    error: expect.stringContaining("No cards match"),
  });
  expect(db.from).toHaveBeenCalledTimes(1);
});
it("can restart just the selected missed cards in study mode", async () => {
  const cards = query([{ id: "c", topic_id: "t3-inflation", kind: "term" }]);
  const session = query({ id: sessionId });
  client(cards, session);
  const form = new FormData();
  form.append("card_ids", "c");
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(cards.in).toHaveBeenCalledWith("id", ["c"]);
  expect(session.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({ mode: "study", card_ids: ["c"] }),
    }),
  );
});
it.each([
  null,
  { finished_at: "2026-10-08", config: { mode: "study", card_ids: ["c"] } },
  { finished_at: null, config: { mode: "test", card_ids: ["c"] } },
  { finished_at: null, config: { mode: "study", card_ids: ["other"] } },
])(
  "rejects invalid study sessions before inserting reviews %#",
  async (session) => {
    const owned = query(session);
    const db = client(owned);
    await expect(rateFlashcard(sessionId, "c", 1)).rejects.toThrow(
      "active study session",
    );
    expect(owned.eq).toHaveBeenCalledWith("user_id", "user");
    expect(owned.in).toHaveBeenCalledWith("kind", ["flashcards", "homework"]);
    expect(db.from).toHaveBeenCalledTimes(1);
  },
);
it("saves a self rating and schedules only the first review", async () => {
  const review = query({ id: "first" });
  const progress = query(null);
  client(
    query({
      kind: "flashcards",
      finished_at: null,
      config: { mode: "study", card_ids: ["c"] },
    }),
    review,
    query({ id: "first" }),
    query({ interval_days: 8, reviews: 4 }),
    progress,
  );
  await rateFlashcard(sessionId, "c", 0.5);
  expect(review.insert).toHaveBeenCalledWith({
    session_id: sessionId,
    flashcard_id: "c",
    answer: null,
    source: "self",
    mark: 0.5,
  });
  expect(progress.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: "user",
      interval_days: 10,
      last_mark: 0.5,
      reviews: 5,
    }),
    { onConflict: "user_id,flashcard_id" },
  );
});
it("does not advance the schedule on a recycled self rating", async () => {
  const db = client(
    query({
      kind: "flashcards",
      finished_at: null,
      config: { mode: "study", card_ids: ["c"] },
    }),
    query({ id: "repeat" }),
    query({ id: "first" }),
  );
  await rateFlashcard(sessionId, "c", 1);
  expect(db.from).not.toHaveBeenCalledWith("flashcard_progress");
});

it("checks homework membership before recording a self review", async () => {
  const owned = query({
    kind: "homework",
    finished_at: null,
    homework_set_id: "set",
    config: {},
  });
  const membership = query({ position: 1 });
  const review = query({ id: "repeat" });
  client(owned, membership, review, query({ id: "first" }));
  await rateFlashcard(sessionId, "c", 1);
  expect(membership.eq).toHaveBeenCalledWith("set_id", "set");
  expect(membership.eq).toHaveBeenCalledWith("flashcard_id", "c");
  expect(review.insert).toHaveBeenCalledWith(
    expect.objectContaining({ flashcard_id: "c", mark: 1, source: "self" }),
  );
});
it("rejects a flashcard outside the homework set without inserting a review", async () => {
  const db = client(
    query({
      kind: "homework",
      finished_at: null,
      homework_set_id: "set",
      config: {},
    }),
    query(null),
  );
  await expect(rateFlashcard(sessionId, "outside", 1)).rejects.toThrow(
    "active study session",
  );
  expect(db.from).toHaveBeenCalledTimes(2);
});
