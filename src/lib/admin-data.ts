import "server-only";
import { cache } from "react";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { sydneyDay } from "@/lib/admin";
import {
  computeSpend,
  rangeWindow,
  type Range,
  type Usage,
  type Student,
  type MarkedAttempt,
} from "@/app/admin/spend/data";
import { BUDGET_USD, EVAL_BLOCK_USD } from "@/lib/ai/prices";
import {
  AI_RATE_LIMIT_PER_MINUTE,
  AI_RATE_LIMIT_PER_HOUR,
} from "@/lib/ai/rate-limit";
import {
  MARK_MY_ANSWER_DAILY_LIMIT,
  OPEN_DISPUTES_PER_ANSWER,
  OPEN_DISPUTES_PER_STUDENT,
} from "@/lib/limits";
import { z } from "zod";
import { pages } from "@/lib/flashcard-data";
import { addDays, type ActivityDay } from "@/lib/activity";
import type { ReviewRow } from "@/lib/feedback";
import type { Topic } from "@/lib/practice";
import {
  ownQuestionReview,
  type SessionRow,
  type StudentRow,
} from "@/lib/students";

type StudentReviewRow = {
  id: string;
  reason: string;
  status: string;
  ai_mark: number | null;
  final_mark: number | null;
  created_at: string;
  attempt: {
    session_id: string;
    question: { source: string; stem: string } | null;
  } | null;
};
type FlashcardReportRow = {
  id: string;
  flashcard_id: string;
  answer: string | null;
  mark: number;
  reason: string | null;
  created_at: string;
  card: { front: string; back: string } | null;
};

export const SPEND_CAP_USD = 100;

/** Auth users by id: email and whether sign-in is blocked (banned_until in the future). */
async function authUsers(ids: string[]) {
  const users = new Map<string, { email: string; blocked: boolean }>();
  const svc = admin();
  const now = Date.now();
  const wanted = new Set(ids);
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("Could not load student emails.");
    for (const u of data.users)
      if (wanted.has(u.id)) {
        const until = (u as { banned_until?: string | null }).banned_until;
        users.set(u.id, {
          email: u.email ?? "",
          blocked: !!until && Date.parse(until) > now,
        });
      }
    if (data.users.length < 1000 || users.size === wanted.size) break;
  }
  return users;
}

/** SQL owns §4.2 aggregates; auth emails never leave this admin-only loader. */
export async function loadStudentRows(): Promise<StudentRow[]> {
  await requireAdmin();
  const db = await createClient();
  const rows = await pages<Omit<StudentRow, "email" | "blocked">>((from, to) =>
    db.rpc("admin_student_rows").order("id").range(from, to),
  );
  if (!rows.length) return [];
  const users = await authUsers(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    email: users.get(r.id)?.email ?? "",
    blocked: users.get(r.id)?.blocked ?? false,
  }));
}

const detailSchema = z.object({
  week: z.object({ thisWeek: z.number(), lastWeek: z.number() }),
  averages: z.object({
    avg30: z.number().nullable(),
    prev30: z.number().nullable(),
  }),
  due: z.object({ today: z.number(), tomorrow: z.number() }),
  streaks: z.object({ current_streak: z.number(), longest_streak: z.number() }),
  lastActive: z.string().nullable(),
  callsLastHour: z.number(),
  spend30: z.number(),
  usage: z.array(
    z.object({
      task: z.string(),
      calls: z.number(),
      tokens: z.number(),
      usd: z.number(),
    }),
  ),
});

/** §4.3: profile, auth state, the Home KPIs, a year of activity and every tab's rows. */
export async function loadStudentDetail(id: string) {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return null;
  const db = await createClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id,full_name,created_at,role,year_level,school")
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (!profile || profile.role !== "student") return null;
  const now = new Date();
  const today = sydneyDay(now);
  const [
    user,
    days,
    stats,
    sessions,
    attempts,
    topics,
    progress,
    reviews,
    feedback,
  ] = await Promise.all([
    admin().auth.admin.getUserById(id),
    db
      .rpc("activity_days", {
        p_user: id,
        p_from: addDays(today, -371),
        p_to: today,
      })
      .throwOnError(),
    db.rpc("admin_student_detail", { p_user: id }).throwOnError(),
    pages<Omit<SessionRow, "attempts">>((from, to) =>
      db
        .from("sessions")
        .select(
          "id,kind,config,started_at,finished_at,score,max_score,elapsed_s,summary",
        )
        .eq("user_id", id)
        .order("started_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    pages<{
      session_id: string;
      status: string;
      check_status: string;
      answered: boolean;
      day: string | null;
    }>((from, to) =>
      db
        .rpc("admin_student_attempts", { p_user: id })
        .order("id")
        .range(from, to),
    ),
    pages<Topic>((from, to) =>
      db
        .from("topics")
        .select("id,parent_id,name,sort")
        .order("sort")
        .order("id")
        .range(from, to),
    ),
    pages<{
      topic_id: string;
      parent_id: string | null;
      earned: number;
      possible: number;
      answered: number;
      last_answered: string | null;
    }>((from, to) =>
      db
        .rpc("admin_student_topics", { p_user: id })
        .order("topic_id")
        .range(from, to),
    ),
    pages<StudentReviewRow>((from, to) =>
      db
        .from("mark_reviews")
        .select(
          "id,reason,status,ai_mark,final_mark,created_at,attempt:attempts(session_id,question:questions(source,stem))",
        )
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
        .overrideTypes<StudentReviewRow[], { merge: false }>(),
    ),
    pages<{
      id: string;
      kind: string;
      message: string;
      status: string;
      created_at: string;
    }>((from, to) =>
      db
        .from("feedback")
        .select("id,kind,message,status,created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  if (user.error) throw user.error;
  const until = (user.data.user as { banned_until?: string | null } | null)
    ?.banned_until;
  const detail = detailSchema.parse(stats.data);
  const bySession = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const rows = bySession.get(a.session_id) ?? [];
    rows.push(a);
    bySession.set(a.session_id, rows);
  }
  return {
    profile,
    email: user.data.user?.email ?? "",
    blocked: !!until && Date.parse(until) > now.getTime(),
    today,
    ...detail,
    activity: { days: days.data as ActivityDay[], ...detail.streaks },
    sessions: sessions.map((s) => ({
      ...s,
      attempts: bySession.get(s.id) ?? [],
    })),
    topics,
    progress,
    reviews,
    feedback,
  };
}

/** The read-only report for one of the student's sessions (keys only after finish). */
export async function loadSessionReport(sessionId: string, userId: string) {
  await requireAdmin();
  if (
    !z.uuid().safeParse(sessionId).success ||
    !z.uuid().safeParse(userId).success
  )
    return null;
  const db = await createClient();
  const { data: session } = await db
    .from("sessions")
    .select("id,kind,config,finished_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()
    .throwOnError();
  if (!session) return null;
  const cards =
    session.kind === "flashcards"
      ? await pages<FlashcardReportRow>((from, to) =>
          db
            .from("flashcard_reviews")
            .select(
              "id,flashcard_id,answer,mark,reason,created_at,card:flashcards(front,back)",
            )
            .eq("session_id", sessionId)
            .eq("user_id", userId)
            .order("created_at")
            .order("id")
            .range(from, to)
            .overrideTypes<FlashcardReportRow[], { merge: false }>(),
        )
      : [];
  const rows = session.finished_at
    ? await pages<ReviewRow>((from, to) =>
        db
          .rpc("session_review", { p_session: sessionId })
          .order("position")
          .range(from, to),
      )
    : [];
  const paths = rows.flatMap((r) => r.image_paths ?? []);
  const signedResult = paths.length
    ? await db.storage.from("answers").createSignedUrls(paths, 3600)
    : null;
  if (signedResult?.error) throw signedResult.error;
  const signed = signedResult?.data;
  return {
    cards,
    finished: !!session.finished_at,
    rows: rows.map((row) => ownQuestionReview(row, session.config?.question)),
    url: new Map(signed?.map((x) => [x.path, x.signedUrl])),
  };
}

const point = z.object({ day: z.string(), value: z.number() });
const dashboardSchema = z.object({
  students: z.number(),
  active: z.object({ now: z.number(), prev: z.number() }),
  sessionsWeek: z.number(),
  openReviews: z.object({
    count: z.number(),
    oldestDays: z.number().nullable(),
  }),
  spend: z.object({ month: z.number(), all: z.number() }),
  sessionsTotal: z.number(),
  spendTotal: z.number(),
  sessionsPerDay: z.array(point),
  spendPerDay: z.array(point),
  attention: z.object({
    failed: z.number(),
    newFeedback: z.number(),
    contentReports: z.number(),
    importReview: z.number(),
    agreement: z.number().nullable(),
  }),
  latest: z.array(
    z.object({
      id: z.string(),
      user_id: z.string(),
      name: z.string(),
      kind: z.string(),
      mode: z.string().nullable(),
      score: z.number().nullable(),
      max: z.number().nullable(),
      finished_at: z.string(),
    }),
  ),
});

/** SQL owns dashboard numbers; React cache shares this admin-only read with the sidebar. */
export const loadDashboard = cache(async () => {
  await requireAdmin();
  const db = await createClient();
  const { data } = await db.rpc("admin_dashboard").throwOnError();
  const dashboard = dashboardSchema.parse(data);
  return { ...dashboard, spend: { ...dashboard.spend, cap: SPEND_CAP_USD } };
});

export async function loadAdminBadges() {
  const dashboard = await loadDashboard();
  return {
    "/admin/content/questions": dashboard.attention.importReview,
    "/admin/feedback": dashboard.attention.newFeedback,
  };
}

export async function loadSpend(range: Range = "month", now = new Date()) {
  await requireAdmin();
  const db = await createClient();
  const window = rangeWindow(range, now);
  const recent = rangeWindow("30", now).since!;
  const since =
    window.since === null
      ? null
      : window.since < recent
        ? window.since
        : recent;
  const [dashboard, usage, attempts, students] = await Promise.all([
    loadDashboard(),
    pages<Usage>((from, to) => {
      let query = db
        .from("ai_usage")
        .select(
          "created_at,user_id,model,task,input_tokens,cached_tokens,output_tokens,usd",
        )
        .lt("created_at", now.toISOString());
      if (since) query = query.gte("created_at", since);
      return query.order("id").range(from, to);
    }),
    pages<MarkedAttempt>(async (from, to) => {
      let query = db
        .from("attempts")
        .select(
          "marked_at,question_id,note:feedback->>note,question:questions(type)",
        )
        .eq("status", "marked")
        .lt("marked_at", window.until);
      if (window.since) query = query.gte("marked_at", window.since);
      const { data, error } = await query.order("id").range(from, to);
      return { data: data as unknown as MarkedAttempt[] | null, error };
    }),
    pages<Student>((from, to) =>
      db
        .from("profiles")
        .select("id,full_name")
        .eq("role", "student")
        .order("id")
        .range(from, to),
    ),
  ]);
  return {
    ...computeSpend(dashboard.spend, usage, attempts, students, range, now),
    cap: SPEND_CAP_USD,
    markers: [EVAL_BLOCK_USD, BUDGET_USD, SPEND_CAP_USD],
    limits: {
      perMinute: AI_RATE_LIMIT_PER_MINUTE,
      perHour: AI_RATE_LIMIT_PER_HOUR,
      markMyAnswerPerDay: MARK_MY_ANSWER_DAILY_LIMIT,
      openDisputesPerAnswer: OPEN_DISPUTES_PER_ANSWER,
      openDisputesPerStudent: OPEN_DISPUTES_PER_STUDENT,
    },
  };
}

/** Verify the student association before signing any private screenshot URLs. */
export async function loadStudentFeedback(id: string, userId: string) {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(userId).success)
    return null;
  const db = await createClient();
  const { data } = await db
    .from("feedback")
    .select(
      "id,user_id,message,status,admin_note,page_path,user_agent,question_id,session_id,screenshots",
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()
    .throwOnError();
  if (!data) return null;
  const signed = data.screenshots.length
    ? await db.storage.from("reports").createSignedUrls(data.screenshots, 3600)
    : null;
  if (signed?.error) throw signed.error;
  return {
    row: data as import("@/components/feedback-detail").FeedbackDetailRow,
    photos:
      signed?.data?.flatMap((p) => (p.signedUrl ? [p.signedUrl] : [])) ?? [],
  };
}
