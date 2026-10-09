/** Pure question-bank logic shared by the admin list, import review and editor (§4.4). */
import { z } from "zod";
import { modes } from "./practice";
export type { Criterion } from "./feedback";

export const REVIEW_THRESHOLD = 0.82;
export const QUESTION_FILTER_KEYS = [
  "q",
  "type",
  "topic",
  "from",
  "to",
  "origin",
  "verb",
  "marks",
  "missing",
] as const;

/** NESA glossary of key words (directive verbs). */
export const VERBS = [
  "Account",
  "Analyse",
  "Apply",
  "Appreciate",
  "Assess",
  "Calculate",
  "Clarify",
  "Classify",
  "Compare",
  "Construct",
  "Contrast",
  "Critically analyse",
  "Critically evaluate",
  "Deduce",
  "Define",
  "Demonstrate",
  "Describe",
  "Discuss",
  "Distinguish",
  "Evaluate",
  "Examine",
  "Explain",
  "Extract",
  "Extrapolate",
  "Identify",
  "Interpret",
  "Investigate",
  "Justify",
  "Outline",
  "Predict",
  "Propose",
  "Recall",
  "Recommend",
  "Recount",
  "Summarise",
  "Synthesise",
] as const;

export const TYPE_LABELS = {
  mcq: modes.mcq.label,
  short: modes.short.label,
  extended: modes.extended.label,
};
export const ORIGIN_LABELS = {
  nesa: "NESA",
  a1: "A1",
  claro: "Claro",
} as const;
export const COMPLETENESS = {
  explanation: "Missing explanation",
  sample: "Missing sample answer",
  criteria: "Missing criteria",
  stimulus: "Has stimulus",
} as const;

const YEAR_MAX = new Date().getFullYear();
export const criterionSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  descriptor: z.string().trim(),
});
type Criterion = z.infer<typeof criterionSchema>;

/** Every editor field; the publish rules (sample answer, explanation, bands) are checked separately. */
export const questionSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z0-9-]{3,40}$/,
        "Use 3–40 lower-case letters, digits or dashes.",
      ),
    type: z.enum(["mcq", "short", "extended"]),
    topic_id: z.string().min(1, "Choose a subtopic."),
    marks: z.number().int().min(1).max(20),
    verb: z.enum(VERBS).nullable(),
    source: z.string().trim().min(1, "Add a source label.").max(60),
    year: z.number().int().min(2000).max(YEAR_MAX),
    stem: z.string().trim().min(1, "Write the question.").max(4000),
    stimulus: z.string().trim().max(8000).nullable(),
    options: z.array(z.string().trim().max(500)).length(4).nullable(),
    correct_index: z.number().int().min(0).max(3).nullable(),
    explanation: z.string().trim().nullable(),
    criteria: z.array(criterionSchema).nullable(),
    guideline_notes: z.string().trim().nullable(),
    sample_answer: z.string().trim().nullable(),
    status: z.enum(["draft", "live", "retired"]),
  })
  .superRefine((q, ctx) => {
    if (q.type === "mcq") {
      if (!q.options || q.options.some((option) => !option))
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "All four options are required.",
        });
      if (q.correct_index === null)
        ctx.addIssue({
          code: "custom",
          path: ["correct_index"],
          message: "Pick the correct answer.",
        });
    }
    const [lo, hi] = marksRange(q.type);
    if (q.marks < lo || q.marks > hi)
      ctx.addIssue({
        code: "custom",
        path: ["marks"],
        message: `${TYPE_LABELS[q.type]} questions carry ${lo}–${hi} marks.`,
      });
  });
export type QuestionInput = z.infer<typeof questionSchema>;

/** Marks allowed per type: MC fixed 1, short 1–10, extended 10–20. */
export function marksRange(type: QuestionInput["type"]): [number, number] {
  return type === "mcq" ? [1, 1] : type === "short" ? [1, 10] : [10, 20];
}

/** "2024 HSC Q21(b)" → "2024-q21b". */
export function suggestId(source: string) {
  const year = source.match(/\b(19|20)\d{2}\b/)?.[0];
  const q = source.match(/Q\s*(\d+)\s*(?:\(?([a-z])\)?)?/i);
  const parts = [year, q && `q${q[1]}${q[2]?.toLowerCase() ?? ""}`].filter(
    Boolean,
  );
  const id = (
    parts.length
      ? parts.join("-")
      : source.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  )
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return id.length >= 3 ? id : "";
}

/**
 * Band rules: highest band first, integers 1…marks, no overlap, the top max =
 * marks, descriptors present. Returns an error per row (empty when fine) and a
 * summary line for the list.
 */
export function validateCriteria(criteria: Criterion[], marks: number) {
  const rows = criteria.map((c) => {
    if (!c.descriptor.trim()) return "Add a descriptor.";
    if (!Number.isInteger(c.min) || !Number.isInteger(c.max))
      return "Marks must be whole numbers.";
    if (c.min < 1 || c.max > marks) return `Marks must be 1 to ${marks}.`;
    if (c.min > c.max) return "Min must not exceed max.";
    return "";
  });
  let summary = "";
  if (!criteria.length) summary = "Add at least one band.";
  else if (rows.every((r) => !r)) {
    if (criteria[0].max !== marks)
      rows[0] = summary = `The top band must end at ${marks} marks.`;
    for (let i = 1; i < criteria.length; i++)
      if (criteria[i].max >= criteria[i - 1].min) {
        rows[i] = summary = "Bands must run highest first without overlapping.";
        break;
      }
  }
  return { rows, summary };
}

/** Everything that must hold before a question can be Live. */
export function publishProblems(q: QuestionInput) {
  const problems: string[] = [];
  const [lo, hi] = marksRange(q.type);
  if (q.marks < lo || q.marks > hi)
    problems.push(`${TYPE_LABELS[q.type]} questions carry ${lo}–${hi} marks.`);
  if (q.type === "mcq") {
    if (!q.options || q.options.some((o) => !o))
      problems.push("All four options are required.");
    if (q.correct_index == null) problems.push("Pick the correct answer.");
    if (!q.explanation) problems.push("Add an explanation.");
  } else {
    const bands = validateCriteria(q.criteria ?? [], q.marks);
    const bad = bands.rows.find(Boolean) ?? bands.summary;
    if (bad) problems.push(`Criteria: ${bad}`);
    if (!q.sample_answer) problems.push("Add a sample answer.");
  }
  return problems;
}

/** Word-level diff for side-by-side stems: which words of each side are not in the other. */
export function diffWords(a: string, b: string) {
  const x = a.match(/\S+\s*|\s+/g) ?? [];
  const y = b.match(/\S+\s*|\s+/g) ?? [];
  const n = x.length;
  const m = y.length;
  const lcs: Uint16Array[] = Array.from(
    { length: n + 1 },
    () => new Uint16Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] =
        x[i] === y[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const left: { text: string; changed: boolean }[] = [];
  const right: { text: string; changed: boolean }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      left.push({ text: x[i], changed: false });
      right.push({ text: y[j], changed: false });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1])
      left.push({ text: x[i++], changed: true });
    else right.push({ text: y[j++], changed: true });
  }
  while (i < n) left.push({ text: x[i++], changed: true });
  while (j < m) right.push({ text: y[j++], changed: true });
  return { left, right };
}
