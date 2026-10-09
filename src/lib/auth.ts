import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

/** Signed-in user's profile for a page; redirects to sign-in when signed out. */
export async function requireProfile() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/sign-in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, year_level, school")
    .eq("id", userId)
    .single();
  if (!profile) redirect("/sign-in");
  return profile;
}

/** Admin-only pages; students are sent home. */
export async function requireAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/student");
  return profile;
}
