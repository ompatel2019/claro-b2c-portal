/** Pure paper-builder logic (§4.6): schema, totals, publish rules, choice groups and the row layout. */
import { z } from "zod";

export { PAPER_READING_MIN as READING_MIN } from "@/lib/limits";
export const DEFAULT_SECTIONS = [
  "Section I",
  "Section II",
  "Section III",
  "Section IV",
];
export const TIME_LIMITS = Array.from({ length: 43 }, (_, i) => 30 + i * 5);

export const paperQuestionSchema = z.object({
  question_id: z.string().min(1),
  source: z.string(),
  type: z.enum(["mcq", "short", "extended"]),
  marks: z.number().int().min(1),
  topic_id: z.string(),
  status: z.enum(["draft", "live", "retired"]),
  choice_group: z.number().int().min(1).nullable(),
});
export type PaperQuestion = z.infer<typeof paperQuestionSchema>;
export const sectionSchema = z.object({
  name: z.string().trim().min(1, "Name every section.").max(60),
  questions: z.array(paperQuestionSchema),
});
export type Section = z.infer<typeof sectionSchema>;
export const paperSchema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(80),
  year: z.number().int().min(2000).max(2100).nullable(),
  source: z.string().trim().max(60).nullable(),
  time_limit_min: z
    .number()
    .int()
    .min(30)
    .max(240)
    .refine((n) => n % 5 === 0, "Time limit goes in steps of 5 minutes."),
  ranks_enabled: z.boolean(),
  sections: z
    .array(sectionSchema)
    .min(1, "Add a section.")
    .refine(
      (sections) =>
        new Set(sections.map((s) => s.name)).size === sections.length,
      "Give every section a unique name.",
    )
    .refine((sections) => {
      const ids = sections.flatMap((s) =>
        s.questions.map((q) => q.question_id),
      );
      return new Set(ids).size === ids.length;
    }, "Use each question once."),
});
export type PaperInput = z.infer<typeof paperSchema>;

/** A browser backup may contain unfinished field edits; writes still use paperSchema. */
export const paperBackupSchema = z.object({
  form: paperSchema.omit({ sections: true }).extend({
    title: z.string().max(80),
    year: z.number().int().nullable(),
    sections: z
      .array(sectionSchema.extend({ name: z.string().max(60) }))
      .min(1),
  }),
  stems: z.record(
    z.string(),
    z.object({
      stem: z.string(),
      stimulus: z.string().nullable(),
      options: z.array(z.string()).nullable(),
    }),
  ),
});

/** Total marks, counting one question per choice group. */
export function totalMarks(sections: Section[]) {
  let total = 0;
  for (const s of sections) {
    const seen = new Set<number>();
    for (const q of s.questions) {
      if (q.choice_group != null) {
        if (seen.has(q.choice_group)) continue;
        seen.add(q.choice_group);
      }
      total += q.marks;
    }
  }
  return total;
}

/** Choice captions use the paper's current positions, rather than bank source numbers. */
export function choiceCaption(
  section: Section,
  groupNo: number,
  offset: number,
) {
  return `Choose 1: ${section.questions.flatMap((q, i) => (q.choice_group === groupNo ? [`Q${offset + i + 1}`] : [])).join(" · ")}`;
}

/** Choice groups need 2+ members with equal marks. Returns one message per bad group. */
export function groupProblems(sections: Section[]) {
  const problems: string[] = [];
  for (const s of sections) {
    const groups = new Map<number, PaperQuestion[]>();
    for (const q of s.questions)
      if (q.choice_group != null)
        groups.set(q.choice_group, [...(groups.get(q.choice_group) ?? []), q]);
    for (const [, members] of groups) {
      const label = members.map((m) => m.source).join(" · ");
      if (members.length < 2)
        problems.push(`"Answer one of" needs two or more questions: ${label}.`);
      else if (new Set(members.map((m) => m.marks)).size > 1)
        problems.push(
          `Questions in a choice must carry equal marks: ${label}.`,
        );
    }
  }
  return problems;
}

/** Publish rules: ≥1 question, every question live (drafts listed), groups valid. */
export function publishPaperProblems(p: PaperInput) {
  const questions = p.sections.flatMap((s) => s.questions);
  const problems: string[] = [];
  if (!questions.length) problems.push("Add at least one question.");
  const drafts = questions.filter((q) => q.status === "draft");
  const retired = questions.filter((q) => q.status === "retired");
  if (retired.length)
    problems.push(
      `Retired questions can't be in a live paper: ${retired.map((q) => q.source).join(", ")}.`,
    );
  problems.push(...groupProblems(p.sections));
  return { problems, drafts };
}

/** Sections from stored rows, in position order; a paper with no rows gets the four defaults. */
export function group(
  rows: (PaperQuestion & { position: number; section: string | null })[],
  names?: string[] | null,
): Section[] {
  if (!rows.length && !names?.length)
    return DEFAULT_SECTIONS.map((name) => ({ name, questions: [] }));
  const sections: Section[] = (names ?? []).map((name) => ({
    name,
    questions: [],
  }));
  for (const r of [...rows].sort((a, b) => a.position - b.position)) {
    const name = r.section ?? "Section I";
    let s = sections.find((x) => x.name === name);
    if (!s) {
      s = { name, questions: [] };
      sections.push(s);
    }
    const { position: _p, section: _s, ...q } = r;
    void _p;
    void _s;
    s.questions.push(q);
  }
  return sections;
}

/** Keep leftover choice groups meaningful after a remove or regroup. */
export function tidyChoices(section: Section): Section {
  const counts = new Map<number, number>();
  for (const q of section.questions)
    if (q.choice_group !== null)
      counts.set(q.choice_group, (counts.get(q.choice_group) ?? 0) + 1);
  return {
    ...section,
    questions: section.questions.map((q) =>
      q.choice_group !== null && counts.get(q.choice_group) === 1
        ? { ...q, choice_group: null }
        : q,
    ),
  };
}

/** Makes "answer one of" from the chosen rows of one section (a fresh group number). */
export function makeChoice(section: Section, ids: string[]): Section {
  const next =
    Math.max(0, ...section.questions.map((q) => q.choice_group ?? 0)) + 1;
  return tidyChoices({
    ...section,
    questions: section.questions.map((q) =>
      ids.includes(q.question_id) ? { ...q, choice_group: next } : q,
    ),
  });
}

export function ungroup(section: Section, groupNo: number): Section {
  return {
    ...section,
    questions: section.questions.map((q) =>
      q.choice_group === groupNo ? { ...q, choice_group: null } : q,
    ),
  };
}

export function move<T>(list: T[], from: number, to: number) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= list.length ||
    to < 0 ||
    to >= list.length ||
    from === to
  )
    return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
