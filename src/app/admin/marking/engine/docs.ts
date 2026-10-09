import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function loadDocs() {
  const directory = path.join(process.cwd(), "src/lib/ai/docs");
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(".md"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let dates: Record<string, string> = {};
  try {
    const metadata = JSON.parse(process.env.ENGINE_DOC_COMMIT_DATES ?? "{}");
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata))
      dates = metadata;
  } catch {
    /* No build metadata. */
  }
  files.sort((a, b) =>
    a === "ENGINE.md" ? -1 : b === "ENGINE.md" ? 1 : a.localeCompare(b),
  );
  return Promise.all(
    files.map(async (file) => ({
      id: file.slice(0, -3),
      text: await readFile(path.join(directory, file), "utf8"),
      committedAt:
        typeof dates[file] === "string" &&
        Number.isFinite(Date.parse(dates[file]))
          ? dates[file]
          : null,
    })),
  );
}
