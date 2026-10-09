import { answered, plural, type Attempt } from "./practice";
export type PaperSection = {
  position: number;
  section: string | null;
  choice_group: number | null;
};
export type PaperConfig = {
  time_limit_min: number;
  reading_min: number;
  strict: true;
  sections: PaperSection[];
  writing_started_at?: string;
};
export function paperClock(started: string, config: PaperConfig, now: number) {
  const start = Date.parse(started);
  const deadline = start + (config.time_limit_min + config.reading_min) * 60000;
  const readingEnd = config.writing_started_at
    ? Date.parse(config.writing_started_at)
    : start + config.reading_min * 60000;
  return {
    deadline,
    remaining: Math.max(0, Math.ceil((deadline - now) / 1000)),
    reading: !config.writing_started_at && now < readingEnd && now < deadline,
    readingRemaining: Math.max(0, Math.ceil((readingEnd - now) / 1000)),
  };
}
export function paperSections(
  sections: PaperSection[],
  attempts: {
    position: number;
    marks: number;
    type?: string;
    answered: boolean;
  }[],
  timeLimitMin = 0,
) {
  const names = [...new Set(sections.map((s) => s.section ?? "Questions"))];
  const result = names.map((name) => {
    const entries = sections.filter((s) => (s.section ?? "Questions") === name);
    const units = [
      ...new Set(
        entries.map((s) =>
          s.choice_group == null ? `q${s.position}` : `g${s.choice_group}`,
        ),
      ),
    ].map((key) => {
      const positions = entries
        .filter(
          (s) =>
            (s.choice_group == null
              ? `q${s.position}`
              : `g${s.choice_group}`) === key,
        )
        .map((s) => s.position);
      const rows = attempts.filter((a) => positions.includes(a.position));
      return {
        positions,
        marks: Math.max(0, ...rows.map((a) => a.marks)),
        answered: rows.some((a) => a.answered),
      };
    });
    return {
      name,
      types: [
        ...new Set(
          attempts
            .filter((a) => entries.some((e) => e.position === a.position))
            .flatMap((a) => (a.type ? [a.type] : [])),
        ),
      ],
      units,
      questions: entries.length,
      total: units.length,
      answered: units.filter((u) => u.answered).length,
      marks: units.reduce((n, u) => n + u.marks, 0),
    };
  });
  const totalMarks = result.reduce((sum, section) => sum + section.marks, 0);
  return result.map((section) => ({
    ...section,
    aboutMin: Math.round(
      (timeLimitMin * section.marks) / Math.max(1, totalMarks),
    ),
  }));
}
export function paperDuration(minutes: number, timerLabel = false) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (timerLabel)
    return (
      [hours ? `${hours}-hour` : "", rest ? `${rest}-minute` : ""]
        .filter(Boolean)
        .join(" ") || "0-minute"
    );
  return (
    [hours ? plural(hours, "hour") : "", rest ? plural(rest, "minute") : ""]
      .filter(Boolean)
      .join(" ") || "0 minutes"
  );
}
export function resolvePaperChoices(
  sections: PaperSection[],
  attempts: Pick<
    Attempt,
    "id" | "position" | "choice_index" | "answer_text" | "transcript"
  >[],
  choices: Record<string, number>,
  automatic = false,
) {
  const skipped: string[] = [];
  const unresolved: number[] = [];
  for (const group of [
    ...new Set(
      sections.flatMap((s) => (s.choice_group == null ? [] : [s.choice_group])),
    ),
  ]) {
    const positions = sections
      .filter((s) => s.choice_group === group)
      .map((s) => s.position);
    const rows = attempts.filter((a) => positions.includes(a.position));
    const drafts = rows.filter(answered);
    const explicit = rows.find((a) => a.position === choices[group]);
    const selected =
      (explicit && answered(explicit) ? explicit : undefined) ??
      (drafts.length <= 1 || automatic ? (drafts[0] ?? rows[0]) : undefined);
    if (!selected) unresolved.push(group);
    else
      skipped.push(
        ...rows.filter((a) => a.id !== selected.id).map((a) => a.id),
      );
  }
  return { skipped, unresolved };
}
