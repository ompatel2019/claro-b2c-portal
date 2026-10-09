import "server-only";
import { admin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { pages } from "@/lib/flashcard-data";
import { group, type PaperQuestion } from "@/lib/paper-builder";

export type PaperListRow = {
  id: string;
  title: string;
  year: number | null;
  source: string | null;
  origin: string;
  questions: number;
  total_marks: number;
  time_limit_min: number;
  status: PaperQuestion["status"];
  first_sits: number;
  all_sits: number;
  avg: number | null;
  ranks_enabled: boolean;
  updated_at: string;
};

/** SQL computes counts and sit percentages over the full history. Page every paper row. */
export async function loadPaperList(): Promise<PaperListRow[]> {
  await requireAdmin();
  const db = await createClient();
  return pages<PaperListRow>((from, to) =>
    db.rpc("admin_paper_rows").order("id").range(from, to),
  );
}

export type BuilderQuestion = PaperQuestion & {
  stem: string;
  stimulus: string | null;
  options: string[] | null;
};

/** Builder data: the paper, its sections (with stems for the preview), sit counts and locks. */
export async function loadPaper(id: string) {
  const profile = await requireAdmin();
  const db = admin();
  const { data: paper } = await db
    .from("papers")
    .select(
      "id,title,year,source,origin,time_limit_min,total_marks,status,ranks_enabled,updated_at,section_names",
    )
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (!paper) return null;
  const [rows, { data: stats }] = await Promise.all([
    pages((from, to) =>
      db
        .from("paper_questions")
        .select(
          "position,section,choice_group,question:questions(id,source,type,marks,topic_id,status,stem,stimulus,options)",
        )
        .eq("paper_id", id)
        .order("position")
        .range(from, to),
    ),
    (await createClient())
      .rpc("admin_paper_rows")
      .eq("id", id)
      .single()
      .overrideTypes<
        { first_sits: number; started: number },
        { merge: false }
      >()
      .throwOnError(),
  ]);
  const stems = new Map<
    string,
    Pick<BuilderQuestion, "stem" | "stimulus" | "options">
  >();
  const flat = (rows ?? []).map((r) => {
    const q = r.question as unknown as {
      id: string;
      source: string;
      type: PaperQuestion["type"];
      marks: number;
      topic_id: string;
      status: PaperQuestion["status"];
      stem: string;
      stimulus: string | null;
      options: string[] | null;
    };
    stems.set(q.id, { stem: q.stem, stimulus: q.stimulus, options: q.options });
    return {
      position: r.position,
      section: r.section,
      choice_group: r.choice_group,
      question_id: q.id,
      source: q.source,
      type: q.type,
      marks: q.marks,
      topic_id: q.topic_id,
      status: q.status,
    };
  });
  return {
    paper,
    adminId: profile.id,
    sections: group(flat, paper.section_names as string[] | null),
    stems: Object.fromEntries(stems),
    firstSits: Number(stats?.first_sits ?? 0),
    started: Number(stats?.started ?? 0),
  };
}
