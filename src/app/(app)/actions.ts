"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
export type FormState = { error?: string; message?: string };
const SprintConfig = z.object({
  mode: z.enum(["mcq", "short", "extended", "mixed"]),
  include_extended: z.boolean().default(false),
  topics: z
    .array(z.string().min(1))
    .max(2, "Choose up to two topics.")
    .default([]),
  subtopics: z.array(z.string().min(1)).max(40).default([]),
  size_by: z.enum(["marks", "questions"]).optional(),
  target: z.number().int().optional(),
  difficulty: z
    .array(z.enum(["foundation", "standard", "challenging"]))
    .default([]),
  verbs: z.array(z.string().max(40)).max(20).default([]),
  year_from: z.number().int().nullable().default(null),
  year_to: z.number().int().nullable().default(null),
  origins: z.array(z.enum(["nesa", "a1"])).default([]),
  history: z
    .enum(["prefer_new", "new_only", "mistakes", "flagged", "any"])
    .default("prefer_new"),
  order: z.enum(["exam", "shuffled"]).default("exam"),
  timed: z.boolean().default(true),
  pace: z.enum(["hsc", "relaxed", "custom"]).default("hsc"),
  custom_minutes: z.number().int().min(5).max(180).default(45),
  on_timeout: z.enum(["overtime", "finish"]).default("overtime"),
  feedback: z.enum(["end", "each"]).default("end"),
});
/** §3.2: the setup page (and quick starts) post the config as JSON; start_sprint validates the rest. */
export async function startSprint(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("config")));
  } catch {
    return { error: "Your sprint settings could not be read." };
  }
  const parsed = SprintConfig.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await createClient();
  const { data, error } = await db.rpc("start_sprint", {
    p_config: parsed.data,
  });
  if (error)
    return {
      error: /no questions match/.test(error.message)
        ? "No questions match these settings."
        : /out of range|invalid|at most/.test(error.message)
          ? "Check your sprint settings."
          : "Try again.",
    };
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

export async function changePassword(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await requireProfile();
  const parsed = z
    .object({
      password: z.string().min(8, "Password must be at least 8 characters."),
      confirm: z.string().min(8, "Confirm your new password."),
    })
    .safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.password !== parsed.data.confirm)
    return { error: "Passwords do not match." };
  const db = await createClient();
  const { error } = await db.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: error.message };
  return { message: "Your password is updated." };
}

export async function signOutEverywhere() {
  const db = await createClient();
  await db.auth.signOut({ scope: "global" });
  redirect("/sign-in");
}
