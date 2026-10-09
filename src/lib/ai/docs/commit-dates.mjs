import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Captured when Next loads its config; runtime needs no git checkout.
export function docCommitDates(cwd = process.cwd()) {
  const dates = {};
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  try {
    const shallow = git("rev-parse", "--is-shallow-repository") === "true";
    // --git-path also handles worktrees, whose .git is a pointer file.
    const boundaries = shallow
      ? new Set(
          readFileSync(
            path.resolve(cwd, git("rev-parse", "--git-path", "shallow")),
            "utf8",
          )
            .trim()
            .split(/\s+/),
        )
      : new Set();
    for (const file of readdirSync(path.join(cwd, "src/lib/ai/docs"))) {
      if (!file.endsWith(".md")) continue;
      try {
        const [commit, date] = git(
          "log",
          "-1",
          "--format=%H %cI",
          "--",
          `src/lib/ai/docs/${file}`,
        ).split(" ");
        if (
          !boundaries.has(commit) &&
          date &&
          Number.isFinite(Date.parse(date))
        )
          dates[file] = date;
      } catch {
        /* Git/history is optional. */
      }
    }
  } catch {
    /* Docs/history is optional; omit dates if it cannot be verified. */
  }
  return JSON.stringify(dates);
}
