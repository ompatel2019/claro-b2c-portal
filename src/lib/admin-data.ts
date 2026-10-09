import "server-only";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth";

export const SPEND_CAP_USD = 100;

function sydneyDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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
    .order("started_at", { ascending: false })
    .limit(30)
    .throwOnError();
  return {
    profile,
    email: user.user?.email ?? "",
    sessions: sessions ?? [],
  };
}

export const QUESTION_PAGE = 100;
export async function loadQuestions(filters: {
  topic?: string;
  type?: string;
  year?: string;
  q?: string;
  page?: number;
}) {
  await requireAdmin();
  let query = admin()
    .from("questions")
    .select(
      "id,type,topic_id,marks,stem,stimulus,options,correct_index,criteria,guideline_notes,sample_answer,source,year",
      { count: "exact" },
    )
    .order("year", { ascending: false })
    .order("id");
  if (filters.topic)
    query = filters.topic.includes("-")
      ? query.eq("topic_id", filters.topic)
      : query.like("topic_id", `${filters.topic}-%`);
  if (filters.type && ["mcq", "short", "extended"].includes(filters.type))
    query = query.eq("type", filters.type);
  if (filters.year && /^\d{4}$/.test(filters.year))
    query = query.eq("year", Number(filters.year));
  if (filters.q)
    query = query.or(
      `stem.ilike.%${filters.q.slice(0, 100)}%,source.ilike.%${filters.q.slice(0, 100)}%`,
    );
  const from = ((filters.page ?? 1) - 1) * QUESTION_PAGE;
  const { data, count, error } = await query.range(
    from,
    from + QUESTION_PAGE - 1,
  );
  if (error) throw new Error("Could not load questions.");
  return { questions: data ?? [], total: count ?? 0 };
}

export async function loadSpend() {
  await requireAdmin();
  const db = await createClient();
  const { data } = await db
    .from("ai_usage")
    .select("usd,model,task,created_at")
    .throwOnError();
  const rows = data ?? [];
  const todayKey = sydneyDay();
  let today = 0;
  let all = 0;
  const byModel = new Map<string, number>();
  const byTask = new Map<string, number>();
  for (const r of rows) {
    const usd = Number(r.usd);
    all += usd;
    if (sydneyDay(new Date(r.created_at)) === todayKey) today += usd;
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
