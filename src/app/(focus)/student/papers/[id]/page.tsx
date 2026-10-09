import { pageMetadata } from "@/lib/page-metadata";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { questionColumns, type Attempt, type Session } from "@/lib/practice";
import {
  type PaperConfig,
  type PaperSection,
  paperSections,
} from "@/lib/paper-session";
import { SprintRunner } from "@/components/sprint-runner";
import { PaperStart } from "@/components/paper-start";
import { studentPaperFilter } from "@/lib/papers";
export const metadata = pageMetadata("Paper session");

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const db = await createClient();
  const { data: paper, error } = await db
    .from("papers")
    .select("id,title,source,year,time_limit_min,total_marks")
    .eq("id", id)
    .or(studentPaperFilter(profile.id))
    .maybeSingle();
  if (error) throw new Error("Could not load this paper.");
  if (!paper) notFound();
  const query = db
    .from("sessions")
    .select("*")
    .eq("paper_id", id)
    .eq("user_id", profile.id)
    .eq("kind", "paper")
    .is("finished_at", null);
  const { data: session, error: sessionError } = await query
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) throw new Error("Could not load your sit.");
  if (session) {
    const { data, error } = await db
      .from("attempts")
      .select(`*,question:questions(${questionColumns})`)
      .eq("session_id", session.id)
      .eq("user_id", profile.id)
      .order("position");
    if (error) throw new Error("Could not load your questions.");
    const serverNow = new Date().getTime();
    return (
      <SprintRunner
        session={session as Session}
        initial={(data ?? []) as unknown as Attempt[]}
        userId={profile.id}
        title={paper.title}
        paper={{
          id,
          config: session.config as PaperConfig,
          serverNow,
        }}
      />
    );
  }
  const { data: questions, error: questionError } = await db
    .from("paper_questions")
    .select("position,section,choice_group,question:questions(marks,type)")
    .eq("paper_id", id)
    .order("position");
  if (questionError) throw new Error("Could not load the sections.");
  const sections = paperSections(
    (questions ?? []) as PaperSection[],
    (questions ?? []).map((row) => ({
      position: row.position,
      ...(row.question as unknown as { marks: number; type: string }),
      answered: false,
    })),
    paper.time_limit_min,
  );
  return <PaperStart paper={paper} sections={sections} />;
}
