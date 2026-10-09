"use server";
import { admin } from "@/utils/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
export async function startPaper(id: string, reading: boolean) {
  const profile = await requireProfile();
  const db = await createClient();
  const { data: open, error: lookupError } = await db
    .from("sessions")
    .select("id")
    .eq("paper_id", id)
    .eq("user_id", profile.id)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError)
    return { error: "Could not check your current sit. Try again." };
  if (open) return { id: open.id };
  const { data, error } = await db.rpc("start_paper", {
    p_paper: id,
    p_reading: reading,
  });
  return error
    ? { error: "Could not start your paper. Try again." }
    : { id: data as string };
}
export async function startWriting(id: string) {
  const profile = await requireProfile();
  const db = await createClient();
  const { data: sit } = await db
    .from("sessions")
    .select("config")
    .eq("id", id)
    .eq("user_id", profile.id)
    .eq("kind", "paper")
    .is("finished_at", null)
    .single();
  if (!sit) return { error: "Could not load your paper. Try again." };
  const writing_started_at =
    sit.config.writing_started_at ?? new Date().toISOString();
  const { error } = await admin()
    .from("sessions")
    .update({ config: { ...sit.config, writing_started_at } })
    .eq("id", id)
    .eq("user_id", profile.id)
    .is("finished_at", null);
  if (error) return { error: "Could not start writing. Try again." };
  return { writing_started_at };
}
