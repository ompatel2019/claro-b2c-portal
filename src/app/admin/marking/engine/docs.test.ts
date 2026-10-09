// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ readdir: vi.fn(), readFile: vi.fn() }));
import { readdir, readFile } from "node:fs/promises";
import { loadDocs } from "./docs";

async function loadDiskDocs() {
  const fs =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  vi.mocked(readdir).mockImplementation(fs.readdir);
  vi.mocked(readFile).mockImplementation(fs.readFile);
  return { fs, docs: await loadDocs() };
}

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

it("loads every real markdown file, ENGINE first then alphabetical", async () => {
  const { fs, docs } = await loadDiskDocs();
  const files = (await fs.readdir("src/lib/ai/docs"))
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) =>
      a === "ENGINE.md" ? -1 : b === "ENGINE.md" ? 1 : a.localeCompare(b),
    );
  expect(docs.map((doc) => `${doc.id}.md`)).toEqual(files);
  expect(docs.map((doc) => doc.id)).toEqual(
    expect.arrayContaining([
      "MARKING-PRINCIPLES",
      "VERB-GUIDE",
      "COMMENT-RULES",
      "CHECK-AND-AGREEMENT",
      "TRANSCRIPTION",
    ]),
  );
  for (const doc of docs) expect(doc.text.trim(), doc.id).not.toBe("");
});

it("keeps every local engine document link resolvable", async () => {
  const { docs } = await loadDiskDocs();
  const ids = new Set(docs.map((doc) => doc.id));
  for (const doc of docs) {
    for (const link of doc.text.matchAll(
      /\]\((\/admin\/marking\/engine\?tab=docs&doc=[^\s)]+)\)/g,
    )) {
      const id = new URL(link[1], "http://localhost").searchParams.get("doc");
      expect(ids.has(id!), `${doc.id}: ${link[1]}`).toBe(true);
    }
  }
});

it("cites existing source paths in every document", async () => {
  const { fs, docs } = await loadDiskDocs();
  const paths = new Set<string>();
  for (const doc of docs) {
    for (const citation of doc.text.matchAll(/`(src\/[^`\s]+)`/g))
      paths.add(citation[1]);
  }
  expect(paths.size).toBeGreaterThan(0);
  for (const path of paths)
    await expect(fs.access(path), path).resolves.toBeUndefined();
});
