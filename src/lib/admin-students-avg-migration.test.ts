// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const sql = (file: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

it("0035 averages every marked attempt like Home and Progress, and stays additive", () => {
  const migration = sql("0035_admin_students_avg_all_marked.sql");
  expect(migration).toContain(
    "create or replace function public.admin_student_rows()",
  );
  expect(migration).not.toMatch(/\bdrop\b|\bdelete\b|\btruncate\b/);
  // The average no longer reads from an answered-only CTE: it comes from all marked attempts.
  expect(migration).not.toMatch(/from answered a/);
  expect(migration).toContain(
    "from public.attempts a where a.marked_at <= now() group by a.user_id",
  );
  // "Questions answered" still excludes Not answered.
  expect(migration).toContain(
    "a.feedback->>'note' is distinct from 'no answer'",
  );
});
