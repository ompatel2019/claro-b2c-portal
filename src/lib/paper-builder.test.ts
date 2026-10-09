import { describe, expect, it } from "vitest";
import {
  group,
  choiceCaption,
  groupProblems,
  makeChoice,
  move,
  publishPaperProblems,
  totalMarks,
  paperSchema,
  paperBackupSchema,
  tidyChoices,
  ungroup,
  type PaperQuestion,
  type Section,
} from "./paper-builder";

const q = (
  id: string,
  marks: number,
  extra: Partial<PaperQuestion> = {},
): PaperQuestion => ({
  question_id: id,
  source: id.toUpperCase(),
  type: "short",
  marks,
  topic_id: "t3-inflation",
  status: "live",
  choice_group: null,
  ...extra,
});

describe("paper builder", () => {
  it("preserves empty, renamed sections and their order", () => {
    expect(group([], ["Multiple choice", "Short answer"])).toEqual([
      { name: "Multiple choice", questions: [] },
      { name: "Short answer", questions: [] },
    ]);
    expect(
      group(
        [{ ...q("a", 4), section: "Short answer", position: 1 }],
        ["Multiple choice", "Short answer"],
      ).map((s) => [s.name, s.questions.length]),
    ).toEqual([
      ["Multiple choice", 0],
      ["Short answer", 1],
    ]);
  });

  it("backs up unfinished fields without treating them as valid for saving", () => {
    const form = {
      title: "",
      year: 202,
      source: null,
      time_limit_min: 180,
      ranks_enabled: false,
      sections: [{ name: "", questions: [] }],
    };
    expect(paperBackupSchema.safeParse({ form, stems: {} }).success).toBe(true);
    expect(paperSchema.safeParse(form).success).toBe(false);
  });

  it("validates details, duplicate section names and duplicate questions", () => {
    const input = {
      title: "Trial",
      year: null,
      source: null,
      time_limit_min: 180,
      ranks_enabled: false,
      sections: [{ name: "S", questions: [q("a", 4)] }],
    };
    expect(paperSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { title: " " },
      { title: "a".repeat(81) },
      { time_limit_min: 31 },
      { time_limit_min: 245 },
      { sections: [...input.sections, { name: " S ", questions: [] }] },
      { sections: [{ name: "S", questions: [q("a", 4), q("a", 4)] }] },
    ]) {
      expect(paperSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });

  it("ungroups a lone survivor after removal or regrouping", () => {
    const section = {
      name: "S",
      questions: [
        q("a", 4, { choice_group: 1 }),
        q("b", 4, { choice_group: 1 }),
        q("c", 4),
      ],
    };
    expect(
      makeChoice(section, ["a", "c"]).questions.map((q) => q.choice_group),
    ).toEqual([2, null, 2]);
    expect(
      tidyChoices({ ...section, questions: section.questions.slice(1) })
        .questions[0].choice_group,
    ).toBeNull();
  });

  const sections: Section[] = [
    { name: "Section I", questions: [q("q1", 1), q("q2", 1)] },
    {
      name: "Section IV",
      questions: [
        q("q24", 20, { choice_group: 1 }),
        q("q25", 20, { choice_group: 1 }),
      ],
    },
  ];

  it("labels choices by the paper position, including previous sections", () => {
    expect(choiceCaption(sections[1], 1, 2)).toBe("Choose 1: Q3 · Q4");
  });

  it("counts one question per choice group in the total", () => {
    expect(totalMarks(sections)).toBe(22);
  });

  it("validates choice groups and publish rules", () => {
    expect(groupProblems(sections)).toEqual([]);
    const uneven = [
      {
        name: "S",
        questions: [
          q("a", 4, { choice_group: 1 }),
          q("b", 6, { choice_group: 1 }),
        ],
      },
      { name: "T", questions: [q("c", 4, { choice_group: 2 })] },
    ];
    expect(groupProblems(uneven)).toEqual([
      "Questions in a choice must carry equal marks: A · B.",
      '"Answer one of" needs two or more questions: C.',
    ]);
    const base = {
      title: "T",
      year: 2026,
      source: null,
      time_limit_min: 180,
      ranks_enabled: false,
    };
    expect(publishPaperProblems({ ...base, sections })).toEqual({
      problems: [],
      drafts: [],
    });
    expect(
      publishPaperProblems({
        ...base,
        sections: [{ name: "S", questions: [] }],
      }).problems,
    ).toEqual(["Add at least one question."]);
    const mixed = publishPaperProblems({
      ...base,
      sections: [
        {
          name: "S",
          questions: [
            q("d", 2, { status: "draft" }),
            q("r", 2, { status: "retired" }),
          ],
        },
      ],
    });
    expect(mixed.drafts.map((d) => d.question_id)).toEqual(["d"]);
    expect(mixed.problems).toEqual([
      "Retired questions can't be in a live paper: R.",
    ]);
  });

  it("restores sections from stored positions", () => {
    const rows = [
      {
        position: 1,
        question_id: "q1",
        section: "Section I",
        choice_group: null,
      },
      {
        position: 2,
        question_id: "q2",
        section: "Section I",
        choice_group: null,
      },
      {
        position: 3,
        question_id: "q24",
        section: "Section IV",
        choice_group: 1,
      },
      {
        position: 4,
        question_id: "q25",
        section: "Section IV",
        choice_group: 1,
      },
    ];
    const back = group(
      rows.map((r) => ({
        ...sections
          .flatMap((s) => s.questions)
          .find((x) => x.question_id === r.question_id)!,
        position: r.position,
        section: r.section,
        choice_group: r.choice_group,
      })),
    );
    expect(back).toEqual(sections);
    expect(group([]).map((s) => s.name)).toEqual([
      "Section I",
      "Section II",
      "Section III",
      "Section IV",
    ]);
  });

  it("makes and removes choice groups, and moves rows", () => {
    const s = { name: "S", questions: [q("a", 4), q("b", 4), q("c", 4)] };
    const grouped = makeChoice(s, ["a", "b"]);
    expect(grouped.questions.map((x) => x.choice_group)).toEqual([1, 1, null]);
    expect(
      ungroup(grouped, 1).questions.every((x) => x.choice_group === null),
    ).toBe(true);
    expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(move([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], -1, 0)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], NaN, 0)).toEqual([1, 2, 3]);
  });
});
