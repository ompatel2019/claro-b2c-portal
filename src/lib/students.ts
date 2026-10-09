import { addDays } from "./activity";
import { csv } from "./admin";

/** One row of /admin/students (§4.2). */
export type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  year_level: number | null;
  school: string | null;
  joined: string;
  last_active: string | null;
  sessions_7d: number;
  sessions_total: number;
  answered: number;
  avg_30: number | null;
  streak: number;
  open_disputes: number;
  ai_spend: number;
  blocked: boolean;
};

export const ACTIVITY = {
  active7: "Active 7 days",
  active30: "Active 30 days",
  inactive30: "Inactive 30+ days",
  never: "Never started",
} as const;

export type StudentFilters = {
  q?: string;
  year?: string;
  activity?: string;
  disputes?: string;
};

export function filterStudents(
  rows: StudentRow[],
  f: StudentFilters,
  /** Sydney day of a timestamp, injected so the filter stays pure. */
  dayOf: (iso: string) => string,
  today: string,
) {
  const q = f.q?.trim().toLowerCase();
  const week = addDays(today, -6);
  const month = addDays(today, -29);
  return rows.filter((r) => {
    if (
      q &&
      !(r.full_name ?? "").toLowerCase().includes(q) &&
      !r.email.toLowerCase().includes(q) &&
      !r.id.toLowerCase().includes(q) &&
      !(r.school ?? "").toLowerCase().includes(q) &&
      !(r.blocked && "blocked".includes(q))
    )
      return false;
    if (f.year && String(r.year_level) !== f.year) return false;
    if (f.disputes === "1" && r.open_disputes === 0) return false;
    if (f.activity) {
      const last = r.last_active ? dayOf(r.last_active) : null;
      if (f.activity === "never") return !last;
      if (!last) return false;
      if (f.activity === "active7") return last >= week;
      if (f.activity === "active30") return last >= month;
      if (f.activity === "inactive30") return last < month;
    }
    return true;
  });
}

export const STUDENT_KEYS: Record<
  string,
  (r: StudentRow) => string | number | null
> = {
  name: (r) => (r.full_name || "").toLowerCase() || null,
  email: (r) => r.email.toLowerCase(),
  year: (r) => r.year_level,
  school: (r) => r.school?.toLowerCase() || null,
  joined: (r) => r.joined,
  last: (r) => r.last_active,
  sessions7: (r) => r.sessions_7d,
  sessions: (r) => r.sessions_total,
  answered: (r) => r.answered,
  avg: (r) => r.avg_30,
  streak: (r) => r.streak,
  disputes: (r) => r.open_disputes,
  spend: (r) => r.ai_spend,
  blocked: (r) => Number(r.blocked),
};

export function studentsCsv(rows: StudentRow[]) {
  return csv([
    [
      "Name",
      "Email",
      "Year",
      "School",
      "Joined",
      "Last active",
      "Sessions 7d",
      "Sessions total",
      "Questions answered",
      "Avg % (30 days)",
      "Streak",
      "Open disputes",
      "AI spend (USD)",
      "Blocked",
    ],
    ...rows.map((r) => [
      r.full_name,
      r.email,
      r.year_level,
      r.school,
      r.joined,
      r.last_active,
      r.sessions_7d,
      r.sessions_total,
      r.answered,
      r.avg_30,
      r.streak,
      r.open_disputes,
      r.ai_spend.toFixed(4),
      r.blocked ? "yes" : "no",
    ]),
  ]);
}
