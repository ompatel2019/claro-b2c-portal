import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { latestEval } from "./data";
import type { OfflineEvalRun } from "../engine/summary";

export async function loadEvalRuns() {
  // Included in this route's serverless bundle by next.config.ts.
  const directory = path.join(process.cwd(), "src/lib/ai/eval/results");
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const runs = await Promise.all(
    files.map(
      async (file) =>
        JSON.parse(
          await readFile(path.join(directory, file), "utf8"),
        ) as OfflineEvalRun,
    ),
  );
  return runs;
}

export async function loadLatestEval() {
  return latestEval(await loadEvalRuns());
}
