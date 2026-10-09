"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";
import {
  VERBS,
  publishProblems,
  questionSchema,
  type QuestionInput,
} from "@/lib/question-bank";

const LIST = "/admin/content/questions";
const ids = z
  .array(z.string().regex(/^[a-z0-9-]{3,40}$/))
  .min(1)
  .max(200);

function toRow(q: QuestionInput) {
  const mc = q.type === "mcq";
  return {
    ...q,
    options: mc ? q.options : null,
    correct_index: mc ? q.correct_index : null,
    explanation: mc ? q.explanation || null : null,
    criteria: mc ? null : (q.criteria ?? []),
    guideline_notes: mc ? null : q.guideline_notes || null,
    sample_answer: mc ? null : q.sample_answer || null,
    stimulus: q.stimulus || null,
  };
}

const DUPLICATE = "Another question has the same stem and options.";
const conflictOf = (code?: string) =>
  code === "23505"
    ? DUPLICATE
    : code === "23514"
      ? "Check the type, marks and options."
      : null;

/**
 * Save the editor (new or existing). `expected` is the updated_at the editor
 * loaded; a different value in the database means another admin saved first.
 */
export async function saveQuestion(
  input: unknown,
  expected: string | null,
): Promise<
  | { ok: true; id: string; updated_at: string }
  | { error: string }
  | { conflict: string }
> {
  await requireAdmin();
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const q = parsed.data;
  if (q.status === "live") {
    const problems = publishProblems(q);
    if (problems.length) return { error: problems.join(" ") };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("admin_save_question", {
    p_row: toRow(q),
    p_expected: expected,
  });
  if (error)
    return {
      error:
        error.code === "23505" && error.message.includes("questions_pkey")
          ? "This ID is already taken."
          : (conflictOf(error.code) ?? "Could not save."),
    };
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${q.id}`);
  return data;
}

export type QuestionUndo = {
  id: string;
  expected: string;
  status: "draft" | "live" | "retired";
  topic_id: string;
  verb: string | null;
  duplicate_of: string | null;
};

export async function undoQuestionChanges(input: unknown) {
  await requireAdmin();
  const rows = z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{3,40}$/),
        expected: z.iso.datetime({ offset: true }),
        status: z.enum(["draft", "live", "retired"]),
        topic_id: z.string().min(1).max(100),
        verb: z.enum(VERBS).nullable(),
        duplicate_of: z.string().nullable(),
      }),
    )
    .max(200)
    .parse(input);
  for (const row of rows) {
    const { id, expected, ...patch } = row;
    const { data: current } = await admin()
      .from("questions")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .throwOnError();
    if (!current || Date.parse(current.updated_at) !== Date.parse(expected))
      throw new Error("A question changed. Reload before undoing.");
    if (patch.status === "live") {
      const parsed = questionSchema.safeParse({ ...current, ...patch });
      if (!parsed.success || publishProblems(parsed.data).length)
        throw new Error("This question no longer meets the publish rules.");
    }
    const { data } = await admin()
      .from("questions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("updated_at", expected)
      .select("id")
      .throwOnError();
    if (!data?.length)
      throw new Error("A question changed. Reload before undoing.");
  }
  revalidatePath(LIST);
}

export type BulkAction =
  | { kind: "publish" }
  | { kind: "retire" }
  | { kind: "delete" }
  | { kind: "topic"; topic_id: string }
  | { kind: "verb"; verb: string | null };

/** Bulk actions from the list; publishing validates each row and reports failures. */
export async function bulkQuestions(
  selected: unknown,
  action: BulkAction,
): Promise<{
  done: number;
  failures: { id: string; problem: string }[];
  undo: QuestionUndo[];
}> {
  await requireAdmin();
  const list = [...new Set(ids.parse(selected))];
  action = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("publish") }),
      z.object({ kind: z.literal("retire") }),
      z.object({ kind: z.literal("delete") }),
      z.object({
        kind: z.literal("topic"),
        topic_id: z.string().min(1).max(100),
      }),
      z.object({ kind: z.literal("verb"), verb: z.enum(VERBS).nullable() }),
    ])
    .parse(action);
  if (action.kind === "topic") {
    const { data } = await admin()
      .from("topics")
      .select("id")
      .eq("id", action.topic_id)
      .not("parent_id", "is", null)
      .maybeSingle()
      .throwOnError();
    if (!data) throw new Error("Choose a subtopic.");
  }
  const db = admin();
  const failures: { id: string; problem: string }[] = [];
  const now = new Date().toISOString();
  const { data: previous } = await db
    .from("questions")
    .select("id,status,topic_id,verb,duplicate_of,updated_at")
    .in("id", list)
    .throwOnError();
  const undo: QuestionUndo[] = [];
  const remember = (id: string) => {
    const row = previous?.find((r) => r.id === id);
    if (row)
      undo.push({
        id: row.id,
        expected: now,
        status: row.status as QuestionUndo["status"],
        topic_id: row.topic_id,
        verb: row.verb,
        duplicate_of: row.duplicate_of,
      });
  };
  if (action.kind === "topic" || action.kind === "verb") {
    const patch =
      action.kind === "topic"
        ? { topic_id: z.string().min(1).parse(action.topic_id) }
        : { verb: action.verb };
    for (const row of previous ?? []) {
      const { data } = await db
        .from("questions")
        .update({ ...patch, updated_at: now })
        .eq("id", row.id)
        .eq("updated_at", row.updated_at)
        .select("id")
        .throwOnError();
      if (data?.length) remember(row.id);
      else
        failures.push({
          id: row.id,
          problem: "Changed by another admin. Reload and try again.",
        });
    }
    revalidatePath(LIST);
    return { done: undo.length, failures, undo };
  }
  if (action.kind === "retire") {
    for (const row of previous ?? []) {
      const { data } = await db
        .from("questions")
        .update({ status: "retired", updated_at: now })
        .eq("id", row.id)
        .eq("updated_at", row.updated_at)
        .select("id")
        .throwOnError();
      if (data?.length) remember(row.id);
      else
        failures.push({
          id: row.id,
          problem: "Changed by another admin. Reload and try again.",
        });
    }
    revalidatePath(LIST);
    return { done: undo.length, failures, undo };
  }
  const { data: rows } = await db
    .from("questions")
    .select(
      "id,type,topic_id,marks,verb,source,year,stem,stimulus,options,correct_index,explanation,criteria,guideline_notes,sample_answer,status,updated_at",
    )
    .in("id", list)
    .throwOnError();
  let done = 0;
  for (const r of rows ?? []) {
    if (action.kind === "delete") {
      const client = await createClient();
      const { data: deleted, error } = await client.rpc(
        "admin_delete_question",
        { p_id: r.id },
      );
      if (error || !deleted)
        failures.push({
          id: r.id,
          problem:
            error?.code === "23503"
              ? "Used by a paper, example or duplicate. Retire it instead."
              : "Only drafts with no attempts can be deleted. Retire it instead.",
        });
      else done++;
      continue;
    }
    if (previous?.find((row) => row.id === r.id)?.updated_at !== r.updated_at) {
      failures.push({
        id: r.id,
        problem: "Changed by another admin. Reload and try again.",
      });
      continue;
    }
    const parsed = questionSchema.safeParse({ ...r, status: "live" });
    const problems = parsed.success
      ? publishProblems(parsed.data)
      : [parsed.error.issues[0].message];
    if (problems.length) {
      failures.push({ id: r.id, problem: problems.join(" ") });
      continue;
    }
    const { data: published, error } = await db
      .from("questions")
      .update({ status: "live", updated_at: now })
      .eq("id", r.id)
      .eq("updated_at", r.updated_at)
      .select("id");
    if (error || !published?.length)
      failures.push({
        id: r.id,
        problem:
          conflictOf(error?.code) ??
          "Changed or could not publish. Reload and try again.",
      });
    else {
      done++;
      remember(r.id);
    }
  }
  revalidatePath(LIST);
  return { done, failures, undo };
}

/** Import review: merge a draft into its match (sets duplicate_of, retires the draft). */
export async function mergeDraft(draftId: string, intoId: string) {
  await requireAdmin();
  const [draft, into] = ids.parse([draftId, intoId]);
  if (draft === into) throw new Error("Choose another question.");
  const { data: before } = await admin()
    .from("questions")
    .select("id,status,topic_id,verb,duplicate_of,updated_at")
    .eq("id", draft)
    .eq("status", "draft")
    .maybeSingle()
    .throwOnError();
  if (!before) throw new Error("This draft has changed. Reload and try again.");
  const now = new Date().toISOString();
  const { data: target } = await admin()
    .from("questions")
    .select("id")
    .eq("id", into)
    .maybeSingle()
    .throwOnError();
  if (!target) throw new Error("The match no longer exists.");
  const { data } = await admin()
    .from("questions")
    .update({
      duplicate_of: into,
      status: "retired",
      updated_at: now,
    })
    .eq("id", draft)
    .eq("updated_at", before.updated_at)
    .eq("status", "draft")
    .select("id")
    .throwOnError();
  if (!data?.length)
    throw new Error("This draft has changed. Reload and try again.");
  revalidatePath(LIST);
  return [
    {
      id: before.id,
      expected: now,
      status: "draft",
      topic_id: before.topic_id,
      verb: before.verb,
      duplicate_of: before.duplicate_of,
    },
  ] satisfies QuestionUndo[];
}
