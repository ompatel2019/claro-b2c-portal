// One-off, re-runnable import of anonymised A1 mock-exam answers into Claro's marking_examples.
// The snapshot comes from the read-only, anonymising SELECT in /workspace/claro/a1-export/export.sql
// (run against A1 via the Supabase connector) and stays outside git:
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/import-a1-examples.mts <snapshot.json> [--dry-run]
// Rows upsert on source_hash (md5 of the A1 submission and question ids), so re-runs add nothing new.
import { readFileSync } from "node:fs";
import { admin } from "@/utils/supabase/admin";
import type { MarkableQuestion } from "@/lib/marking/grade";
import evalSet from "./a1-eval-set.json";
import questionsJson from "./a1-mock-questions.json";
import { splitExamples } from "./split";

type Snapshot = {
  question: string;
  source_hash: string;
  answer_text: string;
  tutor_mark: number;
  accepted_tutor_comments: unknown[];
  rejected_ai_comments: unknown[];
};
const [path, ...flags] = process.argv.slice(2);
if (!path || flags.some((f) => f !== "--dry-run"))
  throw new Error("Usage: import-a1-examples.mts <snapshot.json> [--dry-run]");
const dry = flags.includes("--dry-run");
const questions = new Map(
  (questionsJson as MarkableQuestion[]).map((q) => [q.id, q]),
);
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const evalAnswers = new Set(evalSet.map((e) => norm(e.studentResponse)));
const snapshot = JSON.parse(readFileSync(path, "utf8")) as Snapshot[];
const rows = splitExamples(snapshot).map((r) => {
  const q = questions.get(r.question);
  if (!q) throw new Error(`Unknown question ${r.question}`);
  if (evalAnswers.has(norm(r.answer_text)))
    throw new Error(`An A1 eval-set answer is in the snapshot (${r.question})`);
  return {
    question_id: `a1-${r.question}`,
    answer_text: r.answer_text,
    tutor_mark: r.tutor_mark,
    band:
      q.criteria.find((c) => r.tutor_mark >= c.min && r.tutor_mark <= c.max)
        ?.descriptor ?? null,
    accepted_tutor_comments: r.accepted_tutor_comments,
    rejected_ai_comments: r.rejected_ai_comments,
    split: r.split,
    origin: "a1",
    source_hash: r.source_hash,
  };
});
const db = admin();
const { data: present } = await db
  .from("questions")
  .select("id")
  .in("id", [...new Set(rows.map((r) => r.question_id))])
  .throwOnError();
const missing = [...new Set(rows.map((r) => r.question_id))].filter(
  (id) => !present?.some((p) => p.id === id),
);
const count = (split: string) => rows.filter((r) => r.split === split).length;
console.log(
  `${rows.length} answers over ${questions.size} questions: ${count("test")} test, ${count("example")} example.`,
);
if (missing.length) {
  console.error(
    `Missing Claro questions (${missing.length}): ${missing.join(", ")}`,
  );
  if (!dry) process.exit(1);
}
if (dry) process.exit(0);
for (let i = 0; i < rows.length; i += 500)
  await db
    .from("marking_examples")
    .upsert(rows.slice(i, i + 500), {
      onConflict: "source_hash",
      ignoreDuplicates: true,
    })
    .throwOnError();
const { count: stored } = await db
  .from("marking_examples")
  .select("id", { count: "exact", head: true })
  .eq("origin", "a1")
  .throwOnError();
console.log(`Upserted. marking_examples origin a1 now has ${stored} rows.`);
