import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import fixture from "./ai/eval/a1-mock-questions.json";

// Migration 0022 must carry every A1 mock question exactly, mapped to a real subtopic.
const sql = readFileSync(
  "supabase/migrations/0022_a1_mock_questions.sql",
  "utf8",
);
const subtopics = new Set(
  [
    ...readFileSync("supabase/migrations/0003_topics.sql", "utf8").matchAll(
      /\('(t\d-[a-z-]+)', 't\d'/g,
    ),
  ].map((m) => m[1]),
);
// One row per "  ($t$a1-" line; fields are $t$-quoted strings or bare literals.
const rows = sql
  .split(/^ {2}\(/m)
  .slice(1)
  .map((row) => {
    const f = [...row.matchAll(/\$t\$([\s\S]*?)\$t\$|([\w.:]+)/g)].map(
      (m) => m[1] ?? m[2],
    );
    // id, type, topic, marks, stem, stimulus, criteria, (jsonb), notes, sample, source, year, origin, ref, verb, status
    return {
      id: f[0].replace(/^a1-/, ""),
      topic: f[2],
      marks: Number(f[3]),
      stem: f[4],
      ref: f[13],
      verb: f[14],
      status: f[15],
    };
  });

it("imports all 41 A1 mock questions as retired rows", () => {
  expect(fixture).toHaveLength(41);
  expect(rows).toHaveLength(41);
  for (const q of fixture) {
    const row = rows.find((r) => r.id === q.id);
    expect(row, q.id).toMatchObject({
      ref: q.id,
      marks: q.marks,
      stem: q.stem,
    });
    expect(subtopics.has(row!.topic), `${q.id} → ${row!.topic}`).toBe(true);
    expect(q.stem.toLowerCase(), q.id).toContain(row!.verb.toLowerCase());
  }
});
