"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";

/** "Block sign-in" / "Unblock": an auth ban, no data touched (§4.3, Q9). */
export async function setBlocked(userId: string, blocked: boolean) {
  await requireAdmin();
  const id = z.uuid().parse(userId);
  z.boolean().parse(blocked);
  const db = await createClient();
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (profile?.role !== "student") throw new Error("Student not found.");
  const { error } = await admin().auth.admin.updateUserById(id, {
    ban_duration: blocked ? "876000h" : "none",
  });
  if (error) throw new Error("Could not update sign-in access.");
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
}

/**
 * "Open in review": a spot_check review for a marked written attempt. The one
 * write path for reviews outside the dispute route; the queue (§4.7) resolves it.
 */
export async function openSpotCheck(attemptId: string) {
  await requireAdmin();
  const id = z.uuid().parse(attemptId);
  const db = await createClient();
  const { data } = await db
    .rpc("admin_open_student_review", { p_attempt: id })
    .throwOnError();
  revalidatePath("/admin/students", "layout");
  revalidatePath("/admin/marking/review");
  return { id: z.uuid().parse(data) };
}

export async function updateStudentFeedback(
  id: string,
  userId: string,
  status: string,
  reply: string,
) {
  await requireAdmin();
  const value = z
    .object({
      id: z.uuid(),
      userId: z.uuid(),
      status: z.enum(["new", "triaged", "resolved"]),
      reply: z.string().max(2000),
    })
    .parse({ id, userId, status, reply });
  const db = await createClient();
  const { data } = await db
    .from("feedback")
    .update({
      status: value.status,
      admin_note: value.reply,
      resolved_at:
        value.status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", value.id)
    .eq("user_id", value.userId)
    .select("id")
    .maybeSingle()
    .throwOnError();
  if (!data) throw new Error("Feedback missing.");
  revalidatePath(`/admin/students/${value.userId}`);
  revalidatePath("/admin/feedback");
}
