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
import { drainPersistRating, rateFlashcard, startFlashcards } from "./actions";
function query(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    like: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
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
    "or",
    "in",
    "lte",
    "order",
    "limit",
    "range",
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
function liveCards(n = 24) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    topic_id: "t3-inflation",
    kind: "term",
    owner_id: null,
    status: "live",
  }));
}
it("starts a default study deck without legacy mode, type or topic fields", async () => {
  const cards = query(liveCards());
  const session = query({ id: sessionId });
  const db = client(cards, query([]), session);
  await expect(startFlashcards({}, new FormData())).rejects.toThrow(
    `redirect:/student/flashcards/${sessionId}`,
  );
  expect(db.from.mock.calls).toEqual([
    ["flashcards"],
    ["flashcard_progress"],
    ["sessions"],
  ]);
  expect(cards.eq).toHaveBeenCalledWith("status", "live");
  expect(cards.or).toHaveBeenCalledWith("owner_id.is.null,owner_id.eq.user");
  expect(session.insert.mock.calls[0][0].config).toMatchObject({
    mode: "study",
    kinds: ["term", "stat"],
  });
  expect(session.insert.mock.calls[0][0].config.card_ids).toHaveLength(20);
});
it("keeps the home due path and filters out future progress", async () => {
  const session = query({ id: sessionId });
  const progress = query([
    { flashcard_id: "c0", due_on: "2000-01-01", reviews: 1 },
    { flashcard_id: "c1", due_on: "2999-01-01", reviews: 1 },
  ]);
  client(query(liveCards(2)), progress, session);
  const form = new FormData();
  form.set("due", "1");
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(progress.eq).toHaveBeenCalledWith("user_id", "user");
  expect(session.insert.mock.calls[0][0].config.card_ids).toEqual(["c0"]);
});
it("returns an empty-deck error without inserting", async () => {
  const db = client(query([]), query([]), query([]));
  expect(await startFlashcards({}, new FormData())).toEqual({
    error: expect.stringContaining("No cards match"),
  });
  expect(db.from).not.toHaveBeenCalledWith("sessions");
});
it("can restart authorised selected missed cards in study mode", async () => {
  const session = query({ id: sessionId });
  client(query(liveCards(2)), query([]), session);
  const form = new FormData();
  form.append("card_ids", "c0");
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(session.insert.mock.calls[0][0].config.card_ids).toEqual(["c0"]);
});
it("rederives JSON deck ids and stores all controls, excluding foreign and retired cards", async () => {
  const session = query({ id: sessionId });
  client(
    query([
      ...liveCards(4),
      { ...liveCards(1)[0], id: "foreign", owner_id: "other" },
    ]),
    query([]),
    session,
  );
  const config = {
    mode: "test",
    kinds: ["term"],
    source: "both",
    topics: ["t3"],
    subtopics: ["t3-inflation"],
    which: "all",
    size: 2,
    order: "topic",
    repeat_missed: false,
    answer_by: "typing",
  };
  const form = new FormData();
  form.set(
    "config",
    JSON.stringify({ ...config, card_ids: ["foreign", "retired"] }),
  );
  form.append("card_ids", "foreign");
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(session.insert.mock.calls[0][0].config).toEqual({
    ...config,
    card_ids: ["c0", "c1"],
  });
});
it.each(["{", "null", JSON.stringify({ mode: "study", size: 201 })])(
  "rejects malformed JSON config %s before reading the bank",
  async (config) => {
    const db = client();
    const form = new FormData();
    form.set("config", config);
    expect(await startFlashcards({}, form)).toEqual({
      error: expect.stringContaining("valid deck"),
    });
    expect(db.from).not.toHaveBeenCalled();
  },
);
it("returns a friendly query failure and creates no session", async () => {
  const db = client(query([], { message: "failure" }), query([]), query([]));
  expect(await startFlashcards({}, new FormData())).toEqual({
    error: expect.stringContaining("Could not load"),
  });
  expect(db.from).not.toHaveBeenCalledWith("sessions");
});
it("loads cards beyond the first API page before deriving the deck", async () => {
  const first = query(liveCards(500));
  const second = query([{ ...liveCards(1)[0], id: "last-page-card" }]);
  const session = query({ id: sessionId });
  client(first, query([]), second, session);
  const form = new FormData();
  form.set(
    "config",
    JSON.stringify({
      mode: "study",
      kinds: ["term", "stat"],
      source: "both",
      topics: [],
      subtopics: [],
      which: "all",
      size: "all",
      order: "topic",
      repeat_missed: true,
      answer_by: "either",
    }),
  );
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(first.range).toHaveBeenCalledWith(0, 499);
  expect(second.range).toHaveBeenCalledWith(500, 999);
  expect(session.insert.mock.calls[0][0].config.card_ids).toHaveLength(501);
  expect(session.insert.mock.calls[0][0].config.card_ids).toContain(
    "last-page-card",
  );
});
it("uses progress for missed cards without loading review history", async () => {
  const progress = query([
    {
      flashcard_id: "c0",
      last_mark: 0,
      reviews: 1,
      updated_at: "2026-10-09",
      due_on: "2999-01-01",
    },
  ]);
  const session = query({ id: sessionId });
  const db = client(query(liveCards(2)), progress, session);
  const form = new FormData();
  form.set(
    "config",
    JSON.stringify({
      mode: "study",
      kinds: ["term", "stat"],
      source: "both",
      topics: [],
      subtopics: [],
      which: "missed",
      size: 20,
      order: "topic",
      repeat_missed: true,
      answer_by: "either",
    }),
  );
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(progress.eq).toHaveBeenCalledWith("user_id", "user");
  expect(db.from).not.toHaveBeenCalledWith("flashcard_reviews");
  expect(session.insert.mock.calls[0][0].config.card_ids).toEqual(["c0"]);
});
it.each([
  null,
  { finished_at: "2026-10-08", config: { mode: "study", card_ids: ["c"] } },
])(
  "rejects missing or finished sessions before inserting reviews %#",
  async (session) => {
    const owned = query(session);
    const db = client(owned);
    await expect(rateFlashcard(sessionId, "c", 1)).rejects.toThrow(
      /reset or expired|already finished|not available/i,
    );
    expect(owned.eq).toHaveBeenCalledWith("user_id", "user");
    expect(db.from).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { finished_at: null, config: { mode: "invalid", card_ids: ["c"] } },
  { finished_at: null, config: { mode: "study", card_ids: ["other"] } },
])(
  "rejects invalid study sessions before inserting reviews %#",
  async (session) => {
    const owned = query(session);
    const db = client(owned);
    await expect(rateFlashcard(sessionId, "c", 1)).rejects.toThrow(
      "active flashcard session",
    );
    expect(owned.eq).toHaveBeenCalledWith("user_id", "user");
    expect(owned.eq).toHaveBeenCalledWith("kind", "flashcards");
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
    answer_mode: "typed",
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

it("retries all 200 posted legacy cards", async () => {
  const session = query({ id: sessionId });
  client(query(liveCards(200)), query([]), session);
  const form = new FormData();
  for (const card of liveCards(200)) form.append("card_ids", card.id);
  await expect(startFlashcards({}, form)).rejects.toThrow("redirect:");
  expect(session.insert.mock.calls[0][0].config.card_ids).toHaveLength(200);
  expect(session.insert.mock.calls[0][0].config.size).toBe("all");
});

it.each([
  { answer: 3 },
  { answer: "x".repeat(1001) },
  { answerMode: "invalid" },
  { sessionId: "invalid" },
])("drops malformed durable ratings %j before querying", async (invalid) => {
  const db = client();
  expect(
    await drainPersistRating({
      sessionId,
      cardId: "c",
      mark: 1,
      ...invalid,
    } as never),
  ).toBe("missing");
  expect(db.from).not.toHaveBeenCalled();
});
