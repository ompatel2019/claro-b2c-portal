// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  dialog: vi.fn(),
  cli: vi.fn(),
  bucket: vi.fn(),
  docs: vi.fn(),
  comparison: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("./actions", () => ({ evalRunDialogData: mocks.dialog }));
vi.mock("../accuracy/eval", () => ({ loadEvalRuns: mocks.cli }));
vi.mock("./store", () => ({ loadBucketRuns: mocks.bucket }));
vi.mock("./docs", () => ({ loadDocs: mocks.docs }));
vi.mock("./compare-data", () => ({ loadComparison: mocks.comparison }));
vi.mock("./new-run", () => ({ NewRun: () => null }));
vi.mock("./compare-view", () => ({ CompareView: () => null }));
vi.mock("./markdown", () => ({ Markdown: () => null }));

import EnginePage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cli.mockResolvedValue([]);
  mocks.bucket.mockResolvedValue([]);
  mocks.docs.mockResolvedValue([]);
  mocks.comparison.mockResolvedValue(null);
});

it.each(["docs", "runs"])(
  "starts %s data while the dialog is still pending",
  async (tab) => {
    let finish!: (value: null) => void;
    mocks.dialog.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const page = EnginePage({ searchParams: Promise.resolve({ tab }) });
    await vi.waitFor(() => {
      expect(mocks.dialog).toHaveBeenCalledOnce();
      if (tab === "docs") expect(mocks.docs).toHaveBeenCalledOnce();
      else {
        expect(mocks.cli).toHaveBeenCalledOnce();
        expect(mocks.bucket).toHaveBeenCalledOnce();
      }
    });
    finish(null);
    await page;
  },
);

it("skips dialog data when comparing", async () => {
  await EnginePage({
    searchParams: Promise.resolve({ tab: "runs", a: "one", b: "two" }),
  });
  expect(mocks.comparison).toHaveBeenCalledWith("one", "two");
  expect(mocks.dialog).not.toHaveBeenCalled();
  expect(mocks.cli).not.toHaveBeenCalled();
  expect(mocks.bucket).not.toHaveBeenCalled();
});

it.each(["dialog", "docs", "cli", "bucket"] as const)(
  "propagates %s loading errors",
  async (source) => {
    mocks[source].mockRejectedValue(new Error("Load failed"));
    await expect(
      EnginePage({
        searchParams: Promise.resolve({
          tab: source === "docs" ? "docs" : "runs",
        }),
      }),
    ).rejects.toThrow("Load failed");
  },
);
