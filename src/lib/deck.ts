import { z } from "zod";
import { shuffle, type FlashcardProgress } from "./flashcards";

const topicId = z.string().regex(/^t[1-4]$/);
const subtopicId = z.string().regex(/^t[1-4]-[a-z0-9-]+$/);
export const deckSchema = z.object({
  mode: z.enum(["study", "test"]),
  kinds: z
    .array(z.enum(["term", "stat"]))
    .min(1)
    .max(2)
    .transform((v) => [...new Set(v)]),
  source: z.enum(["claro", "my", "both"]),
  topics: z
    .array(topicId)
    .max(4)
    .transform((v) => [...new Set(v)]),
  subtopics: z
    .array(subtopicId)
    .max(200)
    .transform((v) => [...new Set(v)]),
  which: z.enum(["all", "due", "new", "missed"]),
  size: z.union([z.number().int().min(1).max(200), z.literal("all")]),
  order: z.enum(["shuffled", "topic"]),
  repeat_missed: z.boolean(),
  answer_by: z.enum(["typing", "speaking", "either"]),
});
export type DeckConfig = z.infer<typeof deckSchema>;
export type DeckCard = {
  id: string;
  topic_id: string;
  kind: "term" | "stat";
  owner_id: string | null;
};
export type DeckHistory = {
  progress: readonly FlashcardProgress[];
  today: string;
  userId: string;
};
export const DECK_DEFAULTS: DeckConfig = {
  mode: "study",
  kinds: ["term", "stat"],
  source: "both",
  topics: [],
  subtopics: [],
  which: "all",
  size: 20,
  order: "shuffled",
  repeat_missed: true,
  answer_by: "either",
};
export function clampDeckSize(size: number | "all", available: number) {
  return Math.min(
    available,
    size === "all"
      ? available
      : Math.max(
          1,
          Math.min(200, Math.trunc(Number.isFinite(size) ? size : 20)),
        ),
  );
}
/** Restore each valid field independently; old or malformed storage cannot poison a setup. */
export function restoreDeck(saved: unknown): DeckConfig {
  const result = { ...DECK_DEFAULTS };
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    return result;
  for (const key of Object.keys(deckSchema.shape) as (keyof DeckConfig)[]) {
    const parsed = deckSchema.shape[key].safeParse(
      (saved as Record<string, unknown>)[key],
    );
    if (parsed.success) Object.assign(result, { [key]: parsed.data });
  }
  return result;
}
export function filterDeck(
  cards: readonly DeckCard[],
  config: DeckConfig,
  history: DeckHistory,
) {
  const progress = new Map(history.progress.map((p) => [p.flashcard_id, p]));
  return cards.filter((card) => {
    if (card.owner_id !== null && card.owner_id !== history.userId)
      return false;
    if (!config.kinds.includes(card.kind)) return false;
    if (config.source === "my" && card.owner_id !== history.userId)
      return false;
    if (config.source === "claro" && card.owner_id !== null) return false;
    const parent = card.topic_id.split("-")[0];
    if (config.topics.length && !config.topics.includes(parent)) return false;
    const chosen = config.topics.length
      ? config.subtopics.filter((id) => id.startsWith(`${parent}-`))
      : config.subtopics;
    if (chosen.length && !chosen.includes(card.topic_id)) return false;
    const p = progress.get(card.id);
    switch (config.which) {
      case "due":
        return !!p && p.due_on <= history.today;
      case "new":
        return !p || p.reviews === 0;
      case "missed":
        return !!p && Number(p.last_mark) < 1;
      default:
        return true;
    }
  });
}
/** Faceted counts ignore only the control whose choices are being counted. */
export function deckCounts(
  cards: readonly DeckCard[],
  config: DeckConfig,
  history: DeckHistory,
) {
  const count = (patch: Partial<DeckConfig>) =>
    filterDeck(cards, { ...config, ...patch }, history).length;
  const subtopics: Record<string, number> = {};
  const topics: Record<string, number> = {};
  for (const id of new Set(cards.map((c) => c.topic_id))) {
    subtopics[id] = count({ topics: [], subtopics: [id] });
    const parent = id.split("-")[0];
    topics[parent] = count({ topics: [parent], subtopics: [] });
  }
  return {
    total: count({}),
    kinds: {
      term: count({ kinds: ["term"] }),
      stat: count({ kinds: ["stat"] }),
      both: count({ kinds: ["term", "stat"] }),
    },
    source: {
      claro: count({ source: "claro" }),
      my: count({ source: "my" }),
      both: count({ source: "both" }),
    },
    which: {
      all: count({ which: "all" }),
      due: count({ which: "due" }),
      new: count({ which: "new" }),
      missed: count({ which: "missed" }),
    },
    topics,
    subtopics,
  };
}
/** Select due, then never reviewed, then least recently seen before presentation ordering. */
export function selectDeck(
  cards: readonly DeckCard[],
  config: DeckConfig,
  history: DeckHistory,
  random = Math.random,
) {
  const progress = new Map(history.progress.map((p) => [p.flashcard_id, p]));
  const rank = (card: DeckCard) => {
    const p = progress.get(card.id);
    if (p && p.due_on <= history.today) return [0, p.due_on] as const;
    if (!p || p.reviews === 0) return [1, ""] as const;
    return [2, p?.updated_at ?? ""] as const;
  };
  const matching = filterDeck(cards, config, history).sort((a, b) => {
    const ar = rank(a),
      br = rank(b);
    return (
      ar[0] - br[0] || ar[1].localeCompare(br[1]) || a.id.localeCompare(b.id)
    );
  });
  const selected = matching.slice(
    0,
    clampDeckSize(config.size, matching.length),
  );
  return config.order === "shuffled"
    ? shuffle(selected, random)
    : selected.sort(
        (a, b) =>
          a.topic_id.localeCompare(b.topic_id) || a.id.localeCompare(b.id),
      );
}
