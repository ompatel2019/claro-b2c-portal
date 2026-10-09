// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  readJson: vi.fn(),
  list: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  in: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
  readdir: mocks.readdir,
}));
vi.mock("./store", () => ({
  readJson: mocks.readJson,
  runPath: (id: string) => `runs/${id}.json`,
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    storage: { from: () => ({ list: mocks.list }) },
    from: mocks.from,
  }),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
import { loadComparison, loadDetails, selectedRuns } from "./compare-data";
import { compareDetails } from "./compare-actions";
import type { CompareItem, CompareRun } from "./compare";
const run: CompareRun = {
  meta: { stamp: "one", label: "test", marker: { model: "test" } },
  items: [
    {
      id: "ge-4",
      section: "A1",
      mark: 3,
      marks: 5,
      expected: 3,
      feedback: "saved text",
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.readdir.mockResolvedValue(["one.json", "two.json", "unselected.json"]);
  mocks.readFile.mockResolvedValue(JSON.stringify(run));
  mocks.list.mockResolvedValue({
    data: [{ name: "web-id.json" }],
    error: null,
  });
  mocks.readJson.mockResolvedValue(run);
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    in: mocks.in,
    order: mocks.order,
    limit: mocks.limit,
  };
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.in, mocks.order])
    fn.mockReturnValue(query);
  mocks.limit.mockResolvedValue({ data: [], error: null });
});
it("reads only the two validated CLI files and sends no answers or feedback initially", async () => {
  const data = await loadComparison("one", "two");
  expect(mocks.readFile.mock.calls.map((call) => call[0])).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/\/one.json$/),
      expect.stringMatching(/\/two.json$/),
    ]),
  );
  expect(mocks.readFile).toHaveBeenCalledTimes(2);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.readJson).not.toHaveBeenCalled();
  expect(JSON.stringify(data)).not.toContain("saved text");
  expect(JSON.stringify(data)).not.toContain("studentResponse");
  expect(data?.rows[0].stem?.length).toBeLessThanOrEqual(60);
});
it("checks bucket membership and downloads only the selected known web run", async () => {
  await selectedRuns("one", "web-id");
  expect(mocks.list).toHaveBeenCalledTimes(1);
  expect(mocks.readJson).toHaveBeenCalledExactlyOnceWith("runs/web-id.json");
  expect(mocks.readFile).toHaveBeenCalledTimes(1);
});
it("rejects traversal, unknown ids, duplicate ids and repeated query parameters before result reads", async () => {
  for (const a of [
    "../one",
    "one/../../escape",
    "%2e%2e",
    "unknown",
    ["one"],
    "two",
  ])
    expect(await selectedRuns(a, "two")).toBeNull();
  expect(mocks.readFile).not.toHaveBeenCalled();
  expect(mocks.readJson).not.toHaveBeenCalled();
});
it("authenticates detail reads and restricts detail keys to common items", async () => {
  const data = await loadComparison("one", "two");
  const detail = await compareDetails("one", "two", data!.rows[0].key);
  expect(mocks.auth).toHaveBeenCalledTimes(1);
  expect(detail).toMatchObject({
    feedbackA: "saved text",
    feedbackB: "saved text",
    answer: expect.any(String),
    notes: expect.any(String),
  });
  await expect(loadDetails("one", "two", "bad-key")).rejects.toThrow(
    "Item not found",
  );
  mocks.auth.mockRejectedValueOnce(new Error("Unauthorized"));
  mocks.readFile.mockClear();
  await expect(compareDetails("one", "two", data!.rows[0].key)).rejects.toThrow(
    "Unauthorized",
  );
  expect(mocks.readFile).not.toHaveBeenCalled();
});
it("uses one bounded held-out query and returns only anonymised answer and tutor text on expansion", async () => {
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      ...run,
      items: [{ ...run.items[0], section: "Held-out", id: "held" }],
    }),
  );
  mocks.limit.mockResolvedValue({
    data: [
      {
        question_id: "held",
        answer_text: "anonymous answer",
        accepted_tutor_comments: [{ body: "Tutor note" }],
        questions: { stem: "Held-out stem" },
      },
    ],
    error: null,
  });
  const data = await loadComparison("one", "two");
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("marking_examples");
  expect(mocks.eq).toHaveBeenCalledWith("split", "test");
  expect(mocks.limit).toHaveBeenCalledWith(1000);
  expect(data!.rows[0].stem).toBe("Held-out stem");
  expect(JSON.stringify(data)).not.toContain("anonymous answer");
  const detail = await loadDetails("one", "two", data!.rows[0].key);
  expect(detail).toMatchObject({
    answer: "anonymous answer",
    notes: "Tutor note",
    feedbackA: "saved text",
    feedbackB: "saved text",
  });
  expect(
    mocks.select.mock.calls.every(
      ([fields]) => !fields.includes("user") && !fields.includes("name"),
    ),
  ).toBe(true);
});

it("hides legacy repeated Held-out answers while retaining occurrence mark comparisons", async () => {
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      ...run,
      items: [0, 1].map(() => ({
        ...run.items[0],
        section: "Held-out",
        id: "held",
      })),
    }),
  );
  mocks.limit.mockResolvedValue({
    data: [
      { id: "first", question_id: "held", answer_text: "first answer" },
      { id: "second", question_id: "held", answer_text: "second answer" },
    ],
    error: null,
  });
  const data = await loadComparison("one", "two");
  expect(data!.rows).toHaveLength(2);
  const detail = await loadDetails("one", "two", data!.rows[1].key);
  expect(detail.answerA).toBeUndefined();
  expect(detail.answerB).toBeUndefined();
  expect(detail.answerWarningA).toBe(
    "Answer not shown: legacy run without a stable answer id",
  );
  expect(JSON.stringify(detail)).not.toContain("second answer");
});
it("finds each run's stable answer and comments even when repeated answers reorder", async () => {
  const comments: CompareItem["feedbackComments"] = [
    {
      kind: "strength",
      quote: "second",
      start: 0,
      tag: "Knowledge",
      body: "Specific",
      next_mark: null,
    },
  ];
  const items = ["first", "second"].map((exampleId) => ({
    ...run.items[0],
    section: "Held-out",
    id: "held",
    exampleId,
    feedbackComments: comments,
  }));
  mocks.readFile
    .mockResolvedValueOnce(JSON.stringify({ ...run, items }))
    .mockResolvedValueOnce(
      JSON.stringify({ ...run, items: [...items].reverse() }),
    );
  mocks.limit.mockResolvedValue({
    data: items.map((item) => ({
      id: item.exampleId,
      question_id: "held",
      answer_text: `${item.exampleId} answer`,
    })),
    error: null,
  });
  const { compareRuns } = await import("./compare");
  const row = compareRuns(
    { ...run, items },
    { ...run, items: [...items].reverse() },
  ).rows[1];
  const detail = await loadDetails("one", "two", row.key);
  expect(detail).toMatchObject({
    answerA: "second answer",
    answerB: "second answer",
    commentsA: comments,
    commentsB: comments,
  });
});

it("resolves Claro stable ids and legacy question-label pairs with tutor notes", async () => {
  const { default: claro } = await import("@/lib/ai/eval/claro-set.json");
  const fixture = claro[0];
  const items = [
    {
      ...run.items[0],
      section: "Claro",
      id: fixture.question_id,
      label: fixture.label,
    },
  ];
  const { compareRuns } = await import("./compare");
  const key = compareRuns({ ...run, items }, { ...run, items }).rows[0].key;
  mocks.readFile.mockResolvedValue(JSON.stringify({ ...run, items }));
  mocks.limit.mockResolvedValue({
    data: [
      {
        question_id: fixture.question_id,
        answer_text: fixture.answer,
        accepted_tutor_comments: [{ body: "Claro tutor note" }],
      },
    ],
    error: null,
  });
  const legacy = await loadDetails("one", "two", key);
  expect(legacy).toMatchObject({
    answerA: fixture.answer,
    answerB: fixture.answer,
    notes: "Claro tutor note",
  });
  expect(legacy.answerWarningA).toBeUndefined();
  expect(legacy.answerWarningB).toBeUndefined();
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      ...run,
      items: items.map((item) => ({
        ...item,
        exampleId: `claro:0:${fixture.label}`,
      })),
    }),
  );
  expect(await loadDetails("one", "two", key)).toMatchObject({
    answerA: fixture.answer,
    answerB: fixture.answer,
  });
});
