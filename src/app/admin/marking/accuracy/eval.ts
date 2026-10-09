import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { latestEval, type EvalRun } from "./data";

export async function loadLatestEval() {
  // Included in this route's serverless bundle by next.config.ts.
  const directory = path.join(process.cwd(), "src/lib/ai/eval/results");
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith(".json"),
  );
  const runs = await Promise.all(
    files.map(
      async (file) =>
        JSON.parse(
          await readFile(path.join(directory, file), "utf8"),
        ) as EvalRun,
    ),
  );
  return latestEval(runs);
}
