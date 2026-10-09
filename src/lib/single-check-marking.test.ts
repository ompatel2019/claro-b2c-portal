// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
vi.mock("@/lib/marking/engine", () => ({
  AlreadyMarking: class extends Error {},
  MARKER: { model: "test" },
  STALE_CLAIM_MS: 180000,
  markWritten: vi.fn(),
}));
import { admin } from "@/utils/supabase/admin";
import { AlreadyMarking, markWritten } from "@/lib/marking/engine";
import { markOwnCheck } from "./single-check-marking";
function chain(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    or: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data }),
    then: (fn: (v: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(fn),
  };
  for (const key of [
    "select",
    "eq",
    "single",
    "or",
    "update",
    "insert",
  ] as const)
    q[key].mockReturnValue(q);
  return q;
}
const question = {
  stem: "Explain the causes of inflation.",
  marks: 4,
  verb: "explain",
  topic_id: null,
  criteria_text: "Relates causes and effects.",
};
beforeEach(() => vi.clearAllMocks());
it("reuses the blind-check engine and persists a provisional disagreement for own questions", async () => {
  const read = chain({
    session_id: "s",
    status: "pending",
    answer_text: "Prices rise as demand grows",
    transcript: null,
  });
  const claim = chain([{ id: "a" }]);
  const review = chain(null);
  const save = chain({ status: "marked", mark: 3, max_marks: 4 });
  const from = vi
    .fn()
    .mockReturnValueOnce(read)
    .mockReturnValueOnce(claim)
    .mockReturnValueOnce(review)
    .mockReturnValueOnce(save);
  vi.mocked(admin).mockReturnValue({ from } as never);
  vi.mocked(markWritten).mockResolvedValue({
    mark: 3,
    band: "some band",
    feedback: { comments: [] },
    check: { status: "in_review", marks: [3, 1, 2] },
  } as never);
  await expect(markOwnCheck("a", "u", { question })).resolves.toMatchObject({
    mark: 3,
    status: "marked",
  });
  expect(markWritten).toHaveBeenCalledWith(
    expect.objectContaining({
      stem: question.stem,
      marks: 4,
      guideline_notes: question.criteria_text,
    }),
    "Prices rise as demand grows",
    "u",
  );
  expect(review.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      attempt_id: "a",
      user_id: "u",
      ai_mark: 3,
      check_mark: 1,
      reason: "check_disagreed",
    }),
  );
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      check_status: "in_review",
      status: "marked",
      max_marks: 4,
    }),
  );
});
it("does not spend again for marked or concurrently claimed attempts", async () => {
  const from = vi
    .fn()
    .mockReturnValueOnce(chain({ status: "marked", mark: 4 }));
  vi.mocked(admin).mockReturnValue({ from } as never);
  await expect(markOwnCheck("a", "u", { question })).resolves.toMatchObject({
    mark: 4,
  });
  expect(markWritten).not.toHaveBeenCalled();
  from
    .mockReturnValueOnce(chain({ status: "pending" }))
    .mockReturnValueOnce(chain([]));
  await expect(markOwnCheck("a", "u", { question })).rejects.toBeInstanceOf(
    AlreadyMarking,
  );
  expect(markWritten).not.toHaveBeenCalled();
});
it("retains the answer and enables retry when marking fails", async () => {
  const failed = chain(null);
  vi.mocked(admin).mockReturnValue({
    from: vi
      .fn()
      .mockReturnValueOnce(
        chain({
          session_id: "s",
          status: "pending",
          answer_text: "My saved answer",
        }),
      )
      .mockReturnValueOnce(chain([{ id: "a" }]))
      .mockReturnValueOnce(failed),
  } as never);
  vi.mocked(markWritten).mockRejectedValue(new Error("AI budget reached"));
  await expect(markOwnCheck("a", "u", { question })).rejects.toThrow(
    "AI budget reached",
  );
  expect(failed.update).toHaveBeenCalledWith({ status: "failed" });
});

it("marks a one-word bank answer with the exact bank question shape instead of treating it as unanswered", async () => {
  const { markBankCheck } = await import("./single-check-marking");
  const bank = {
    id: "q",
    type: "short",
    marks: 1,
    stem: "Identify the policy.",
    stimulus: null,
    criteria: [{ min: 1, max: 1, descriptor: "Identifies policy" }],
    guideline_notes: null,
    sample_answer: "Fiscal",
    source: "HSC",
  };
  vi.mocked(admin).mockReturnValue({
    from: vi
      .fn()
      .mockReturnValueOnce(chain(bank))
      .mockReturnValueOnce(chain({ status: "pending", answer_text: "Fiscal" }))
      .mockReturnValueOnce(chain([{ id: "a" }]))
      .mockReturnValueOnce(chain({ mark: 1, status: "marked" })),
  } as never);
  vi.mocked(markWritten).mockResolvedValue({
    mark: 1,
    feedback: {},
    check: { status: "agreed", marks: [1, 1] },
  } as never);
  await expect(markBankCheck("a", "u", "q")).resolves.toMatchObject({
    mark: 1,
  });
  expect(markWritten).toHaveBeenCalledWith(bank, "Fiscal", "u");
});
