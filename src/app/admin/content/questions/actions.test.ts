import { beforeEach, expect, it, vi } from "vitest";
import { QUESTION_IMPORT_REVIEW_TAG } from "@/lib/question-review-cache";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  rpc: vi.fn(),
  service: vi.fn(),
  revalidate: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidate,
  updateTag: mocks.updateTag,
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/utils/supabase/admin", () => ({ admin: mocks.service }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
import {
  bulkQuestions,
  mergeDraft,
  saveQuestion,
  undoQuestionChanges,
  type BulkAction,
} from "./actions";

const question = {
  id: "2024-q21b",
  type: "short",
  topic_id: "t3-inflation",
  marks: 4,
  verb: "Explain",
  source: "2024 HSC Q21(b)",
  year: 2024,
  stem: "Explain one cause of inflation.",
  stimulus: null,
  options: null,
  correct_index: null,
  explanation: null,
  criteria: [{ min: 1, max: 4, descriptor: "Explains a cause" }],
  guideline_notes: null,
  sample_answer: "Demand increases prices.",
  status: "draft",
  duplicate_of: null,
  updated_at: "2026-10-09T01:00:00Z",
};

// Model each database read/write separately, including Supabase's thenable queries.
function serviceResults(results: unknown[]) {
  const update = vi.fn();
  const from = vi.fn(() => {
    const data = results.shift();
    const result = { data, error: null };
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      not: () => query,
      update: (patch: unknown) => {
        update(patch);
        return query;
      },
      maybeSingle: () => query,
      throwOnError: async () => result,
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return query;
  });
  mocks.service.mockReturnValue({ from });
  return { from, update };
}

function expectInvalidated() {
  expect(mocks.revalidate).toHaveBeenCalledWith("/admin/content/questions");
  expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith(
    QUESTION_IMPORT_REVIEW_TAG,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ role: "admin" });
});

it.each(["draft", "live"])(
  "invalidates after saving a %s question (including imported drafts)",
  async (status) => {
    const saved = {
      ok: true,
      id: question.id,
      updated_at: question.updated_at,
    };
    mocks.rpc.mockResolvedValue({ data: saved, error: null });
    expect(await saveQuestion({ ...question, status }, null)).toEqual(saved);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "admin_save_question",
      expect.objectContaining({ p_row: expect.objectContaining({ status }) }),
    );
    expectInvalidated();
  },
);

it("invalidates after guarded undo", async () => {
  const { update } = serviceResults([question, [{ id: question.id }]]);
  await undoQuestionChanges([
    {
      id: question.id,
      expected: question.updated_at,
      status: "draft",
      topic_id: question.topic_id,
      verb: question.verb,
      duplicate_of: null,
    },
  ]);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "draft" }),
  );
  expectInvalidated();
});

it.each<BulkAction>([
  { kind: "publish" },
  { kind: "retire" },
  { kind: "delete" },
  { kind: "topic", topic_id: "t3-inflation" },
  { kind: "verb", verb: "Explain" },
])("invalidates bulk $kind writes", async (action) => {
  const results: unknown[] =
    action.kind === "topic" ? [{ id: question.topic_id }] : [];
  results.push([question]);
  if (action.kind === "publish" || action.kind === "delete")
    results.push([question]);
  if (action.kind !== "delete") results.push([{ id: question.id }]);
  const { update } = serviceResults(results);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  expect(await bulkQuestions([question.id], action)).toMatchObject({
    done: 1,
    failures: [],
  });
  if (action.kind === "delete")
    expect(mocks.rpc).toHaveBeenCalledWith("admin_delete_question", {
      p_id: question.id,
    });
  else expect(update).toHaveBeenCalledOnce();
  expectInvalidated();
});

it("invalidates after merging a draft into its match", async () => {
  const { update } = serviceResults([
    question,
    { id: "live-question" },
    [{ id: question.id }],
  ]);
  expect(await mergeDraft(question.id, "live-question")).toHaveLength(1);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "retired",
      duplicate_of: "live-question",
    }),
  );
  expectInvalidated();
});

it("does not invalidate a rejected save", async () => {
  mocks.rpc.mockResolvedValue({
    error: { code: "23505", message: "questions_pkey" },
  });
  expect(await saveQuestion(question, null)).toEqual({
    error: "This ID is already taken.",
  });
  expect(mocks.updateTag).not.toHaveBeenCalled();
});

it.each([
  () => saveQuestion(question, null),
  () => undoQuestionChanges([]),
  () => bulkQuestions([question.id], { kind: "retire" }),
  () => mergeDraft(question.id, "live-question"),
])("guards writes before service access or invalidation", async (action) => {
  mocks.guard.mockRejectedValue(new Error("admin only"));
  await expect(action()).rejects.toThrow("admin only");
  expect(mocks.service).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.updateTag).not.toHaveBeenCalled();
});
