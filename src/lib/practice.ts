export const modes = {
  mcq: { label: "Multiple choice", marks: 20, minutes: 20 },
  short: { label: "Short answer", marks: 40, minutes: 60 },
  extended: { label: "Extended response", marks: 20, minutes: 35 },
  mixed: { label: "Mixed", marks: 60, minutes: 75 },
};
export type Mode = keyof typeof modes;
export const modeLabel = (mode?: string) =>
  modes[mode as Mode]?.label ?? "Practice";
export type Topic = {
  id: string;
  parent_id: string | null;
  name: string;
  sort: number;
};
export type Session = {
  kind?: string;
  id: string;
  user_id: string;
  config: {
    mode: Mode;
    topics: string[];
    target_marks: number;
    time_limit_min: number;
  };
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  elapsed_s: number;
  summary: {
    strengths: string[];
    improvements: string[];
    next_steps: string[];
  } | null;
};
export type Comment = {
  quote: string;
  start: number | null;
  kind: "strength" | "fix";
  tag:
    | "Verb"
    | "Knowledge"
    | "Evidence"
    | "Analysis"
    | "Terminology"
    | "Structure";
  body: string;
  next_mark: string | null;
};
export type Attempt = {
  id: string;
  position: number;
  question_id: string;
  choice_index: number | null;
  answer_text: string | null;
  transcript: string | null;
  image_paths: string[] | null;
  flagged: boolean;
  status: string;
  mark: number | null;
  max_marks: number | null;
  band: string | null;
  feedback: {
    note?: string;
    correct_index?: number;
    chosen_index?: number | null;
    comments?: Comment[];
    earned?: string[];
    missing_points?: string[];
    next_band?: string;
    why_not_higher?: string;
    justification?: string;
    better_answer_outline?: string[];
  } | null;
  question: {
    id: string;
    type: "mcq" | "short" | "extended";
    topic_id: string;
    marks: number;
    stem: string;
    stimulus: string | null;
    options: string[] | null;
    source: string;
    year: number | null;
  };
};
export const questionColumns =
  "id,type,topic_id,marks,stem,stimulus,options,source,year";
export function answered(
  a: Pick<Attempt, "choice_index" | "transcript" | "answer_text">,
) {
  return (
    a.choice_index != null || Boolean((a.transcript ?? a.answer_text)?.trim())
  );
}
export function timer(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function percentage(score: number | null, max: number | null) {
  return max
    ? `${Math.round((Number(score ?? 0) / max) * 100)}%`
    : "No score yet";
}
/** Score colour rule: ≥75% success, 50–74% warning, <50% destructive. */
export function scoreTone(pct: number) {
  return pct >= 75 ? "success" : pct >= 50 ? "warning" : "destructive";
}
export function dateLabel(date: string) {
  return new Date(date).toLocaleDateString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function topicNames(ids: string[] | undefined, topics: Topic[]) {
  return ids?.length
    ? ids.map((id) => topics.find((t) => t.id === id)?.name ?? id).join(", ")
    : "All topics";
}
/** Display order: comments sorted by where they appear in the answer text. */
export function orderedComments<T extends Pick<Comment, "start">>(
  comments: T[],
) {
  return comments
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      const as = a.c.start;
      const bs = b.c.start;
      if (as == null && bs == null) return a.index - b.index;
      if (as == null) return 1;
      if (bs == null) return -1;
      return as - bs || a.index - b.index;
    });
}

export function highlightSegments(
  text: string,
  comments: Pick<Comment, "start" | "quote">[],
) {
  const valid = comments
    .map((c, index) => ({
      start: c.start,
      end: (c.start ?? 0) + c.quote.length,
      index,
    }))
    .filter(
      (c): c is { start: number; end: number; index: number } =>
        c.start !== null &&
        Number.isInteger(c.start) &&
        c.start >= 0 &&
        c.start < text.length &&
        c.end > c.start,
    );
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...valid.flatMap((c) => [c.start, Math.min(text.length, c.end)]),
    ]),
  ].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => ({
    text: text.slice(start, boundaries[i + 1]),
    start,
    comments: valid
      .filter((c) => c.start <= start && c.end > start)
      .map((c) => c.index),
  }));
}

/** "1 term", "3 terms"; pass the plural when it isn't word + "s". */
export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n} ${n === 1 ? word : many}`;
