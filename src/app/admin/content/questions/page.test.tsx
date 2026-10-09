import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadQuestionCounts: vi.fn(),
  loadTopics: vi.fn(),
  loadImportReview: vi.fn(),
  loadQuestionList: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin-questions", () => ({
  loadQuestionCounts: mocks.loadQuestionCounts,
  loadTopics: mocks.loadTopics,
  loadImportReview: mocks.loadImportReview,
  loadQuestionList: mocks.loadQuestionList,
}));
vi.mock("@/components/filter-bar", () => ({ FilterBar: () => null }));
vi.mock("@/components/import-review", () => ({ ImportReview: () => null }));
vi.mock("@/components/questions-table", () => ({ QuestionsTable: () => null }));
import QuestionsPage from "./page";

const counts = { live: 1, draft: 0, retired: 0 };
const pager = {
  page: 1,
  pages: 1,
  total: 0,
  sort: { id: "id", dir: "asc" as const },
};
const review = { tabCount: 0, rows: [], pager };
const list = { rows: [], pager };

function deferred<T>(value: T) {
  let resolve!: () => void;
  const promise = new Promise<T>((done) => {
    resolve = () => done(value);
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ role: "admin" });
  mocks.loadQuestionCounts.mockResolvedValue(counts);
  mocks.loadTopics.mockResolvedValue([]);
  mocks.loadImportReview.mockResolvedValue(review);
  mocks.loadQuestionList.mockResolvedValue(list);
});

it("starts all four loaders before any resolves for the default live status", async () => {
  const pendingCounts = deferred(counts);
  const pendingTopics = deferred([]);
  const pendingReview = deferred(review);
  const pendingList = deferred(list);
  mocks.loadQuestionCounts.mockReturnValue(pendingCounts.promise);
  mocks.loadTopics.mockReturnValue(pendingTopics.promise);
  mocks.loadImportReview.mockReturnValue(pendingReview.promise);
  mocks.loadQuestionList.mockReturnValue(pendingList.promise);

  const page = QuestionsPage({ searchParams: Promise.resolve({}) });
  try {
    await vi.waitFor(() => {
      expect(mocks.loadQuestionCounts).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.loadTopics).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.loadImportReview).toHaveBeenCalledExactlyOnceWith(
        0.82,
        NaN,
        false,
        {},
      );
      expect(mocks.loadQuestionList).toHaveBeenCalledExactlyOnceWith({});
    });
  } finally {
    pendingCounts.resolve();
    pendingTopics.resolve();
    pendingReview.resolve();
    pendingList.resolve();
    await page;
  }
});

it("skips the question list for the review status", async () => {
  const filters = { status: "review", type: "mcq" };
  await QuestionsPage({ searchParams: Promise.resolve(filters) });

  expect(mocks.loadQuestionCounts).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.loadTopics).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.loadImportReview).toHaveBeenCalledExactlyOnceWith(
    0.82,
    NaN,
    true,
    filters,
  );
  expect(mocks.loadQuestionList).not.toHaveBeenCalled();
});
