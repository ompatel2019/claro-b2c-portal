import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { questionColumns, type Session, type Attempt } from "./practice";
export async function loadSprint(id: string) {
  const profile = await requireProfile();
  if (profile.role === "admin") redirect("/admin");
  const db = await createClient();
  const { data: session, error } = await db
    .from("sessions")
    .select("*,homework_set:homework_sets(title)")
    .eq("id", id)
    .eq("user_id", profile.id)
    .in("kind", ["sprint", "homework"])
    .maybeSingle();
  if (error) throw new Error("Could not load your session.");
  if (!session) notFound();
  const { data: attempts, error: attemptError } = await db
    .from("attempts")
    .select(`*,question:questions(${questionColumns})`)
    .eq("session_id", id)
    .eq("user_id", profile.id)
    .order("position");
  if (attemptError) throw new Error("Could not load your questions.");
  return {
    session: session as Session,
    attempts: (attempts ?? []) as unknown as Attempt[],
    profile,
  };
}
