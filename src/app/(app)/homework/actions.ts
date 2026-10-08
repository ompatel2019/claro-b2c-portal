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
  await db.rpc("start_homework", { p_set: id }).throwOnError();
  redirect(`/homework/${id}/do`);
}
