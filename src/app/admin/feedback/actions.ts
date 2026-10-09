"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { contentUndoToken, readContentUndoToken } from "@/lib/admin-content";
import { createClient } from "@/utils/supabase/server";

/** Bulk "Mark triaged" / "Resolve". */
export async function bulkFeedback(ids: unknown, to: "triaged" | "resolved") {
  const admin = await requireAdmin();
  const list = [...new Set(z.array(z.uuid()).min(1).max(50).parse(ids))];
  const target = z.enum(["triaged", "resolved"]).parse(to);
  const db = await createClient();
  const { data: previous } = await db
    .from("feedback")
    .select("id,status,admin_note,resolved_at")
    .in("id", list)
    .throwOnError();
  const { data, error } = await db
    .from("feedback")
    .update({
      status: target,
      resolved_at: target === "resolved" ? new Date().toISOString() : null,
    })
    .in("id", list)
    .select("id,user_id,status,admin_note,resolved_at");
  if (error) return { error: "Could not update the feedback." };
  revalidatePath("/admin/feedback");
  for (const row of data ?? [])
    revalidatePath(`/admin/students/${row.user_id}`);
  revalidatePath("/student/profile");
  revalidatePath("/admin");
  return {
    ok: true as const,
    done: data?.length ?? 0,
    undo: contentUndoToken(
      "feedback",
      admin.id,
      (data ?? []).flatMap(({ id, status, admin_note, resolved_at }) => {
        const before = previous?.find((row) => row.id === id);
        return before
          ? [{ ...before, expected: { status, admin_note, resolved_at } }]
          : [];
      }),
    ),
  };
}

/** Restore signed snapshots only while the action's written state still matches. */
export async function undoFeedback(token: string): Promise<
  | { error: string }
  | {
      ok: true;
      restored: {
        id: string;
        status: "new" | "triaged" | "resolved";
        admin_note?: string | null;
        resolved_at: string | null;
      }[];
    }
> {
  const admin = await requireAdmin();
  const snapshots = z
    .array(
      z.object({
        id: z.uuid(),
        status: z.enum(["new", "triaged", "resolved"]),
        admin_note: z.string().nullable().optional(),
        resolved_at: z.string().nullable(),
        expected: z.object({
          status: z.enum(["new", "triaged", "resolved"]),
          admin_note: z.string().nullable(),
          resolved_at: z.string().nullable(),
        }),
      }),
    )
    .max(50)
    .parse(readContentUndoToken("feedback", admin.id, token));
  const db = await createClient();
  const restored = [];
  for (const { id, expected, ...patch } of snapshots) {
    let query = db
      .from("feedback")
      .update(patch)
      .eq("id", id)
      .eq("status", expected.status);
    for (const field of ["admin_note", "resolved_at"] as const) {
      query =
        expected[field] === null
          ? query.is(field, null)
          : query.eq(field, expected[field]);
    }
    const { data } = await query.select("user_id").maybeSingle().throwOnError();
    if (data) {
      restored.push({ id, ...patch });
      revalidatePath(`/admin/students/${data.user_id}`);
    }
  }
  revalidatePath("/admin/feedback");
  revalidatePath("/student/profile");
  revalidatePath("/admin");
  const skipped = snapshots.length - restored.length;
  if (skipped) {
    return {
      error: restored.length
        ? `Changed since — ${restored.length} undone; ${skipped} skipped.`
        : "Changed since — nothing was undone.",
    };
  }
  return { ok: true as const, restored };
}
