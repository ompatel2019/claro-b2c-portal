import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { admin } from "@/utils/supabase/admin";
import { bounded } from "@/lib/ai/eval/deadline";
import a1 from "@/lib/ai/eval/a1-eval-set.json";
import questions from "@/lib/ai/eval/a1-questions.json";
import claro from "@/lib/ai/eval/claro-set.json";
import { readJson, runPath } from "./store";
import {
  compareRuns,
  indexedItems,
  validRunIds,
  type CompareRun,
  type CompareItem,
  type CompareDetails,
} from "./compare";
const directory = path.join(process.cwd(), "src/lib/ai/eval/results");
const legacyClaroFixtures = (row: Pick<CompareItem, "id" | "label">) =>
  claro.filter(
    (item) => item.question_id === row.id && item.label === row.label,
  );
export async function selectedRuns(a: unknown, b: unknown) {
  const cli = new Set(
    (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -5)),
  );
  // Reject malformed inputs before touching bucket paths.
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    !/^[a-zA-Z0-9-]+$/.test(a) ||
    !/^[a-zA-Z0-9-]+$/.test(b) ||
    a === b
  )
    return null;
  const known = new Set(cli);
  if (!cli.has(a) || !cli.has(b)) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bounded(
        admin().storage.from("evals").list("runs", { limit: 100, offset }),
      );
      if (error) throw new Error(error.message);
      for (const file of data ?? [])
        if (file.name.endsWith(".json")) known.add(file.name.slice(0, -5));
      if (!data || data.length < 100) break;
    }
  }
  if (!validRunIds(a, b, known)) return null;
  const load = async (id: string) =>
    cli.has(id)
      ? (JSON.parse(
          await readFile(path.join(directory, `${id}.json`), "utf8"),
        ) as CompareRun)
      : readJson<CompareRun>(runPath(id));
  const [left, right] = await Promise.all([load(a), load(b)]);
  return left && right ? { left, right, idA: a, idB: b } : null;
}
function fixture(
  row: Pick<CompareItem, "section" | "id" | "label" | "exampleId">,
): {
  answer?: string;
  notes?: string;
  stem?: string;
} {
  if (row.section === "A1") {
    const matches = a1.filter(
      (item) => item.questionId === (row.exampleId ?? row.id),
    );
    const item = matches.length === 1 ? matches[0] : undefined;
    return {
      answer: item?.studentResponse,
      notes: item?.karanFeedback,
      stem: questions.find((q) => q.id === row.id)?.stem,
    };
  }
  if (row.section === "Claro")
    return {
      answer: row.exampleId
        ? claro.find(
            (item, index) => `claro:${index}:${item.label}` === row.exampleId,
          )?.answer
        : (() => {
            const matches = legacyClaroFixtures(row);
            return matches.length === 1 ? matches[0].answer : undefined;
          })(),
    };
  return {};
}
// One bounded query, ordered exactly as the CLI evaluator. Select no personal identifiers.
async function examples(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await bounded(
    admin()
      .from("marking_examples")
      .select(
        "id,source_hash,question_id,answer_text,accepted_tutor_comments,questions(stem)",
      )
      .eq("split", "test")
      .in("question_id", ids)
      .order("question_id")
      .order("source_hash")
      .limit(1000),
  );
  if (error) throw new Error(error.message);
  return data ?? [];
}
function questionStem(
  question: { stem?: string } | { stem?: string }[] | null | undefined,
) {
  return Array.isArray(question) ? question[0]?.stem : question?.stem;
}
const truncate = (stem?: string) =>
  stem && (stem.length > 60 ? `${stem.slice(0, 59)}…` : stem);
export async function loadComparison(a: unknown, b: unknown) {
  const runs = await selectedRuns(a, b);
  if (!runs) return null;
  const comparison = compareRuns(runs.left, runs.right);
  const ids = [
    ...new Set(
      comparison.rows
        .filter((row) => row.section === "Held-out")
        .map((row) => row.id),
    ),
  ];
  const { data: held, error } = ids.length
    ? await bounded(
        admin()
          .from("marking_examples")
          .select("question_id,questions(stem)")
          .eq("split", "test")
          .in("question_id", ids)
          .limit(1000),
      )
    : { data: [], error: null };
  if (error) throw new Error(error.message);
  return {
    ...comparison,
    idA: runs.idA,
    idB: runs.idB,
    labelA: runs.left.meta.label,
    labelB: runs.right.meta.label,
    rows: comparison.rows.map((row) => ({
      ...row,
      stem: truncate(
        fixture(row).stem ??
          questionStem(
            held?.find((item) => item.question_id === row.id)?.questions,
          ),
      ),
    })),
  };
}
export async function loadDetails(
  a: string,
  b: string,
  key: string,
): Promise<CompareDetails> {
  const runs = await selectedRuns(a, b);
  if (!runs) throw new Error("Invalid comparison.");
  const row = compareRuns(runs.left, runs.right).rows.find(
    (row) => row.key === key,
  );
  if (!row) throw new Error("Item not found in both runs.");
  const left = indexedItems(runs.left).find((item) => item.key === key)!.item;
  const right = indexedItems(runs.right).find(
    (item) => item.key === row.keyB,
  )!.item;
  const held =
    row.section === "Held-out" || row.section === "Claro"
      ? await examples([row.id])
      : [];
  const contentFor = (item: CompareItem) => {
    let content = fixture(item);
    let warning: string | undefined;
    let selectedExample: (typeof held)[number] | undefined;
    if (
      !item.exampleId &&
      ((item.section === "Claro" && legacyClaroFixtures(item).length > 1) ||
        (item.section === "A1" &&
          a1.filter((example) => example.questionId === item.id).length > 1))
    )
      warning = "Answer not shown: legacy run without a stable answer id";
    if (item.section === "Held-out") {
      const example = item.exampleId
        ? held.find(
            (example) =>
              String(example.id) === item.exampleId ||
              example.source_hash === item.exampleId,
          )
        : held.length === 1
          ? held[0]
          : undefined;
      if (!item.exampleId && held.length > 1)
        warning = "Answer not shown: legacy run without a stable answer id";
      selectedExample = example;
      if (example) content = { answer: example.answer_text };
    }
    const example =
      selectedExample ??
      held.find((example) => example.answer_text === content.answer);
    const notes = Array.isArray(example?.accepted_tutor_comments)
      ? example.accepted_tutor_comments
          .flatMap((comment) =>
            comment &&
            typeof comment === "object" &&
            "body" in comment &&
            typeof comment.body === "string"
              ? [comment.body]
              : [],
          )
          .join("\n")
      : "";
    return {
      ...content,
      notes: content.notes ?? (notes || undefined),
      warning,
    };
  };
  const contentA = contentFor(left),
    contentB = contentFor(right);
  return {
    answer: contentA.answer,
    answerA: contentA.answer,
    answerB: contentB.answer,
    answerWarningA: contentA.warning,
    answerWarningB: contentB.warning,
    notes: contentA.notes,
    commentsA: left.feedbackComments,
    commentsB: right.feedbackComments,
    markA: left.mark,
    markB: right.mark,
    marksA: left.marks ?? undefined,
    marksB: right.marks ?? undefined,
    feedbackA: left.feedback ?? "No feedback recorded.",
    feedbackB: right.feedback ?? "No feedback recorded.",
  };
}
