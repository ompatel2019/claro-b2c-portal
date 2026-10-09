import "server-only";
import { requireAdmin } from "@/lib/auth";
import { admin } from "@/utils/supabase/admin";
import { pages } from "@/lib/flashcard-data";
import type { Topic } from "@/lib/practice";

/** Shared content forms use the canonical topic hierarchy. */
export async function loadTopics(): Promise<Topic[]> {
  await requireAdmin();
  return pages<Topic>((from, to) =>
    admin()
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort")
      .order("id")
      .range(from, to),
  );
}
