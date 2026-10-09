import "server-only";
import { cache } from "react";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { sydneyDay } from "@/lib/admin";
import { z } from "zod";
import { pages } from "@/lib/flashcard-data";
import type { StudentRow } from "@/lib/students";

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

export async function loadStudent(id: string) {
  await requireAdmin();
  const db = await createClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id,full_name,created_at,role,year_level,school")
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (!profile || profile.role !== "student") return null;
  const { data: user } = await admin().auth.admin.getUserById(id);
  const { data: sessions } = await db
    .from("sessions")
    .select("id,kind,config,started_at,finished_at,score,max_score")
    .eq("user_id", id)
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(30)
    .throwOnError();
  return {
    profile,
    email: user.user?.email ?? "",
    sessions: sessions ?? [],
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

export async function loadSpend() {
  await requireAdmin();
  const db = await createClient();
  const { data } = await db
    .from("ai_usage")
    .select("usd,model,task,created_at")
    .throwOnError();
  const rows = data ?? [];
  const todayKey = sydneyDay(new Date());
  let today = 0;
  let all = 0;
  const byModel = new Map<string, number>();
  const byTask = new Map<string, number>();
  for (const r of rows) {
    const usd = Number(r.usd);
    all += usd;
    if (sydneyDay(r.created_at) === todayKey) today += usd;
    byModel.set(r.model, (byModel.get(r.model) ?? 0) + usd);
    byTask.set(r.task, (byTask.get(r.task) ?? 0) + usd);
  }
  return {
    today,
    all,
    cap: SPEND_CAP_USD,
    byModel: [...byModel.entries()].sort((a, b) => b[1] - a[1]),
    byTask: [...byTask.entries()].sort((a, b) => b[1] - a[1]),
  };
}
