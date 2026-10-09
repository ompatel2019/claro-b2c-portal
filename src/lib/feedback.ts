import { orderedComments, type Comment } from "./practice";

/** claro-ml's comment tags (Comment["tag"]), for checking stored rows at runtime. */
export const TAGS = [
  "Verb",
  "Knowledge",
  "Evidence",
  "Analysis",
  "Terminology",
  "Structure",
] as const satisfies readonly Comment["tag"][];
export type Tag = Comment["tag"];

/**
 * Read-side §2.1 comment: claro-ml's Comment, except rows marked before the
 * shape change carry {type: strength|improvement, comment, line} and no tag;
 * they read as tag null.
 */
export type FeedbackComment = Omit<Comment, "tag"> & { tag: Tag | null };
export type Criterion = { min: number; max: number; descriptor: string };
export type MarkReview = {
  status: "open" | "resolved";
  reason: "check_disagreed" | "student_dispute" | "spot_check";
  ai_mark: number | null;
  check_mark: number | null;
  final_mark: number | null;
};
/** One row of session_review(): an attempt with its question and keys (finished sessions only). */
export type ReviewRow = {
  attempt_id: string;
  position: number;
  question_id: string | null;
  type: "mcq" | "short" | "extended";
  marks: number;
  stem: string;
  stimulus: string | null;
  options: string[] | null;
  source: string;
  topic_id: string | null;
  year: number | null;
  choice_index: number | null;
  answer_text: string | null;
  transcript: string | null;
  image_paths: string[] | null;
  flagged: boolean;
  status: string;
  check_status: string;
  mark: number | null;
  max_marks: number | null;
  band: string | null;
  feedback: Record<string, unknown> | null;
  correct_index: number | null;
  criteria: Criterion[] | null;
  sample_answer: string | null;
  explanation: string | null;
  review: MarkReview | null;
};

export type MarkingState =
  | "marking"
  | "marked"
  | "in_review"
  | "reviewed"
  | "failed"
  | "unreadable"
  | "not_answered"
  | "skipped";

/** The one UI state of an attempt, from attempts.status + check_status (§2.1). */
export function markingState(
  a: Pick<ReviewRow, "status" | "check_status" | "feedback">,
): MarkingState {
  if (a.status === "skipped") return "skipped";
  if (a.status === "failed") return "failed";
  if (a.status === "unreadable") return "unreadable";
  if (a.status !== "marked") return "marking";
  if (a.check_status === "pending") return "marking";
  if (a.feedback?.note === "No answer") return "not_answered";
  if (a.check_status === "in_review") return "in_review";
  if (a.check_status === "reviewed") return "reviewed";
  return "marked";
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/**
 * Normalises old and new comment shapes, drops anchors that no longer match the
 * answer text (they move to "Overall"), and orders them: by position, unanchored last.
 * `n` is the display number and `id` the stable index into feedback.comments.
 */
export function readComments(feedback: ReviewRow["feedback"], text: string) {
  const raw = Array.isArray(feedback?.comments) ? feedback.comments : [];
  const comments = raw.flatMap((r: Record<string, unknown>, id) => {
    const body = String(r?.body ?? r?.comment ?? "").trim();
    if (!body) return [];
    const quote = typeof r.quote === "string" ? r.quote : "";
    const start = num(r.start);
    const anchored =
      Number.isInteger(start) &&
      start >= 0 &&
      quote.length > 0 &&
      text.slice(start, start + quote.length) === quote;
    const kind: FeedbackComment["kind"] =
      (r.kind ?? r.type) === "strength" ? "strength" : "fix";
    return [
      {
        id,
        quote,
        start: anchored ? start : null,
        kind,
        tag: TAGS.includes(r.tag as Tag) ? (r.tag as Tag) : null,
        body,
        next_mark:
          kind === "fix" && typeof r.next_mark === "string" && r.next_mark
            ? r.next_mark
            : null,
      },
    ];
  });
  return orderedComments(comments).map(({ c }, i) => ({ ...c, n: i + 1 }));
}
export type NumberedComment = ReturnType<typeof readComments>[number];

/** "What gets you the next mark": the top fix's next_mark, else next_band. */
export function nextMarkLine(
  comments: NumberedComment[],
  feedback: ReviewRow["feedback"],
  full: boolean,
) {
  if (typeof feedback?.next_mark_line === "string")
    return feedback.next_mark_line;
  if (full) return "Full marks. Nothing missing.";
  const fix = comments.find((c) => c.kind === "fix" && c.next_mark);
  if (fix) return fix.next_mark;
  return typeof feedback?.next_band === "string" ? feedback.next_band : null;
}

/** The matched band row and its pill label, e.g. "Band: 4–5 marks". */
export function bandOf(criteria: Criterion[] | null, band: string | null) {
  const row = criteria?.find((c) => c.descriptor === band);
  if (!row) return null;
  const range = row.min === row.max ? `${row.min}` : `${row.min}–${row.max}`;
  return { row, label: `Band: ${range} ${row.max === 1 ? "mark" : "marks"}` };
}

/** Splits text so words the transcriber marked "word[?]" or "[?]" can be underlined. */
export function uncertainParts(text: string) {
  return text
    .split(/(\S*\[\?\])/g)
    .filter(Boolean)
    .map((part) => ({ text: part, uncertain: /\[\?\]$/.test(part) }));
}

/** "4 / 6", or a range "3–4 / 6" while a disagreement is being checked. */
export function markLabel(
  row: Pick<ReviewRow, "mark" | "max_marks" | "marks" | "review">,
  state: MarkingState,
) {
  const max = row.max_marks ?? row.marks;
  const r = row.review;
  if (
    state === "in_review" &&
    r?.reason === "check_disagreed" &&
    r.ai_mark != null &&
    r.check_mark != null &&
    num(r.ai_mark) !== num(r.check_mark)
  ) {
    const [lo, hi] = [num(r.ai_mark), num(r.check_mark)].sort((a, b) => a - b);
    return `${lo}–${hi} / ${max}`;
  }
  return `${num(row.mark ?? 0)} / ${max}`;
}

/** Comment cards are placed level with their highlight; collisions push down by `gap`. */
export function layoutCards(
  cards: { anchor: number; height: number }[],
  gap = 8,
) {
  let bottom = -Infinity;
  return cards.map(({ anchor, height }) => {
    const top = Math.max(anchor, bottom + gap);
    bottom = top + height;
    return top;
  });
}
