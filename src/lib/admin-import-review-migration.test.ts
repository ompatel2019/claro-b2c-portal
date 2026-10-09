// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const directory = resolve(process.cwd(), "supabase/migrations");
const readSql = (file: string) =>
  readFileSync(resolve(directory, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
const definition =
  /create\s+(?:or\s+replace\s+)?function\s+public\.admin_import_review\s*\([\s\S]*?\bas\s+(\$\w*\$)[\s\S]*?\1\s*;/gi;
const latest = readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .filter((file) => [...readSql(file).matchAll(definition)].length > 0)
  .at(-1);

it.each([...new Set(["0034_import_review_trgm_index.sql", latest])])(
  "%s keeps the candidate search indexable and preserves the review contract",
  (file) => {
    expect(file).toBeDefined();
    const sql = [...readSql(file!).matchAll(definition)].at(-1)?.[0];
    expect(sql).toBeDefined();
    const normalized = sql!.replace(/\s+/g, " ").toLowerCase();
    // Require the operator in the candidate WHERE, not a comment or score projection.
    expect(normalized).toMatch(
      /from public\.questions q where d\.duplicate_of is null[^;]*?and q\.stem operator\(extensions\.%\) d\.stem/,
    );
    expect(normalized).not.toMatch(
      /(?:extensions\.)?similarity\([^)]*\)\s*>=\s*p_threshold/,
    );
    expect(normalized).toMatch(
      /set_config\('pg_trgm\.similarity_threshold', p_threshold::text, true\)/,
    );
    expect(normalized).toContain(
      "p_threshold is null or p_threshold < 0.60 or p_threshold > 0.99",
    );
    expect(normalized).toContain("stable security definer");
    expect(normalized).toMatch(/set search_path (?:to|=) ''/);
    expect(normalized).toContain(
      "if not (select public.is_admin()) then raise exception 'admin only'",
    );
    // Explicit duplicates bypass retirement and threshold checks, but never match themselves.
    expect(normalized).toMatch(
      /from public\.questions q where q\.id = d\.duplicate_of and q\.id <> d\.id\s+union all/,
    );
    expect(normalized).toContain("q.status <> 'retired'");
    expect(normalized).toContain(
      "c.id = d.duplicate_of or c.score >= p_threshold",
    );
    expect(normalized).toContain("order by c.score desc, c.id limit 1");
    expect(normalized).toContain("m.score::double precision");
    // The output and all draft filters remain identical to the original RPC.
    const original = readSql("0030_admin_questions.sql")
      .replace(/\s+/g, " ")
      .toLowerCase();
    expect(
      normalized.slice(
        normalized.indexOf(") m where"),
        normalized.indexOf("end;"),
      ),
    ).toBe(
      original.slice(original.indexOf(") m where"), original.indexOf("end;")),
    );
  },
);

const dashboard =
  /create\s+(?:or\s+replace\s+)?function\s+public\.admin_dashboard\s*\([\s\S]*?\bas\s+(\$\w*\$)[\s\S]*?\1\s*;/gi;

it("0034 only replaces existing functions, retaining their grants", () => {
  const sql = readSql("0034_import_review_trgm_index.sql").trim();
  expect(sql).toMatch(
    /^create or replace function public\.admin_import_review/i,
  );
  expect([...sql.matchAll(definition)]).toHaveLength(1);
  expect([...sql.matchAll(dashboard)]).toHaveLength(1);
  expect(sql.replace(definition, "").replace(dashboard, "").trim()).toBe("");
});

it("the latest admin_dashboard sets the trigram threshold before its % import-review count", () => {
  const file = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => [...readSql(name).matchAll(dashboard)].length > 0)
    .at(-1);
  const sql = [...readSql(file!).matchAll(dashboard)]
    .at(-1)![0]
    .replace(/\s+/g, " ")
    .toLowerCase();
  const threshold = sql.indexOf(
    "set_config('pg_trgm.similarity_threshold', '0.82', true)",
  );
  expect(threshold).toBeGreaterThan(-1);
  expect(sql.indexOf("operator(extensions.%)")).toBeGreaterThan(threshold);
});
