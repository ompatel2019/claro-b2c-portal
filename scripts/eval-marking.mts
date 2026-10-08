// Marks hand-written answers (scripts/eval-set.json) to real NESA questions through the real marking engine,
// in parallel, and writes a results table to /workspace/claro/eval-results.md. Costs are logged to ai_usage.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/eval-marking.mts
import { readFileSync, writeFileSync } from "node:fs";

import type { MarkableQuestion } from "@/lib/marking/grade";
import { markWritten } from "@/lib/marking/engine";
import { admin } from "@/utils/supabase/admin";

type Case = {
  question_id: string;
  label: string;
  expected: [number, number];
  answer: string;
};
const cases = JSON.parse(
  readFileSync(new URL("./eval-set.json", import.meta.url), "utf8"),
) as Case[];
const { data: questions, error } = await admin()
  .from("questions")
  .select("*")
  .in("id", [...new Set(cases.map((c) => c.question_id))]);
if (error) throw error;
const spentBefore = Number((await admin().rpc("ai_spend")).data);

const rows = await Promise.all(
  cases.map(async (c) => {
    const q = questions.find((x) => x.id === c.question_id) as MarkableQuestion;
    const started = Date.now();
    const result = await markWritten(q, c.answer, null);
    const seconds = (Date.now() - started) / 1000;
    const pass = result.mark >= c.expected[0] && result.mark <= c.expected[1];
    return { c, q, result, seconds, pass };
  }),
);

const spent = Number((await admin().rpc("ai_spend")).data) - spentBefore;
const lines = [
  `# Marking eval (${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} Sydney)`,
  "",
  "| Question | Answer | Expected | Mark | Validated | Time (s) | Result |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(
    ({ c, q, result, seconds, pass }) =>
      `| ${q.source} (${q.marks}) | ${c.label} | ${c.expected.join("-")} | ${result.mark} | ${result.feedback.validated} | ${seconds.toFixed(1)} | ${pass ? "PASS" : "MISS"} |`,
  ),
  "",
  `${rows.filter((r) => r.pass).length}/${rows.length} within expected range. Eval cost: $${spent.toFixed(4)}.`,
  "",
  ...rows.map(
    ({ c, q, result }) =>
      `- **${q.source} ${c.label}**: ${result.band}. ${result.feedback.justification}`,
  ),
];
writeFileSync(
  process.env.EVAL_OUT ?? "/workspace/claro/eval-results.md",
  lines.join("\n") + "\n",
);
console.log(lines.slice(0, rows.length + 6).join("\n"));
