import { ago, FEEDBACK_KIND, sydneyDay } from "./admin";
import { calendarDate } from "./students";

export type FeedbackStatus = "new" | "triaged" | "resolved";
export const feedbackStatus = (value: string | undefined): FeedbackStatus =>
  value === "triaged" || value === "resolved" ? value : "new";

/** Search every displayed field and contextual ID; date boundaries are Sydney days. */
export function filterFeedback<
  T extends {
    id: string;
    user_id: string;
    kind: string;
    name: string;
    message: string;
    page_path: string | null;
    linked: string;
    question_id: string | null;
    flashcard_id: string | null;
    session_id: string | null;
    screenshots: number;
    status: string;
    created_at: string;
  },
>(rows: T[], f: Record<string, string | undefined>, now = new Date()) {
  const term = f.q?.trim().toLowerCase();
  const from = calendarDate(f.from);
  const to = calendarDate(f.to);
  return rows.filter((r) => {
    const day = sydneyDay(r.created_at);
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (f.shots !== "1" || r.screenshots > 0) &&
      (!term ||
        [
          r.id,
          r.user_id,
          FEEDBACK_KIND[r.kind as keyof typeof FEEDBACK_KIND],
          r.kind,
          r.name,
          r.message,
          r.page_path,
          r.linked,
          r.question_id,
          r.flashcard_id,
          r.session_id,
          r.status,
          String(r.screenshots),
          day,
          ago(r.created_at, now),
        ].some((v) => v?.toLowerCase().includes(term)))
    );
  });
}
