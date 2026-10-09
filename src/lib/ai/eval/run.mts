// Offline marking eval against the current engine; --dry-run only reads the DB.
// Run: npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts [--dry-run] [--limit=N | --items=0,1,...] [--label=text]
// --items uses 0-based positions in the full array: A1, then Held-out, then Claro.
// Results: src/lib/ai/eval/results/ and /workspace/claro/eval-runs/.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { admin } from "@/utils/supabase/admin";
import { MARKER } from "@/lib/marking/engine";
import { bandExamples } from "@/lib/marking/examples";
import type { MarkableQuestion } from "@/lib/marking/grade";
import { gradeMessages } from "@/lib/marking/prompts";
import { callJson } from "../openai";
import { evalBlocked } from "./metrics";
import { JUDGE, JudgeSchema, judgeMessages } from "./judge";
import { emptyRow, markEvalItem } from "./item";
import a1 from "./a1-eval-set.json";
import a1QuestionsJson from "./a1-questions.json";
import claro from "./claro-set.json";
import { writeResults, type Row } from "./report";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const limit = Number(
  args.find((a) => a.startsWith("--limit="))?.slice(8) ?? Infinity,
);
const label = args.find((a) => a.startsWith("--label="))?.slice(8) ?? "";
const selectedItems =
  args
    .find((a) => a.startsWith("--items="))
    ?.slice(8)
    .split(",")
    .map(Number) ?? null;
if (
  args.some(
    (a) => !/^(--dry-run|--limit=\d+|--items=\d+(,\d+)*|--label=.*)$/.test(a),
  ) ||
  limit < 1 ||
  selectedItems?.some((index) => !Number.isSafeInteger(index)) ||
  (selectedItems !== null && args.some((a) => a.startsWith("--limit=")))
) {
  throw new Error(
    "Use --dry-run, --limit=N (positive integer per section), --items=0,1,... (non-negative integer indices; cannot combine with --limit), --label=text",
  );
}
const parts = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).formatToParts(new Date());
const date = Object.fromEntries(parts.map((p) => [p.type, p.value]));
const stamp = `${date.year}-${date.month}-${date.day}-${date.hour}${date.minute}`;
const out = "/workspace/claro/eval-runs";
const db = admin();
async function spend() {
  const { data, error } = await db.rpc("ai_spend");
  if (error) throw new Error(`ai_spend failed: ${error.message}`);
  if (data == null || !Number.isFinite(Number(data)))
    throw new Error("Invalid ai_spend result");
  return Number(data);
}
const spentBefore = await spend();
if (!dry && evalBlocked(spentBefore)) {
  console.error(
    `Eval refused: total AI spend $${spentBefore.toFixed(4)} has reached the $80 eval limit.`,
  );
  process.exit(1);
}
const a1Questions = a1QuestionsJson as MarkableQuestion[];
const checks = claro.slice(0, limit);
// Held-out: A1 mock-exam test rows (the A1 20 eval answers are also split 'test' and stay in their own section).
const { data: heldOut } = await db
  .from("marking_examples")
  .select("id, question_id, answer_text, tutor_mark")
  .eq("split", "test")
  .not(
    "question_id",
    "in",
    `(${a1Questions.map((q) => `a1-${q.id}`).join(",")})`,
  )
  .order("question_id")
  .order("source_hash")
  .throwOnError();
const held = (heldOut ?? []).slice(0, limit);
const { data: questions } = await db
  .from("questions")
  .select(
    "id,type,marks,stem,stimulus,criteria,guideline_notes,sample_answer,source",
  )
  .in("id", [...new Set([...checks, ...held].map((c) => c.question_id))])
  .throwOnError();
const allItems = [
  ...a1.slice(0, limit).map((c) => ({
    id: c.questionId,
    exampleId: c.questionId,
    section: "A1",
    q: a1Questions.find((q) => q.id === c.questionId),
    answer: c.studentResponse,
    expected: c.karanExpectedMark as number | number[],
    critique: c.karanFeedback,
    label: "",
  })),
  ...held.map((h) => ({
    id: h.question_id,
    exampleId: String(h.id),
    section: "Held-out",
    q: (questions as MarkableQuestion[]).find((q) => q.id === h.question_id),
    answer: h.answer_text,
    expected: Number(h.tutor_mark) as number | number[],
    critique: "",
    label: "",
  })),
  ...checks.map((c, index) => ({
    id: c.question_id,
    exampleId: `claro:${index}:${c.label}`,
    section: "Claro",
    q: (questions as MarkableQuestion[]).find((q) => q.id === c.question_id),
    answer: c.answer,
    expected: c.expected as number | number[],
    critique: "",
    label: c.label,
  })),
];
if (selectedItems?.some((index) => index >= allItems.length)) {
  throw new Error(
    `--items indices must be less than the full item count (${allItems.length})`,
  );
}
const items = allItems.filter(
  (_, index) => selectedItems === null || selectedItems.includes(index),
);
mkdirSync(out, { recursive: true });
if (dry) {
  const text = (
    await Promise.all(
      items.map(async (item) => {
        if (!item.q) throw new Error(`Missing question ${item.id}`);
        return { item, examples: await bandExamples(item.q) };
      }),
    )
  )
    .map(({ item, examples }) => {
      const messages = gradeMessages(item.q!, item.answer, false, examples);
      return `## ${item.section}: ${item.id} ${item.label}\n\n### Grader messages\n\n\`\`\`json\n${JSON.stringify(messages, null, 2)}\n\`\`\`${item.section === "A1" ? `\n\n### Judge messages\n\n\`\`\`json\n${JSON.stringify(judgeMessages(item.q!, item.answer, "[Placeholder: rendered student-facing feedback]", item.critique), null, 2)}\n\`\`\`` : ""}`;
    })
    .join("\n\n");
  const path = `${out}/${stamp}-dry-run.md`;
  writeFileSync(
    path,
    `# Dry-run ${stamp}\n\nLimit: ${limit} per section. Spend: $${spentBefore.toFixed(4)}. Live blocked: ${evalBlocked(spentBefore)}.\n\n${text}\n`,
  );
  console.log(
    `${items.length} items; current spend $${spentBefore.toFixed(4)}; live run ${evalBlocked(spentBefore) ? "BLOCKED" : "allowed"}.\n${path}`,
  );
  process.exit(0);
}
// Items run in parallel, so each call is logged under its own task and costed by it.
async function cost(task: string) {
  const { data } = await db
    .from("ai_usage")
    .select("usd")
    .eq("task", task)
    .throwOnError();
  return (data ?? []).reduce((total, r) => total + Number(r.usd), 0);
}
const rows: Row[] = [];
let blocked = false;
let next = 0;
async function worker() {
  while (!blocked && next < items.length) {
    const index = next++;
    await evaluate(items[index], index);
  }
}
async function evaluate(item: (typeof items)[number], index: number) {
  const task = `eval:${stamp}:${index}`;
  if (evalBlocked(await spend())) {
    console.error(
      "Eval refused: total AI spend has reached the $80 eval limit. Saving completed items.",
    );
    blocked = true;
    return;
  }
  const row = emptyRow(item);
  rows[index] = row;
  try {
    const q = item.q;
    if (!q) throw new Error(`Missing question ${item.id}`);
    const feedback = await markEvalItem(
      row,
      q,
      item.answer,
      `${task}:mark`,
      () => cost(`${task}:mark`),
    );
    if (typeof item.expected === "number") {
      if (item.section !== "A1") return;
      if (evalBlocked(await spend())) {
        blocked = true;
        throw new Error(
          "Eval refused before judge: total AI spend has reached the $80 eval limit.",
        );
      }
      try {
        row.verdict = await callJson({
          ...JUDGE,
          task: `${task}:judge`,
          schema: JudgeSchema,
          messages: judgeMessages(q, item.answer, feedback, item.critique),
        });
        row.verdict.score = Math.max(1, Math.min(10, row.verdict.score));
        row.flags.lowConfidence = row.verdict.lowConfidence;
      } finally {
        row.judgeUsd = await cost(`${task}:judge`);
      }
    } else {
      row.flags.inRange =
        row.mark! >= item.expected[0] && row.mark! <= item.expected[1];
    }
  } catch (error) {
    row.error = error instanceof Error ? error.message : String(error);
    console.error(`${item.id}: ${row.error}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const spentAfter = await spend();
const meta = {
  stamp,
  git: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: !!execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    {
      encoding: "utf8",
    },
  ).trim(),
  label,
  limit: Number.isFinite(limit) ? limit : null,
  items: selectedItems,
  marker: MARKER,
  judge: JUDGE,
  spentBefore,
  spentAfter,
  blocked,
};
writeResults(
  meta,
  rows.filter((r) => r),
);
if (blocked) process.exitCode = 1;
