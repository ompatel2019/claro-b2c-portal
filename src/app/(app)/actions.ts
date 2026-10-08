"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
export type FormState = { error?: string; message?: string };
export async function startSprint(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/admin");
  const parsed = z
    .object({
      mode: z.enum(["mcq", "short", "extended", "mixed"]),
      topics: z.array(z.string().min(1)).max(2, "Choose up to two topics."),
    })
    .safeParse({ mode: form.get("mode"), topics: form.getAll("topics") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await createClient();
  const { data, error } = await db.rpc("start_sprint", {
    p_mode: parsed.data.mode,
    p_topics: parsed.data.topics,
  });
  if (error) return { error: error.message };
  redirect(`/practice/${data}`);
}
export async function saveProfile(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  const parsed = z
    .object({
      full_name: z.string().trim().min(1, "Enter your name.").max(100),
      year_level: z
        .union([z.literal("11"), z.literal("12"), z.literal("")])
        .transform((v) => (v ? Number(v) : null)),
      school: z.string().trim().max(200),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await createClient();
  const { error } = await db
    .from("profiles")
    .update(parsed.data)
    .eq("id", profile.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { message: "Your profile is saved." };
}
