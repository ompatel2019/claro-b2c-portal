import type { z } from "zod";
import type { GradeSchema } from "./schemas";

export type Criterion = { min: number; max: number; descriptor: string };
export type MarkableQuestion = {
  id: string;
  type: "mcq" | "short" | "extended";
  marks: number;
  stem: string;
  stimulus: string | null;
  criteria: Criterion[];
  guideline_notes: string | null;
  sample_answer: string | null;
  source: string;
};

export function scoreMcq(
  correctIndex: number,
  choiceIndex: number | null | undefined,
) {
  return choiceIndex != null && choiceIndex === correctIndex ? 1 : 0;
}

function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findBand(criteria: Criterion[], bandText: string) {
  const band = normalise(bandText);
  if (!band || band === normalise("NO BAND SATISFIED")) return null;
  return (
    criteria.find(({ descriptor }) => normalise(descriptor) === band) ??
    criteria.find(({ descriptor }) => {
      const text = normalise(descriptor);
      return text && (band.includes(text) || text.includes(band));
    }) ??
    null
  );
}

export function marksAgree(
  criteria: Criterion[],
  maxMarks: number,
  a: number,
  b: number,
): boolean {
  const band = (mark: number) =>
    mark === 0
      ? undefined
      : criteria.find((c) => mark >= c.min && mark <= c.max);
  return band(a) === band(b) && (maxMarks < 6 || Math.abs(a - b) <= 1);
}

export function validateGrade(
  criteria: Criterion[],
  maxMarks: number,
  grade: {
    band_selected: string;
    mark: number;
    comments?: Pick<
      z.infer<typeof GradeSchema>["comments"][number],
      "kind" | "next_mark"
    >[];
  },
): { ok: true } | { ok: false; problem: string } {
  if (
    !Number.isInteger(grade.mark) ||
    grade.mark < 0 ||
    grade.mark > maxMarks
  ) {
    return {
      ok: false,
      problem: `Mark must be a whole number between 0 and ${maxMarks}.`,
    };
  }
  if (normalise(grade.band_selected) === normalise("NO BAND SATISFIED")) {
    if (grade.mark !== 0)
      return { ok: false, problem: "NO BAND SATISFIED requires mark 0." };
  } else {
    const band = findBand(criteria, grade.band_selected);
    if (!band)
      return {
        ok: false,
        problem: "Selected band is not in the marking guideline.",
      };
    if (grade.mark < band.min || grade.mark > band.max) {
      return {
        ok: false,
        problem: `Selected band requires a mark between ${band.min} and ${band.max}.`,
      };
    }
  }
  if (grade.comments) {
    if (
      grade.mark < maxMarks &&
      !grade.comments.some((c) => c.kind === "fix")
    ) {
      return {
        ok: false,
        problem: "A mark below full marks requires a fix comment.",
      };
    }
    if (grade.mark > 0 && !grade.comments.some((c) => c.kind === "strength")) {
      return {
        ok: false,
        problem: "A positive mark requires a strength comment.",
      };
    }
    if (grade.comments.some((c) => c.kind === "fix" && !c.next_mark?.trim())) {
      return {
        ok: false,
        problem: "Every fix comment requires a non-empty next_mark.",
      };
    }
  }
  return { ok: true };
}

export function clampMark(mark: number, maxMarks: number) {
  return Math.max(
    0,
    Math.min(Math.floor(maxMarks), Math.round(Number.isNaN(mark) ? 0 : mark)),
  );
}

function normaliseWithIndex(text: string) {
  let normalised = "";
  const indexMap: { start: number; end: number }[] = [];
  let offset = 0;
  for (const char of text) {
    const value = /\s/u.test(char)
      ? " "
      : char
          .replace(/[‘’‚‛]/gu, "'")
          .replace(/[“”„]/gu, '"')
          .toLowerCase();
    if (value !== " " || !normalised.endsWith(" ")) {
      normalised += value;
      for (let i = 0; i < value.length; i++)
        indexMap.push({ start: offset, end: offset + char.length });
    }
    offset += char.length;
  }
  return { normalised, indexMap };
}

export function anchorComments(
  answerText: string,
  comments: z.infer<typeof GradeSchema>["comments"],
) {
  const answer = normaliseWithIndex(answerText);
  let previousStart = 0;
  return comments
    .map((comment) => {
      const needle = comment.quote.trim();
      let start = needle ? answerText.indexOf(needle, previousStart) : -1;
      if (needle && start === -1) start = answerText.indexOf(needle);
      let end = start + needle.length;
      if (needle && start === -1) {
        const normalisedNeedle = normaliseWithIndex(needle).normalised;
        let first = -1;
        let chosen = -1;
        for (
          let i = answer.normalised.indexOf(normalisedNeedle);
          i !== -1;
          i = answer.normalised.indexOf(normalisedNeedle, i + 1)
        ) {
          if (first === -1) first = i;
          if (answer.indexMap[i].start >= previousStart) {
            chosen = i;
            break;
          }
        }
        if (chosen === -1) chosen = first;
        if (chosen !== -1) {
          start = answer.indexMap[chosen].start;
          end = answer.indexMap[chosen + normalisedNeedle.length - 1].end;
        }
      }
      if (start !== -1) previousStart = start;
      return {
        ...comment,
        quote: start === -1 ? comment.quote : answerText.slice(start, end),
        start: start === -1 ? null : start,
        body: comment.body.trim(),
        next_mark:
          comment.kind === "strength"
            ? null
            : comment.next_mark?.trim() || null,
      };
    })
    .sort((a, b) => {
      if (a.start === null) return b.start === null ? 0 : 1;
      if (b.start === null) return -1;
      return a.start - b.start;
    });
}

/** Session summary for sessions with no AI-graded answers (e.g. multiple choice only), built from topic results. */
export function topicSummary(items: { topic: string; correct: boolean }[]) {
  const byTopic = new Map<string, { right: number; total: number }>();
  for (const { topic, correct } of items) {
    const entry = byTopic.get(topic) ?? { right: 0, total: 0 };
    entry.total += 1;
    if (correct) entry.right += 1;
    byTopic.set(topic, entry);
  }
  const topics = [...byTopic].map(([topic, r]) => ({ topic, ...r }));
  const strong = topics
    .filter((t) => t.right / t.total >= 0.75)
    .sort((a, b) => b.right - a.right);
  const weak = topics
    .filter((t) => t.right < t.total)
    .sort((a, b) => b.total - b.right - (a.total - a.right));
  return {
    strengths: strong.length
      ? strong
          .slice(0, 3)
          .map((t) => `${t.right}/${t.total} correct on ${t.topic}.`)
      : ["You attempted every question type in this session."],
    improvements: weak.length
      ? weak
          .slice(0, 3)
          .map(
            (t) => `${t.total - t.right} of ${t.total} missed on ${t.topic}.`,
          )
      : ["No misses this time: try a harder mode or a mixed sprint."],
    next_steps: [
      ...weak.slice(0, 2).map((t) => `Run a Topic Sprint on ${t.topic}.`),
      "Read why each correct option is right for the questions you missed.",
    ],
  };
}
