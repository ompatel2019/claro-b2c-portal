import { modes, type Mode } from "./practice";

/** §3.2 Topic Sprint setup: the config sent to sprint_pool / start_sprint. */
export type History =
  "prefer_new" | "new_only" | "mistakes" | "flagged" | "any";
export type Difficulty = "foundation" | "standard" | "challenging";
export type SetupConfig = {
  mode: Mode;
  include_extended: boolean;
  topics: string[];
  subtopics: string[];
  size_by: "marks" | "questions";
  target: number;
  difficulty: Difficulty[];
  verbs: string[];
  year_from: number | null;
  year_to: number | null;
  origins: ("nesa" | "a1")[];
  history: History;
  order: "exam" | "shuffled";
  timed: boolean;
  pace: "hsc" | "relaxed" | "custom";
  custom_minutes: number;
  on_timeout: "overtime" | "finish";
  feedback: "end" | "each";
};
export type Pool = {
  questions: number;
  marks: number;
  any: number;
  new: number;
  mistakes: number;
  flagged: number;
  topics: Record<string, number>;
  subtopics: Record<string, number>;
  all_subtopics: number;
  verbs: Record<string, number>;
  difficulty: Partial<Record<Difficulty, number>>;
  all_years: number;
  years: [number, number];
  trial: boolean;
};

type Size = { min: number; max: number; step: number; presets: number[] };
export const SIZES: Record<string, Size> = {
  "mcq:questions": { min: 5, max: 40, step: 1, presets: [10, 20, 30, 40] },
  "short:marks": { min: 10, max: 60, step: 5, presets: [15, 30, 45, 60] },
  "short:questions": { min: 2, max: 15, step: 1, presets: [3, 5, 8, 10] },
  "extended:questions": { min: 1, max: 3, step: 1, presets: [1, 2, 3] },
  "mixed:marks": { min: 20, max: 100, step: 5, presets: [30, 45, 60, 80, 100] },
};
const DEFAULT_SIZE: Record<string, number> = {
  "mcq:questions": 20,
  "short:marks": 30,
  "short:questions": 5,
  "extended:questions": 1,
  "mixed:marks": 45,
};
export const size = (c: Pick<SetupConfig, "mode" | "size_by">) =>
  SIZES[`${c.mode}:${c.size_by}`];

export const DEFAULTS: SetupConfig = {
  mode: "mcq",
  include_extended: false,
  topics: [],
  subtopics: [],
  size_by: "questions",
  target: 20,
  difficulty: [],
  verbs: [],
  year_from: null,
  year_to: null,
  origins: [],
  history: "prefer_new",
  order: "exam",
  timed: true,
  pace: "hsc",
  custom_minutes: 45,
  on_timeout: "overtime",
  feedback: "end",
};

/** Switching type resets size to that type's default; MC and extended drop written-only filters. */
export function withMode(c: SetupConfig, mode: Mode): SetupConfig {
  const size_by = mode === "short" || mode === "mixed" ? "marks" : "questions";
  const written = mode === "short" || mode === "mixed";
  return {
    ...c,
    mode,
    size_by,
    target: DEFAULT_SIZE[`${mode}:${size_by}`],
    include_extended: mode === "mixed" && c.include_extended,
    difficulty: written ? c.difficulty : [],
    verbs: written ? c.verbs : [],
  };
}
export function withSizeBy(c: SetupConfig, size_by: SetupConfig["size_by"]) {
  return { ...c, size_by, target: DEFAULT_SIZE[`${c.mode}:${size_by}`] };
}
export function clampTarget(c: SetupConfig, n: number) {
  const s = size(c);
  return Math.min(s.max, Math.max(s.min, Math.round(n)));
}

/** HSC pace: MC 1 min a question, short 1.5 min a mark, extended 35 min each. */
export function estimateMinutes(c: SetupConfig): number | null {
  if (!c.timed) return null;
  if (c.pace === "custom") return c.custom_minutes;
  const base =
    c.mode === "mcq"
      ? c.target
      : c.mode === "extended"
        ? 35 * c.target
        : c.mode === "short"
          ? c.size_by === "marks"
            ? 1.5 * c.target
            : 1.5 * 3 * c.target // about 3 marks a question
          : Math.round(c.target * 0.4) +
            1.5 * (c.target - Math.round(c.target * 0.4)) +
            (c.include_extended ? 35 : 0);
  return Math.round(base * (c.pace === "relaxed" ? 1.5 : 1));
}

/** Count of "More filters" in use, for the collapsed header. */
export const filtersOn = (c: SetupConfig) =>
  [
    c.difficulty.length,
    c.verbs.length,
    c.year_from ?? c.year_to,
    c.origins.length,
  ].filter(Boolean).length;

const HISTORY: History[] = [
  "prefer_new",
  "new_only",
  "mistakes",
  "flagged",
  "any",
];
const list = (v: string | null) =>
  v ? [...new Set(v.split(",").filter(Boolean))] : [];

/** URL prefill (type, topics, sub, history, verb, size) wins over the saved setup. */
export function fromParams(
  p: Record<string, string | undefined>,
  base: SetupConfig,
): SetupConfig | null {
  if (!["type", "topics", "sub", "history", "verb", "size"].some((k) => p[k]))
    return null;
  let c = { ...base };
  if (p.type && p.type in modes) c = withMode(c, p.type as Mode);
  if (p.topics !== undefined || p.sub !== undefined) {
    // Old links pass a subtopic in topics ("t3-inflation"): it implies its parent.
    const ids = [...list(p.topics ?? null), ...list(p.sub ?? null)];
    const subtopics = ids.filter((id) => id.includes("-"));
    const topics = [
      ...new Set(ids.map((id) => id.split("-")[0]).filter(Boolean)),
    ].slice(0, 2);
    c = {
      ...c,
      topics,
      subtopics: subtopics.filter((s) => topics.includes(s.split("-")[0])),
    };
  }
  if (HISTORY.includes(p.history as History)) c.history = p.history as History;
  if (p.verb && c.mode !== "mcq" && c.mode !== "extended")
    c.verbs = list(p.verb);
  if (p.size && Number.isFinite(Number(p.size)))
    c.target = clampTarget(c, Number(p.size));
  return c;
}

/** Keeps only known keys with valid values, so an old or edited saved setup can't break the page. */
export function restore(saved: unknown): SetupConfig {
  if (!saved || typeof saved !== "object") return DEFAULTS;
  const s = saved as Partial<SetupConfig>;
  const mode = s.mode && s.mode in modes ? s.mode : DEFAULTS.mode;
  let c = withMode({ ...DEFAULTS, ...s, mode }, mode);
  if (s.size_by && SIZES[`${mode}:${s.size_by}`]) c = withSizeBy(c, s.size_by);
  if (typeof s.target === "number") c.target = clampTarget(c, s.target);
  return c;
}

export const HISTORY_LABELS: Record<History, string> = {
  prefer_new: "Prefer new",
  new_only: "New only",
  mistakes: "Mistakes only",
  flagged: "Flagged only",
  any: "Any",
};

/** Summary line 1: "20 questions · 20 marks · 20 min · Economic Issues (Inflation) · 2018–2025 · Prefer new". */
export function summary(
  c: SetupConfig,
  names: Record<string, string>,
  years: [number, number] | null,
) {
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const size =
    c.mode === "mcq"
      ? `${n(c.target, "question")} · ${n(c.target, "mark")}`
      : c.mode === "extended"
        ? `${n(c.target, "question")} · ${c.target * 20} marks`
        : c.size_by === "questions"
          ? n(c.target, "question")
          : `${n(c.target, "mark")}${c.include_extended ? " + 1 extended" : ""}`;
  const minutes = estimateMinutes(c);
  const topics = c.topics.length
    ? c.topics
        .map((t) => {
          const subs = c.subtopics.filter((s) => s.startsWith(`${t}-`));
          return subs.length
            ? `${names[t]} (${subs.map((s) => names[s]).join(", ")})`
            : names[t];
        })
        .join(" · ")
    : "Whole course";
  const from = c.year_from ?? years?.[0];
  const to = c.year_to ?? years?.[1];
  return [
    size,
    minutes === null ? "Untimed" : `${minutes} min`,
    topics,
    from && to ? (from === to ? `${from}` : `${from}–${to}`) : null,
    HISTORY_LABELS[c.history],
  ]
    .filter(Boolean)
    .join(" · ");
}
