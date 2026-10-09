// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const raw = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0037_delete_a1_mock_drafts.sql"),
  "utf8",
);
const sql = raw
  .replace(/--[^\n]*/g, "")
  .replace(/\s+/g, " ")
  .toLowerCase();

it("0037 deletes only the listed unreferenced A1 mock drafts and guards the count", () => {
  const ids = raw.match(/'a1-x-[0-9a-f]{12}'/g) ?? [];
  expect(new Set(ids).size).toBe(25);
  expect(sql).toContain("delete from public.questions q");
  expect(sql).toContain("q.origin = 'a1'");
  expect(sql).toContain("q.status = 'draft'");
  expect(sql).toContain("q.source like 'a1 hsc mock%'");
  expect(sql).toContain("if removed > 25 then raise exception");
  // Never retired mock questions, other tables, or marking_examples writes.
  expect(sql).not.toMatch(/\bdrop\b|\btruncate\b|update public|insert into/);
  expect(sql.match(/delete from/g)).toHaveLength(1);
  expect(sql).toContain(
    "not exists (select 1 from public.marking_examples e where e.question_id = q.id)",
  );
});
