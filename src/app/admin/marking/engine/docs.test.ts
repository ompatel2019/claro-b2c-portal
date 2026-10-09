// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ readdir: vi.fn(), readFile: vi.fn() }));
import { readdir, readFile } from "node:fs/promises";
import { loadDocs } from "./docs";

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("loads markdown only, ENGINE first, with valid build-time dates", async () => {
  vi.mocked(readdir).mockResolvedValue([
    "CHANGELOG.md",
    "ignored.json",
    "ENGINE.md",
    "OTHER.md",
  ] as never);
  vi.mocked(readFile).mockResolvedValue("# Safe text");
  vi.stubEnv(
    "ENGINE_DOC_COMMIT_DATES",
    JSON.stringify({
      "ENGINE.md": "2026-10-09T14:40:00+11:00",
      "CHANGELOG.md": "invalid",
    }),
  );
  expect(await loadDocs()).toEqual([
    {
      id: "ENGINE",
      text: "# Safe text",
      committedAt: "2026-10-09T14:40:00+11:00",
    },
    { id: "CHANGELOG", text: "# Safe text", committedAt: null },
    { id: "OTHER", text: "# Safe text", committedAt: null },
  ]);
  expect(readFile).toHaveBeenCalledTimes(3);
  expect(vi.mocked(readdir).mock.calls[0][0]).toMatch(/src\/lib\/ai\/docs$/);
});
it("returns no docs for a missing or empty folder", async () => {
  vi.mocked(readdir).mockRejectedValueOnce(
    Object.assign(new Error("missing"), { code: "ENOENT" }),
  );
  expect(await loadDocs()).toEqual([]);
  vi.mocked(readdir).mockResolvedValueOnce([]);
  expect(await loadDocs()).toEqual([]);
  expect(readFile).not.toHaveBeenCalled();
});
it("shows no dates without build metadata or with malformed metadata", async () => {
  vi.mocked(readdir).mockResolvedValue(["ENGINE.md"] as never);
  vi.mocked(readFile).mockResolvedValue("text");
  vi.stubEnv("ENGINE_DOC_COMMIT_DATES", "");
  expect((await loadDocs())[0].committedAt).toBeNull();
  for (const invalid of ["bad json", "null", "[]", '{"ENGINE.md":42}']) {
    vi.stubEnv("ENGINE_DOC_COMMIT_DATES", invalid);
    expect((await loadDocs())[0].committedAt).toBeNull();
  }
});
it("surfaces real filesystem failures to the error boundary", async () => {
  vi.mocked(readdir).mockRejectedValue(
    Object.assign(new Error("denied"), { code: "EACCES" }),
  );
  await expect(loadDocs()).rejects.toThrow("denied");
});
