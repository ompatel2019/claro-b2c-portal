// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0038_flashcards_hide_origin.sql"),
  "utf8",
)
  .replace(/--[^\n]*/g, "")
  .replace(/\s+/g, " ")
  .toLowerCase();

it("0038 grants students every flashcards column except origin and origin_ref, and changes nothing else", () => {
  expect(sql).toContain(
    "revoke select on public.flashcards from authenticated",
  );
  const grant = sql.match(
    /grant select \(([^)]*)\) on public\.flashcards to authenticated/,
  );
  expect(grant).not.toBeNull();
  const cols = grant![1].split(",").map((c) => c.trim());
  expect(cols).not.toContain("origin");
  expect(cols).not.toContain("origin_ref");
  expect(cols).toEqual(
    expect.arrayContaining([
      "id",
      "topic_id",
      "kind",
      "front",
      "back",
      "owner_id",
      "status",
    ]),
  );
  expect(sql).not.toMatch(
    /\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|marking_examples|public\.questions/,
  );
});
