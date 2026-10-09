import "server-only";
import { admin } from "@/utils/supabase/admin";
import { loadTopics } from "@/lib/admin-content";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { flashcardPage } from "@/lib/flashcard-list";
import { pages } from "@/lib/flashcard-data";
import { normaliseFront } from "@/lib/card-import";

export type FlashcardRow = {
  id: string;
  front: string;
  back: string;
  kind: "term" | "stat";
  topic_id: string;
  status: "draft" | "live" | "retired";
  origin: string;
  updated_at: string;
  reviews: number;
  knew_first: number | null;
  avg: number | null;
};

/** Privacy: only the count of student-owned cards leaves the server. */
export async function loadFlashcardCounts() {
  await requireAdmin();
  const { count } = await admin()
    .from("flashcards")
    .select("id,profiles!owner_id!inner(role)", { count: "exact", head: true })
    .not("owner_id", "is", null)
    .eq("profiles.role", "student")
    .throwOnError();
  return { own: count ?? 0 };
}

/** The filtered, sorted page of shared cards with their review stats. */
export async function loadFlashcardList(f: Record<string, string | undefined>) {
  await requireAdmin();
  const db = await createClient();
  const rows = await pages<FlashcardRow>((from, to) =>
    db.rpc("admin_flashcard_rows").order("id").range(from, to),
  );
  const topics = await loadTopics();
  return flashcardPage(rows, topics, f);
}

/** "kind|normalised front" of every shared card, for import dedupe. */
export async function sharedFrontKeys() {
  await requireAdmin();
  const rows = await pages<{ kind: string; front: string }>((from, to) =>
    admin()
      .from("flashcards")
      .select("kind,front")
      .is("owner_id", null)
      .order("id")
      .range(from, to),
  );
  return new Set(rows.map((r) => `${r.kind}|${normaliseFront(r.front)}`));
}
