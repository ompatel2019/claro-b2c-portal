import { expect, it } from "vitest";
import {
  clampDeckSize,
  deckCounts,
  DECK_DEFAULTS,
  deckSchema,
  filterDeck,
  restoreDeck,
  selectDeck,
  type DeckCard,
  type DeckHistory,
} from "./deck";
const cards: DeckCard[] = [
  {
    id: "a",
    topic_id: "t3-inflation",
    kind: "term",
    owner_id: null,
  },
  {
    id: "b",
    topic_id: "t3-unemployment",
    kind: "stat",
    owner_id: "me",
  },
  {
    id: "c",
    topic_id: "t1-trade",
    kind: "term",
    owner_id: null,
  },
  {
    id: "d",
    topic_id: "t3-inflation",
    kind: "stat",
    owner_id: null,
  },
  {
    id: "foreign",
    topic_id: "t3-inflation",
    kind: "term",
    owner_id: "other",
  },
];
const history: DeckHistory = {
  today: "2026-10-09",
  userId: "me",
  progress: [
    {
      flashcard_id: "a",
      due_on: "2026-10-09",
      reviews: 1,
      last_mark: 1,
      interval_days: 3,
      updated_at: "2026-10-06",
    },
    {
      flashcard_id: "c",
      due_on: "2026-10-13",
      reviews: 2,
      last_mark: 1,
      interval_days: 4,
      updated_at: "2026-10-02",
    },
    {
      flashcard_id: "d",
      due_on: "2026-10-14",
      reviews: 1,
      last_mark: 0.5,
      interval_days: 5,
      updated_at: "2026-10-07",
    },
  ],
};
const ids = (patch: Partial<typeof DECK_DEFAULTS> = {}) =>
  filterDeck(cards, { ...DECK_DEFAULTS, ...patch }, history).map((c) => c.id);
it("only includes live shared and own cards", () =>
  expect(ids()).toEqual(["a", "b", "c", "d"]));
it.each([
  [{ source: "my" }, ["b"]],
  [{ source: "claro" }, ["a", "c", "d"]],
  [{ kinds: ["stat"] }, ["b", "d"]],
  [{ topics: ["t1"] }, ["c"]],
  [{ subtopics: ["t3-inflation"] }, ["a", "d"]],
  [{ topics: ["t1", "t3"], subtopics: ["t3-inflation"] }, ["a", "c", "d"]],
  [{ which: "due" }, ["a"]],
  [{ which: "new" }, ["b"]],
  [{ which: "missed" }, ["d"]],
] as const)("filters %j", (patch, expected) =>
  expect(ids(patch as Partial<typeof DECK_DEFAULTS>)).toEqual(expected),
);
it("treats zero-review progress as new and reads missed marks from progress", () => {
  const zero = {
    ...history,
    progress: history.progress.map((p) => ({ ...p, reviews: 0 })),
  };
  expect(
    filterDeck(cards, { ...DECK_DEFAULTS, which: "new" }, zero).map(
      (c) => c.id,
    ),
  ).toEqual(["a", "b", "c", "d"]);
  expect(ids({ which: "missed" })).toEqual(["d"]);
});
it("counts every control ignoring only its own filter", () => {
  expect(deckCounts(cards, DECK_DEFAULTS, history)).toEqual({
    total: 4,
    kinds: { term: 2, stat: 2, both: 4 },
    source: { claro: 3, my: 1, both: 4 },
    which: { all: 4, due: 1, new: 1, missed: 1 },
    topics: { t3: 3, t1: 1 },
    subtopics: { "t3-inflation": 2, "t3-unemployment": 1, "t1-trade": 1 },
  });
  const counts = deckCounts(
    cards,
    { ...DECK_DEFAULTS, kinds: ["term"], topics: ["t3"], which: "due" },
    history,
  );
  expect(counts.kinds).toEqual({ term: 1, stat: 0, both: 1 });
  expect(counts.which).toEqual({ all: 1, due: 1, new: 0, missed: 0 });
  expect(counts.subtopics["t1-trade"]).toBe(0);
});
it("selects due, new, then least recently seen before ordering the deck", () => {
  const config = { ...DECK_DEFAULTS, size: 3, order: "shuffled" as const };
  expect(
    selectDeck(cards, config, history, () => 0.999).map((c) => c.id),
  ).toEqual(["a", "b", "c"]);
  expect(
    selectDeck(cards, { ...config, order: "topic" }, history).map((c) => c.id),
  ).toEqual(["c", "a", "b"]);
  expect(selectDeck(cards, config, history, () => 0).map((c) => c.id)).toEqual([
    "b",
    "c",
    "a",
  ]);
  expect(cards.map((c) => c.id)).toEqual(["a", "b", "c", "d", "foreign"]);
});
it.each([
  [0, 64, 1],
  [201, 300, 200],
  [20, 4, 4],
  [20, 0, 0],
  ["all", 250, 250],
  [2.9, 4, 2],
  [NaN, 64, 20],
] as const)("clamps %s to availability %s", (size, n, result) =>
  expect(clampDeckSize(size, n)).toBe(result),
);
it("restores valid fields, defaults invalid fields, and drops unknown fields", () => {
  expect(restoreDeck(null)).toEqual(DECK_DEFAULTS);
  expect(restoreDeck([])).toEqual(DECK_DEFAULTS);
  expect(
    restoreDeck({
      mode: "test",
      size: 900,
      kinds: ["bad"],
      topics: ["bogus"],
      repeat_missed: false,
      unknown: 1,
    }),
  ).toEqual({ ...DECK_DEFAULTS, mode: "test", repeat_missed: false });
  expect(
    restoreDeck({ ...DECK_DEFAULTS, size: "all", answer_by: "typing" }),
  ).toEqual({ ...DECK_DEFAULTS, size: "all", answer_by: "typing" });
});
it("validates limits and ignores supplied IDs", () => {
  expect(deckSchema.safeParse({ ...DECK_DEFAULTS, size: 201 }).success).toBe(
    false,
  );
  expect(deckSchema.safeParse({ ...DECK_DEFAULTS, kinds: [] }).success).toBe(
    false,
  );
  expect(deckSchema.parse({ ...DECK_DEFAULTS, card_ids: ["foreign"] })).toEqual(
    DECK_DEFAULTS,
  );
});

it("normalises duplicate selections when validating or restoring", () => {
  expect(
    restoreDeck({
      kinds: ["term", "term"],
      topics: ["t3", "t3"],
      subtopics: ["t3-inflation", "t3-inflation"],
    }),
  ).toMatchObject({
    kinds: ["term"],
    topics: ["t3"],
    subtopics: ["t3-inflation"],
  });
});
