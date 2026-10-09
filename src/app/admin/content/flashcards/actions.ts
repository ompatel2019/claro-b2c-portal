"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { loadTopics } from "@/lib/admin-content";
import { sharedFrontKeys } from "@/lib/admin-flashcards";
import { cardSchema, reviewImport } from "@/lib/flashcard-import";
import { CARD_IMPORT_ROW_LIMIT as IMPORT_MAX_ROWS } from "@/lib/limits";
import { admin } from "@/utils/supabase/admin";

const LIST = "/admin/content/flashcards";
const DUPLICATE = "A Claro card of this kind already has this front.";
const ids = z.array(z.string().min(1).max(200)).min(1).max(500);
const snapshot = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(["draft", "live", "retired"]),
  topic_id: z.string().min(1),
});
async function validTopic(id: string) {
  return (await loadTopics()).some((t) => t.id === id && t.parent_id);
}

/** Add or edit one shared card (the Dialog's one write path). */
export async function saveCard(input: unknown) {
  await requireAdmin();
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...card } = parsed.data;
  if (!(await validTopic(card.topic_id)))
    return { error: "Choose a subtopic." };
  const before = id
    ? await admin()
        .from("flashcards")
        .select("id,status,topic_id")
        .eq("id", id)
        .is("owner_id", null)
        .maybeSingle()
        .throwOnError()
    : null;
  if (id && !before?.data) return { error: "This card no longer exists." };
  const row = { ...card, updated_at: new Date().toISOString() };
  const { error } = id
    ? await admin()
        .from("flashcards")
        .update(row)
        .eq("id", id)
        .is("owner_id", null)
        .select("id")
        .single()
    : await admin()
        .from("flashcards")
        .insert({ ...row, origin: "claro" });
  if (error?.code === "23505") return { error: DUPLICATE };
  if (error) return { error: "Could not save the card." };
  revalidatePath(LIST);
  return {
    ok: true as const,
    previous: before?.data ? [{ ...before.data, topic_id: card.topic_id }] : [],
    version: row.updated_at,
  };
}

export type BulkCardAction =
  | { kind: "publish" }
  | { kind: "retire" }
  | { kind: "topic"; topic_id: string };

export async function bulkFlashcards(
  selected: unknown,
  action: BulkCardAction,
) {
  await requireAdmin();
  const list = ids.parse(selected);
  action = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("publish") }),
      z.object({ kind: z.literal("retire") }),
      z.object({ kind: z.literal("topic"), topic_id: z.string().min(1) }),
    ])
    .parse(action);
  if (action.kind === "topic" && !(await validTopic(action.topic_id)))
    return { error: "Choose a subtopic." };
  const { data: previous } = await admin()
    .from("flashcards")
    .select("id,status,topic_id")
    .in("id", list)
    .is("owner_id", null)
    .throwOnError();
  const version = new Date().toISOString();
  const patch =
    action.kind === "topic"
      ? { topic_id: action.topic_id }
      : { status: action.kind === "publish" ? "live" : "retired" };
  const { data, error } = await admin()
    .from("flashcards")
    .update({ ...patch, updated_at: version })
    .in("id", list)
    .is("owner_id", null)
    .select("id");
  if (error?.code === "23505")
    return {
      error: "A shared card of this kind already has one of these fronts.",
    };
  if (error) return { error: "Could not update the cards." };
  revalidatePath(LIST);
  return {
    ok: true as const,
    done: data?.length ?? 0,
    previous: previous ?? [],
    version,
  };
}

const record = z.object({
  front: z.string().trim().max(1_048_576),
  back: z.string().trim().max(1_048_576),
  topic_id: z.string().max(200),
  kind: z.string().max(200),
});

/** Step 3 of the importer: Ready / Duplicate / Invalid against the shared bank. */
export async function reviewCards(records: unknown) {
  await requireAdmin();
  const topics = new Set(
    (await loadTopics()).filter((t) => t.parent_id).map((t) => t.id),
  );
  return reviewImport(
    z
      .array(record)
      .max(IMPORT_MAX_ROWS)
      .parse(records)
      .map((r) => ({
        ...r,
        topic_id: topics.has(r.topic_id) ? r.topic_id : "",
      })),
    await sharedFrontKeys(),
  );
}

/** Imports the included rows as drafts; returns their ids for Undo. */
export async function importCards(records: unknown) {
  await requireAdmin();
  const ready = (
    await reviewCards(
      z.array(record).min(1).max(IMPORT_MAX_ROWS).parse(records),
    )
  ).filter((r) => r.status === "ready");
  if (!ready.length) return { error: "Nothing ready to import." };
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from("flashcards")
    .insert(
      ready.map(({ front, back, topic_id, kind }) => ({
        front,
        back,
        topic_id,
        kind,
        origin: "claro",
        status: "draft",
        updated_at: now,
      })),
    )
    .select("id");
  if (error) return { error: "Could not import the cards." };
  revalidatePath(LIST);
  return {
    ok: true as const,
    ids: (data ?? []).map((r) => r.id as string),
    version: now,
  };
}

/** Undo for the import toast: deletes the batch just made. */
export async function deleteCards(selected: unknown, version: string) {
  await requireAdmin();
  z.iso.datetime().parse(version);
  const list = ids.parse(selected);
  const { data } = await admin()
    .from("flashcards")
    .delete()
    .in("id", list)
    .is("owner_id", null)
    .eq("origin", "claro")
    .eq("status", "draft")
    .eq("updated_at", version)
    .select("id")
    .throwOnError();
  revalidatePath(LIST);
  return { done: data?.length ?? 0, total: list.length };
}

/** Undo restores only rows that have not been edited since the operation. */
export async function undoFlashcards(input: unknown, version: string) {
  await requireAdmin();
  const previous = z.array(snapshot).min(1).max(500).parse(input);
  z.iso.datetime().parse(version);
  const topics = new Set(
    (await loadTopics()).filter((t) => t.parent_id).map((t) => t.id),
  );
  let done = 0;
  for (const row of previous) {
    if (!topics.has(row.topic_id)) throw new Error("Choose a subtopic.");
    const { data } = await admin()
      .from("flashcards")
      .update({
        status: row.status,
        topic_id: row.topic_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("updated_at", version)
      .is("owner_id", null)
      .select("id")
      .throwOnError();
    done += data?.length ?? 0;
  }
  revalidatePath(LIST);
  return { done, total: previous.length };
}
