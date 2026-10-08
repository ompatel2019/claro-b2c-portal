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

export function numberLines(text: string) {
  const lines = text.split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
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

export function validateGrade(
  criteria: Criterion[],
  maxMarks: number,
  grade: { band_selected: string; mark: number },
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
    return grade.mark === 0
      ? { ok: true }
      : { ok: false, problem: "NO BAND SATISFIED requires mark 0." };
  }
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
  return { ok: true };
}

export function clampMark(mark: number, maxMarks: number) {
  return Math.max(
    0,
    Math.min(Math.floor(maxMarks), Math.round(Number.isNaN(mark) ? 0 : mark)),
  );
}

export function anchorComments<T extends { quote: string }>(
  answerText: string,
  comments: T[],
) {
  return comments.map((comment) => {
    const words = comment.quote.trim().split(/\s+/).filter(Boolean);
    const pattern = words
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    const match = pattern ? new RegExp(pattern, "iu").exec(answerText) : null;
    return { ...comment, start: match?.index ?? null };
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
