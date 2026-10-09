import { z } from "zod";
import { MARK_MY_ANSWER_DAILY_LIMIT, WRITTEN_WORD_LIMIT } from "./limits";
import type { Attempt } from "./practice";

// NESA directive verbs; the marking prompt defines the common Economics verbs.
export const NESA_VERBS = [
  "account for",
  "analyse",
  "apply",
  "appreciate",
  "assess",
  "calculate",
  "clarify",
  "classify",
  "compare",
  "construct",
  "contrast",
  "critically analyse",
  "critically evaluate",
  "deduce",
  "define",
  "demonstrate",
  "describe",
  "discuss",
  "distinguish",
  "evaluate",
  "examine",
  "explain",
  "extract",
  "extrapolate",
  "identify",
  "interpret",
  "investigate",
  "justify",
  "outline",
  "predict",
  "propose",
  "recall",
  "recommend",
  "recount",
  "summarise",
  "synthesise",
] as const;
export function detectVerb(text: string) {
  const pattern = new RegExp(
    `\\b(${[...NESA_VERBS].sort((a, b) => b.length - a.length).join("|")})\\b`,
    "i",
  );
  return text.replace(/\s+/g, " ").match(pattern)?.[1].toLowerCase() ?? "";
}
export const ownQuestionSchema = z.object({
  stem: z
    .string()
    .trim()
    .min(10, "Use at least 10 characters for your question.")
    .max(3000, "Use no more than 3,000 characters."),
  marks: z.number().int().min(1).max(20),
  verb: z
    .string()
    .refine(
      (v) => !v || NESA_VERBS.includes(v as (typeof NESA_VERBS)[number]),
      "Choose a directive verb or Not sure.",
    ),
  topic_id: z.string().nullable(),
  criteria_text: z
    .string()
    .trim()
    .max(3000, "Use no more than 3,000 characters for guidelines.")
    .nullable()
    .transform((value) => value || null),
});
export type OwnQuestion = z.infer<typeof ownQuestionSchema>;
export type BankQuestion = Attempt["question"] & { verb: string | null };
export const singleConfig = (question: OwnQuestion) => ({
  question: ownQuestionSchema.parse(question),
});
export const checksLeft = (used: number) =>
  Math.max(0, MARK_MY_ANSWER_DAILY_LIMIT - Math.max(0, used));
export const sydneyDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
/** Sydney midnight, including the day of a daylight-saving transition. */
export function sydneyDayStart(now = new Date()) {
  const day = sydneyDay(now);
  const noon = new Date(`${day}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    timeZoneName: "longOffset",
  }).formatToParts(new Date(noon.getTime() - 12 * 3600000));
  const offset = parts
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  // Probe midnight using the offset before any 2 am DST change.
  const probe = new Date(`${day}T00:00:00${offset}`);
  const midnightOffset = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  return new Date(`${day}T00:00:00${midnightOffset}`).toISOString();
}
export function answerValid(
  answer: Pick<Attempt, "answer_text" | "transcript" | "image_paths">,
  confirmed: boolean,
) {
  const text = answer.transcript ?? answer.answer_text ?? "";
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    words > 0 &&
    words <= WRITTEN_WORD_LIMIT &&
    (!answer.image_paths?.length || (confirmed && !!answer.transcript?.trim()))
  );
}

/** Only server-reserved daily slots may invoke the single-check AI endpoints. */
export async function singleSlotIds(userId: string, now = new Date()) {
  return Promise.all(
    Array.from({ length: MARK_MY_ANSWER_DAILY_LIMIT }, async (_, slot) => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `claro.single:${userId}:${sydneyDay(now)}:${slot}`,
        ),
      );
      const hash = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    }),
  );
}

/** Bank filters use the topic relation, rather than assuming an ID naming scheme. */
export function filterBankQuestions(
  questions: BankQuestion[],
  topics: { id: string; parent_id: string | null }[],
  filters: { type: string; topic: string; year: string; search: string },
) {
  const terms = filters.search
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return questions.filter(
    (q) =>
      (filters.type === "all" || q.type === filters.type) &&
      (filters.topic === "all" ||
        q.topic_id === filters.topic ||
        topics.some(
          (t) => t.id === q.topic_id && t.parent_id === filters.topic,
        )) &&
      (filters.year === "all" || String(q.year) === filters.year) &&
      terms.every((term) =>
        `${q.stem} ${q.source} ${q.year ?? ""}`.toLowerCase().includes(term),
      ),
  );
}
