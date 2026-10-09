// Offline marking eval against the current engine; --dry-run only reads the DB.
// Run: npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts [--dry-run] [--limit=N] [--label=text]
// Results: src/lib/ai/eval/results/ and /workspace/claro/eval-runs/.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { admin } from "@/utils/supabase/admin";
import { MARKER, markWritten } from "@/lib/marking/engine";
import { bandExamples } from "@/lib/marking/examples";
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
// Held-out: A1 mock-exam test rows (the A1 20 eval answers are also split 'test' and stay in their own section).
const { data: heldOut } = await db
  .from("marking_examples")
  .select("question_id, answer_text, tutor_mark")
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
  ...held.map((h) => ({
    id: h.question_id,
    section: "Held-out",
    q: (questions as MarkableQuestion[]).find((q) => q.id === h.question_id),
    answer: h.answer_text,
    expected: Number(h.tutor_mark) as number | number[],
    critique: "",
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
  const row: Row = {
    id: item.id,
    section: item.section,
    label: item.label,
    marks: item.q?.marks ?? null,
    expected: item.expected,
    mark: null,
    band: null,
    check: null,
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
  rows[index] = row;
  try {
    const q = item.q;
    if (!q) throw new Error(`Missing question ${item.id}`);
    const started = performance.now();
    let result;
    try {
      result = await markWritten(q, item.answer, null, `${task}:mark`);
    } finally {
      row.seconds = (performance.now() - started) / 1000;
      row.usd = await cost(`${task}:mark`);
    }
    row.mark = result.mark;
    row.band = result.band;
    row.check = result.check;
    row.flags.validated = result.feedback.validated;
    const feedback = renderFeedback(result.feedback);
    // Held-out feedback quotes A1 students' answers, which stay out of git.
    if (item.section !== "Held-out") row.feedback = feedback;
    if (typeof item.expected === "number") {
      row.score = scoreItem({
        criteria: q.criteria,
        marks: q.marks,
        expected: item.expected,
        mark: result.mark,
      });
      row.firstScore = scoreItem({
        criteria: q.criteria,
        marks: q.marks,
        expected: item.expected,
        mark: result.check.marks[0],
      });
      row.delta = row.score.delta;
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
        result.mark >= item.expected[0] && result.mark <= item.expected[1];
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
