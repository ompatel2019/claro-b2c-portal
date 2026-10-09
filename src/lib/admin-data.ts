import "server-only";
import { cache } from "react";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { sydneyDay } from "@/lib/admin";
import { z } from "zod";

export const SPEND_CAP_USD = 100;

export async function loadStudents() {
  await requireAdmin();
  const db = await createClient();
  const { data: profiles } = await db
    .from("profiles")
    .select("id,full_name,created_at")
    .eq("role", "student")
    .order("created_at", { ascending: false })
    .throwOnError();
  const rows = profiles ?? [];
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const { data: sessions } = await db
    .from("sessions")
    .select("id,user_id,finished_at,score,max_score,started_at")
    .in("user_id", ids)
    .throwOnError();
  const byUser = new Map<
    string,
    { sessions: number; scored: number; totalPct: number; last: string | null }
  >();
  for (const id of ids)
    byUser.set(id, { sessions: 0, scored: 0, totalPct: 0, last: null });
  for (const s of sessions ?? []) {
    const row = byUser.get(s.user_id)!;
    row.sessions += 1;
    if (s.finished_at && s.max_score) {
      row.scored += 1;
      row.totalPct += (Number(s.score ?? 0) / Number(s.max_score)) * 100;
    }
    const t = s.finished_at ?? s.started_at;
    if (!row.last || t > row.last) row.last = t;
  }
  const emails = new Map<string, string>();
  const svc = admin();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("Could not load student emails.");
    for (const u of data.users)
      if (ids.includes(u.id) && u.email) emails.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }
  return rows.map((p) => {
    const s = byUser.get(p.id)!;
    return {
      id: p.id,
      full_name: p.full_name,
      email: emails.get(p.id) ?? "",
      joined: p.created_at,
      sessions: s.sessions,
      average_pct: s.scored ? Math.round(s.totalPct / s.scored) : null,
      last_active: s.last,
    };
  });
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
