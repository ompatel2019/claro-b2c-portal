"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  cardSchema,
  normaliseFront,
  exportCards,
  type CardInput,
} from "@/lib/card-import";
import { OWN_FLASHCARD_LIMIT, CARD_IMPORT_ROW_LIMIT } from "@/lib/limits";
import { myCardQuery } from "@/lib/my-card-data";
import { pages } from "@/lib/flashcard-data";

const idsSchema = z
  .array(z.string().min(1).max(200))
  .min(1)
  .max(OWN_FLASHCARD_LIMIT)
  .transform((ids) => [...new Set(ids)]);
type Result = { ids?: string[]; error?: string; warning?: string };
const DUPLICATE = "You already have this card";
async function context() {
  const profile = await requireProfile();
  return { db: await createClient(), userId: profile.id };
}
function refresh() {
  revalidatePath("/student/flashcards/mine");
  revalidatePath("/student/flashcards");
}
const now = () => new Date().toISOString();
async function save(inputs: CardInput[], editId?: string): Promise<Result> {
  const parsed = z
    .array(cardSchema)
    .min(1)
    .max(CARD_IMPORT_ROW_LIMIT)
    .safeParse(inputs);
  if (!parsed.success)
    return { error: "Check the front, back, kind and topic." };
  const keys = parsed.data.map((c) => normaliseFront(c.front));
  if (new Set(keys).size < keys.length) return { error: DUPLICATE };
  try {
    const { db, userId } = await context();
    const [topics, matches, count] = await Promise.all([
      db
        .from("topics")
        .select("id")
        .not("parent_id", "is", null)
        .in(
          "id",
          parsed.data.map((c) => c.topic_id),
        )
        .throwOnError(),
      db
        .from("flashcards")
        .select("id,owner_id")
        .eq("status", "live")
        .in(
          "dedupe_key",
          keys.map((k) => createHash("md5").update(k).digest("hex")),
        )
        .or(`owner_id.is.null,owner_id.eq.${userId}`)
        .throwOnError(),
      editId
        ? null
        : db
            .from("flashcards")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", userId)
            .eq("status", "live")
            .throwOnError(),
    ]);
    if (
      !editId &&
      (count?.count ?? 0) + parsed.data.length > OWN_FLASHCARD_LIMIT
    )
      return { error: "You've reached 2,000 cards. Delete some to add more." };
    if (matches.data.some((c) => c.owner_id === userId && c.id !== editId))
      return { error: DUPLICATE };
    if (!parsed.data.every((c) => topics.data.some((t) => t.id === c.topic_id)))
      return { error: "Choose a valid subtopic" };
    const payload = parsed.data.map((card) => ({
      ...card,
      updated_at: now(),
    }));
    const query = editId
      ? db
          .from("flashcards")
          .update(payload[0])
          .eq("id", editId)
          .eq("owner_id", userId)
          .eq("origin", "student")
          .eq("status", "live")
      : db.from("flashcards").insert(
          payload.map((card) => ({
            ...card,
            owner_id: userId,
            origin: "student",
            status: "live",
          })),
        );
    const { data } = await query.select("id").throwOnError();
    if (!data.length) return { error: "Card not found." };
    refresh();
    return {
      ids: data.map((c) => c.id),
      warning: matches.data.some((c) => c.owner_id === null)
        ? "A Claro card has the same front. Your card was saved."
        : undefined,
    };
  } catch {
    return { error: "Couldn't save your cards. Try again." };
  }
}
export async function saveMyCard(input: CardInput, id?: string) {
  return save([input], id);
}
export async function importMyCards(inputs: CardInput[]) {
  return save(inputs);
}
/** Deleting retires own cards so finished sessions keep their results; Undo relives them. */
async function setStatus(
  ids: string[],
  from: "live" | "retired",
  to: "live" | "retired",
  failure: string,
): Promise<Result> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: "Select valid cards." };
  try {
    const { db, userId } = await context();
    const { data } = await db
      .from("flashcards")
      .update({ status: to, updated_at: now() })
      .eq("owner_id", userId)
      .eq("origin", "student")
      .eq("status", from)
      .in("id", parsed.data)
      .select("id")
      .throwOnError();
    refresh();
    return { ids: data.map((c) => c.id) };
  } catch {
    return { error: failure };
  }
}
export async function deleteMyCards(ids: string[]) {
  return setStatus(
    ids,
    "live",
    "retired",
    "Couldn't delete your cards. Try again.",
  );
}
export async function undoDeleteMyCards(ids: string[]) {
  return setStatus(
    ids,
    "retired",
    "live",
    "Couldn't undo deletion. Try again.",
  );
}
export async function moveMyCards(
  ids: string[],
  topicId: string,
): Promise<Result> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success || typeof topicId !== "string")
    return { error: "Select valid cards and a subtopic." };
  try {
    const { db, userId } = await context();
    const topic = await db
      .from("topics")
      .select("id")
      .eq("id", topicId)
      .not("parent_id", "is", null)
      .maybeSingle()
      .throwOnError();
    if (!topic.data) return { error: "Choose a valid subtopic." };
    const { data } = await db
      .from("flashcards")
      .update({ topic_id: topicId, updated_at: now() })
      .eq("owner_id", userId)
      .eq("origin", "student")
      .eq("status", "live")
      .in("id", parsed.data)
      .select("id")
      .throwOnError();
    refresh();
    return { ids: data.map((c) => c.id) };
  } catch {
    return { error: "Couldn't move your cards. Try again." };
  }
}
export async function exportMyCards(
  params: Record<string, string>,
): Promise<{ csv?: string; error?: string }> {
  try {
    const filters = z.record(z.string(), z.string().max(1000)).parse(params);
    const { db, userId } = await context();
    const [cards, topics] = await Promise.all([
      pages<CardInput>((from, to) =>
        myCardQuery(db, userId, filters)
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, to)
          .overrideTypes<CardInput[], { merge: false }>(),
      ),
      db.from("topics").select("id,name").throwOnError(),
    ]);
    return { csv: exportCards(cards, topics.data) };
  } catch {
    return { error: "Couldn't export your cards. Try again." };
  }
}
/** Fronts of every own card, so the import review can mark duplicates before saving. */
export async function loadMyCardFronts(): Promise<{
  fronts?: string[];
  error?: string;
}> {
  try {
    const { db, userId } = await context();
    const cards = await pages<{ front: string }>((from, to) =>
      db
        .from("flashcards")
        .select("front")
        .eq("owner_id", userId)
        .eq("origin", "student")
        .eq("status", "live")
        .order("id")
        .range(from, to),
    );
    return { fronts: cards.map((c) => c.front) };
  } catch {
    return { error: "Couldn't load your cards. Try again." };
  }
}
