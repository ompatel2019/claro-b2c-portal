"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
export async function beginHomework(form: FormData) {
  const id = z.uuid().parse(form.get("setId"));
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/admin");
  const db = await createClient();
  // Returns existing session id when one is already in progress (unique per set).
  const { error } = await db.rpc("start_homework", { p_set: id });
  if (error)
    throw new Error(
      error.message.includes("not found")
        ? "This homework is not available."
        : "Could not open this homework. Please try again.",
    );
  redirect(`/homework/${id}/do`);
}
