import "server-only";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import type { Criterion, MarkReview, ReviewRow } from "@/lib/feedback";

import { reasons } from "./shared";
export type Review = MarkReview & {
  id: string;
  attempt_id: string;
  user_id: string;
  created_at: string;
  check_notes: string | null;
  student_note: string | null;
  admin_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
};
type Question = {
  type: ReviewRow["type"];
  source: string;
  stem: string;
  marks: number;
  topic_id: string | null;
  criteria: Criterion[] | null;
  guideline_notes: string | null;
  sample_answer: string | null;
};
export type ReviewAttempt = {
  id: string;
  user_id: string;
  session_id: string;
  question_id: string | null;
  created_at: string;
  marked_at: string | null;
  marked_by_model: string | null;
  answer_text: string | null;
  transcript: string | null;
  image_paths: string[] | null;
  status: string;
  check_status: string;
  mark: number | null;
  max_marks: number | null;
  band: string | null;
  feedback: ReviewRow["feedback"];
  question: Question | null;
};
export type QueueRow = {
  id: string;
  attemptId: string;
  userId: string;
  name: string;
  created: string;
  reason: keyof typeof reasons | "failed" | "unreadable";
  source: string;
  stem: string;
  type: string;
  topic: string | null;
  marks: number | null;
  ai: number | null;
  check: number | null;
  note: string | null;
  photos: string[];
};

export async function loadQueue(tab: string) {
  const db = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const counts = await Promise.all([
    db
      .from("mark_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .throwOnError(),
    db
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "unreadable"])
      .gte("created_at", since)
      .throwOnError(),
    db
      .from("mark_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved")
      .gte("resolved_at", since)
      .throwOnError(),
  ]);
  const rows: QueueRow[] = [];
  const imagePaths = new Map<string, string[]>();
  // Read in batches so the API's row cap cannot silently truncate a queue.
  for (let from = 0; ; from += 1000) {
    if (tab === "failed") {
      const { data } = await db
        .from("attempts")
        .select(
          "id,user_id,created_at,status,mark,image_paths,question:questions(type,source,stem,marks,topic_id),student:profiles!attempts_user_id_fkey(full_name)",
        )
        .in("status", ["failed", "unreadable"])
        .gte("created_at", since)
        .order("created_at")
        .order("id")
        .range(from, from + 999)
        .throwOnError();
      const batch = data as unknown as (Pick<
        ReviewAttempt,
        | "id"
        | "user_id"
        | "created_at"
        | "status"
        | "mark"
        | "image_paths"
        | "question"
      > & { student: { full_name: string | null } | null })[];
      for (const a of batch ?? []) {
        imagePaths.set(a.id, a.image_paths ?? []);
        rows.push({
          id: a.id,
          attemptId: a.id,
          userId: a.user_id,
          name: a.student?.full_name || "Student",
          created: a.created_at,
          reason: a.status as "failed" | "unreadable",
          source: a.question?.source ?? "Own question",
          stem: a.question?.stem ?? "",
          type: a.question?.type ?? "short",
          topic: a.question?.topic_id ?? null,
          marks: a.question?.marks ?? null,
          ai: a.mark,
          check: null,
          note: null,
          photos: [],
        });
      }
      if ((batch?.length ?? 0) < 1000) break;
    } else {
      let query = db
        .from("mark_reviews")
        .select(
          "id,attempt_id,user_id,created_at,reason,ai_mark,check_mark,student_note,student:profiles!mark_reviews_user_id_fkey(full_name),attempt:attempts(question:questions(type,source,stem,marks,topic_id))",
        )
        .eq("status", tab === "resolved" ? "resolved" : "open");
      if (tab === "resolved") query = query.gte("resolved_at", since);
      const { data } = await query
        .order("created_at")
        .order("id")
        .range(from, from + 999)
        .throwOnError();
      const batch = data as unknown as (Review & {
        student: { full_name: string | null } | null;
        attempt: { question: Question | null } | null;
      })[];
      for (const r of batch ?? [])
        rows.push({
          id: r.id,
          attemptId: r.attempt_id,
          userId: r.user_id,
          name: r.student?.full_name || "Student",
          created: r.created_at,
          reason: r.reason,
          source: r.attempt?.question?.source ?? "Own question",
          stem: r.attempt?.question?.stem ?? "",
          type: r.attempt?.question?.type ?? "short",
          topic: r.attempt?.question?.topic_id ?? null,
          marks: r.attempt?.question?.marks ?? null,
          ai: r.ai_mark,
          check: r.check_mark,
          note: r.student_note,
          photos: [],
        });
      if ((batch?.length ?? 0) < 1000) break;
    }
  }
  if (tab === "failed" && rows.length) {
    const paths = [...imagePaths.values()].flat();
    if (paths.length) {
      const { data: signed, error } = await db.storage
        .from("answers")
        .createSignedUrls(paths, 3600);
      if (error) throw error;
      const urls = new Map((signed ?? []).map((p) => [p.path, p.signedUrl]));
      for (const r of rows)
        r.photos = (imagePaths.get(r.id) ?? []).flatMap((p) =>
          urls.get(p) ? [urls.get(p)!] : [],
        );
    }
  }
  const { data: topics } = await db
    .from("topics")
    .select("id,parent_id,name")
    .order("sort")
    .throwOnError();
  return {
    rows,
    topics: topics ?? [],
    counts: counts.map((c) => c.count ?? 0),
    now: Date.now(),
  };
}

export async function loadReview(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return null;
  const db = await createClient();
  const { data: review } = await db
    .from("mark_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (!review) return null;
  const r = review as Review;
  const [attempt, student, resolver] = await Promise.all([
    db
      .from("attempts")
      .select("*,question:questions(type,source,stem,marks)")
      .eq("id", r.attempt_id)
      .maybeSingle()
      .throwOnError(),
    db
      .from("profiles")
      .select("full_name")
      .eq("id", r.user_id)
      .maybeSingle()
      .throwOnError(),
    r.resolved_by
      ? db
          .from("profiles")
          .select("full_name")
          .eq("id", r.resolved_by)
          .maybeSingle()
          .throwOnError()
      : Promise.resolve({ data: null }),
  ]);
  const a = attempt.data as ReviewAttempt | null;
  const { data: session } = a
    ? await db
        .from("sessions")
        .select("kind,started_at,finished_at,config")
        .eq("id", a.session_id)
        .single()
        .throwOnError()
    : { data: null };
  if (a?.question) {
    // Question keys have column-level protection; session_review exposes them
    // to admins for finished sessions through the normal authenticated client.
    const { data: rows } = await db
      .rpc("session_review", { p_session: a.session_id })
      .throwOnError();
    const detail = (rows as ReviewRow[] | null)?.find(
      (row) => row.attempt_id === a.id,
    );
    const { data: notes } = await admin()
      .from("questions")
      .select("guideline_notes")
      .eq("id", a.question_id!)
      .single()
      .throwOnError();
    a.question = {
      ...a.question,
      criteria: detail?.criteria ?? null,
      sample_answer: detail?.sample_answer ?? null,
      guideline_notes: notes.guideline_notes,
    };
  }
  if (a && !a.question && session?.config?.question) {
    const own = session.config.question;
    a.question = {
      type: "short",
      source: "Own question",
      stem: String(own.stem ?? "Own question"),
      marks: Number(own.marks ?? a.max_marks ?? 0),
      topic_id: null,
      criteria: [],
      guideline_notes:
        typeof own.criteria_text === "string" ? own.criteria_text : null,
      sample_answer: null,
    };
  }
  return {
    review: r,
    attempt: a,
    name: student.data?.full_name || "Student",
    fullName: (student.data?.full_name as string | null | undefined) ?? null,
    resolver: resolver.data?.full_name || "Admin",
    session,
  };
}

export async function adjacentReview(
  db: Awaited<ReturnType<typeof createClient>>,
  review: Pick<Review, "id" | "created_at">,
  direction: "prev" | "next",
) {
  const ascending = direction === "next";
  const comparison = ascending ? "gt" : "lt";
  const { data } = await db
    .from("mark_reviews")
    .select("id")
    .eq("status", "open")
    .or(
      `created_at.${comparison}.${review.created_at},and(created_at.eq.${review.created_at},id.${comparison}.${review.id})`,
    )
    .order("created_at", { ascending })
    .order("id", { ascending })
    .limit(1)
    .maybeSingle()
    .throwOnError();
  return data;
}
