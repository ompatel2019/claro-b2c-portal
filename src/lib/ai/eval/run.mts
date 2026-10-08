// Offline marking eval against the current engine; --dry-run only reads the DB.
// Run: npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts [--dry-run] [--limit=N] [--label=text]
// Results: src/lib/ai/eval/results/ and /workspace/claro/eval-runs/.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { admin } from "@/utils/supabase/admin";
import { MARKER, markWritten } from "@/lib/marking/engine";
import type { MarkableQuestion } from "@/lib/marking/grade";
import { gradeMessages } from "@/lib/marking/prompts";
import { callJson } from "../openai";
import { evalBlocked, scoreItem } from "./metrics";
import { JUDGE, JudgeSchema, judgeMessages, renderFeedback } from "./judge";
import a1 from "./a1-eval-set.json";
import a1QuestionsJson from "./a1-questions.json";
import claro from "./claro-set.json";
import { writeResults, type Row } from "./report";

const excluded: Record<string, string> = {
  "fm-1": "studentResponse is byte-identical to fm-5 (fixture bug)",
  "ei-4": "3.5 is an invented midpoint",
};
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const limit = Number(
  args.find((a) => a.startsWith("--limit="))?.slice(8) ?? Infinity,
);
const label = args.find((a) => a.startsWith("--label="))?.slice(8) ?? "";
if (
  args.some((a) => !/^(--dry-run|--limit=\d+|--label=.*)$/.test(a)) ||
  limit < 1
) {
  throw new Error(
    "Use --dry-run, --limit=N (positive integer per section), --label=text",
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
const { data: questions } = await db
  .from("questions")
  .select(
    "id,type,marks,stem,stimulus,criteria,guideline_notes,sample_answer,source",
  )
  .in("id", [...new Set(checks.map((c) => c.question_id))])
  .throwOnError();
const items = [
  ...a1.slice(0, limit).map((c) => ({
    id: c.questionId,
    section: "A1",
    q: a1Questions.find((q) => q.id === c.questionId),
    answer: c.studentResponse,
    expected: c.karanExpectedMark as number | number[],
    critique: c.karanFeedback,
    label: "",
  })),
  ...checks.map((c) => ({
    id: c.question_id,
    section: "Claro",
    q: (questions as MarkableQuestion[]).find((q) => q.id === c.question_id),
    answer: c.answer,
    expected: c.expected as number | number[],
    critique: "",
    label: c.label,
  })),
];
mkdirSync(out, { recursive: true });
if (dry) {
  const text = items
    .map((item) => {
      if (!item.q) throw new Error(`Missing question ${item.id}`);
      const messages = gradeMessages(item.q, item.answer);
      return `## ${item.section}: ${item.id} ${item.label}\n\n### Grader messages\n\n\`\`\`json\n${JSON.stringify(messages, null, 2)}\n\`\`\`${item.section === "A1" ? `\n\n### Judge messages\n\n\`\`\`json\n${JSON.stringify(judgeMessages(item.q, item.answer, "[Placeholder: rendered student-facing feedback]", item.critique), null, 2)}\n\`\`\`` : ""}`;
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
async function usageId() {
  const { data } = await db
    .from("ai_usage")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .throwOnError();
  return data?.[0]?.id ?? 0;
}
async function costSince(id: number) {
  const { data } = await db
    .from("ai_usage")
    .select("usd")
    .eq("task", "eval")
    .gt("id", id)
    .throwOnError();
  return (data ?? []).reduce((total, r) => total + Number(r.usd), 0);
}
const rows: Row[] = [];
let blocked = false;
for (const item of items) {
  if (evalBlocked(await spend())) {
    console.error(
      "Eval refused: total AI spend has reached the $80 eval limit. Saving completed items.",
    );
    blocked = true;
    break;
  }
  const row: Row = {
    id: item.id,
    section: item.section,
    label: item.label,
    marks: item.q?.marks ?? null,
    expected: item.expected,
    mark: null,
    band: null,
    delta: null,
    flags: {
      ...(item.section === "A1" && excluded[item.id]
        ? { excluded: excluded[item.id] }
        : {}),
    },
    usd: 0,
    judgeUsd: 0,
    seconds: 0,
    verdict: null,
    feedback: null,
    error: null,
  };
  rows.push(row);
  try {
    const q = item.q;
    if (!q) throw new Error(`Missing question ${item.id}`);
    const before = await usageId();
    const started = performance.now();
    let result;
    try {
      result = await markWritten(q, item.answer, null, "eval");
    } finally {
      row.seconds = (performance.now() - started) / 1000;
      row.usd = await costSince(before);
    }
    row.mark = result.mark;
    row.band = result.band;
    row.flags.validated = result.feedback.validated;
    row.feedback = renderFeedback(result.feedback);
    if (typeof item.expected === "number") {
      row.score = scoreItem({
        criteria: q.criteria,
        marks: q.marks,
        expected: item.expected,
        mark: result.mark,
      });
      row.delta = row.score.delta;
      if (evalBlocked(await spend())) {
        blocked = true;
        throw new Error(
          "Eval refused before judge: total AI spend has reached the $80 eval limit.",
        );
      }
      const judgeBefore = await usageId();
      try {
        row.verdict = await callJson({
          ...JUDGE,
          task: "eval",
          schema: JudgeSchema,
          messages: judgeMessages(q, item.answer, row.feedback, item.critique),
        });
        row.verdict.score = Math.max(1, Math.min(10, row.verdict.score));
        row.flags.lowConfidence = row.verdict.lowConfidence;
      } finally {
        row.judgeUsd = await costSince(judgeBefore);
      }
    } else {
      row.flags.inRange =
        result.mark >= item.expected[0] && result.mark <= item.expected[1];
    }
  } catch (error) {
    row.error = error instanceof Error ? error.message : String(error);
    console.error(`${item.id}: ${row.error}`);
  }
  if (blocked) break;
}
const spentAfter = await spend();
const meta = {
  stamp,
  git: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  label,
  limit: Number.isFinite(limit) ? limit : null,
  marker: MARKER,
  judge: JUDGE,
  spentBefore,
  spentAfter,
  blocked,
};
writeResults(meta, rows);
if (blocked) process.exitCode = 1;
