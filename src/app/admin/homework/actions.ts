"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyDateTime } from "@/lib/homework";
export type HomeworkFormState = { error?: string };
const Details = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a due date and time."),
  topic: z.string().max(200),
});
const Ids = z
  .array(z.string().min(1).max(200))
  .max(300)
  .transform((ids) => [...new Set(ids)]);
async function adminDb() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return createClient();
}
export async function createHomework(
  _: HomeworkFormState,
  form: FormData,
): Promise<HomeworkFormState> {
  const db = await adminDb();
  const parsed = Details.safeParse({
    title: form.get("title"),
    due: form.get("due"),
    topic: form.get("topic") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let due: string;
  try {
    due = sydneyDateTime(parsed.data.due);
  } catch {
    return { error: "Choose a valid Sydney due date and time." };
  }
  const { data, error } = await db
    .from("homework_sets")
    .insert({
      title: parsed.data.title,
      due_at: due,
      topic_id: parsed.data.topic || null,
    })
    .select("id")
    .single();
  if (error)
    return { error: "Could not create this homework set. Please try again." };
  revalidatePath("/admin/homework");
  redirect(`/admin/homework/${data.id}`);
}
export async function updateHomework(
  _: HomeworkFormState,
  form: FormData,
): Promise<HomeworkFormState> {
  const db = await adminDb();
  const parsed = z
    .object({
      id: z.uuid(),
      operation: z.enum(["save", "publish", "unpublish", "delete"]),
    })
    .safeParse({
      id: form.get("id"),
      operation: form.get("operation") ?? "save",
    });
  if (!parsed.success) return { error: "Choose a valid homework action." };
  const { id, operation } = parsed.data;
  try {
    const [setResult, started] = await Promise.all([
      db.from("homework_sets").select("*").eq("id", id).single().throwOnError(),
      db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("homework_set_id", id)
        .throwOnError(),
    ]);
    const set = setResult.data;
    if (operation === "delete") {
      if (set.published_at || started.count)
        return {
          error: "Only drafts that no student has started can be deleted.",
        };
      await db
        .from("homework_sets")
        .delete()
        .eq("id", id)
        .is("published_at", null)
        .throwOnError();
    } else if (operation === "publish") {
      const { count } = await db
        .from("homework_items")
        .select("position", { count: "exact", head: true })
        .eq("set_id", id)
        .throwOnError();
      if (!count || new Date(set.due_at).getTime() <= Date.now())
        return {
          error:
            "Add at least one item and save a due date in the future before publishing.",
        };
      if (set.published_at) return { error: "This set is already published." };
      await db
        .from("homework_sets")
        .update({ published_at: new Date().toISOString() })
        .eq("id", id)
        .is("published_at", null)
        .throwOnError();
    } else if (operation === "unpublish") {
      if (started.count)
        return {
          error:
            "This set cannot be unpublished because a student has started.",
        };
      await db
        .from("homework_sets")
        .update({ published_at: null })
        .eq("id", id)
        .throwOnError();
    } else {
      const details = Details.safeParse({
        title: form.get("title"),
        due: form.get("due"),
        topic: form.get("topic") ?? "",
      });
      const cards = Ids.safeParse(form.getAll("cards"));
      const questions = Ids.safeParse(form.getAll("questions"));
      if (!details.success) return { error: details.error.issues[0].message };
      if (!cards.success || !questions.success)
        return { error: "Choose valid flashcards and questions." };
      const due = sydneyDateTime(details.data.due);
      const { data: oldItems } = await db
        .from("homework_items")
        .select("position,flashcard_id,question_id")
        .eq("set_id", id)
        .order("position")
        .throwOnError();
      const items = [
        ...cards.data.map((flashcard_id) => ({
          flashcard_id,
          question_id: null as string | null,
        })),
        ...questions.data.map((question_id) => ({
          flashcard_id: null as string | null,
          question_id,
        })),
      ].map((item, i) => ({ ...item, set_id: id, position: i + 1 }));
      const oldIds = (oldItems ?? []).map((i) =>
        i.flashcard_id ? `c:${i.flashcard_id}` : `q:${i.question_id}`,
      );
      const newIds = items.map((i) =>
        i.flashcard_id ? `c:${i.flashcard_id}` : `q:${i.question_id}`,
      );
      const changed = JSON.stringify(oldIds) !== JSON.stringify(newIds);
      if (changed && (set.published_at || started.count))
        return {
          error:
            "Items are locked while published or after any student starts. Your changes were not saved.",
        };
      // Validate both selections before deleting any existing items.
      if (changed) {
        for (const [table, ids] of [
          ["flashcards", cards.data],
          ["questions", questions.data],
        ] as const) {
          if (!ids.length) continue;
          const { data } = await db
            .from(table)
            .select("id")
            .in("id", ids)
            .throwOnError();
          if (data?.length !== ids.length)
            return {
              error: "An item is no longer available. Refresh and try again.",
            };
        }
        await db
          .from("homework_items")
          .delete()
          .eq("set_id", id)
          .throwOnError();
        if (items.length) {
          const { error } = await db.from("homework_items").insert(items);
          if (error) {
            if (oldItems?.length)
              await db
                .from("homework_items")
                .insert(oldItems.map((i) => ({ ...i, set_id: id })))
                .throwOnError();
            return {
              error:
                "Could not save the selection. Your previous items have been restored.",
            };
          }
        }
      }
      await db
        .from("homework_sets")
        .update({
          title: details.data.title,
          due_at: due,
          topic_id: details.data.topic || null,
        })
        .eq("id", id)
        .throwOnError();
    }
  } catch {
    return {
      error:
        "Could not save this homework set. Check the due date and selection, then try again.",
    };
  }
  revalidatePath("/admin/homework");
  revalidatePath(`/admin/homework/${id}`);
  revalidatePath("/homework");
  revalidatePath("/", "layout");
  redirect(
    operation === "delete"
      ? "/admin/homework"
      : `/admin/homework/${id}?saved=1`,
  );
}
