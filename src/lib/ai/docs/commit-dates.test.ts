// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { docCommitDates } from "./commit-dates.mjs";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: vi.fn(), readdirSync: vi.fn() }));
const date = "2026-10-09T14:40:00+11:00";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readdirSync).mockReturnValue([
    "ENGINE.md",
    "CHANGELOG.md",
    "commit-dates.mjs",
  ] as never);
  vi.mocked(execFileSync).mockImplementation((_file, args) => {
    if (args?.includes("--is-shallow-repository")) return "true\n";
    if (args?.includes("--git-path")) return "/repo/common-git/shallow\n";
    return `${args?.includes("src/lib/ai/docs/ENGINE.md") ? "later" : "boundary"} ${date}\n`;
  });
  vi.mocked(readFileSync).mockReturnValue("boundary\n");
});
it("omits shallow boundary dates and preserves later doc commits, using the worktree git path", () => {
  expect(JSON.parse(docCommitDates("/repo/worktree"))).toEqual({
    "ENGINE.md": date,
  });
  expect(readFileSync).toHaveBeenCalledWith("/repo/common-git/shallow", "utf8");
});
it("keeps all dates in complete history without reading shallow boundaries", () => {
  vi.mocked(execFileSync).mockImplementation((_file, args) =>
    args?.includes("--is-shallow-repository")
      ? "false\n"
      : `boundary ${date}\n`,
  );
  expect(JSON.parse(docCommitDates("/repo"))).toEqual({
    "ENGINE.md": date,
    "CHANGELOG.md": date,
  });
  expect(readFileSync).not.toHaveBeenCalled();
});
it("omits unverifiable history and invalid dates", () => {
  vi.mocked(readFileSync).mockImplementation(() => {
    throw new Error("Missing shallow file");
  });
  expect(docCommitDates("/repo")).toBe("{}");
  vi.mocked(execFileSync).mockImplementation((_file, args) =>
    args?.includes("--is-shallow-repository") ? "false\n" : "commit invalid\n",
  );
  expect(docCommitDates("/repo")).toBe("{}");
  vi.mocked(execFileSync).mockImplementation(() => {
    throw new Error("No git");
  });
  expect(docCommitDates("/repo")).toBe("{}");
});
