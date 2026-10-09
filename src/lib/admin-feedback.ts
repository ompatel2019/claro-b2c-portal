import "server-only";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { FEEDBACK_KIND, pageOf, tableParams } from "@/lib/admin";

import { pages } from "@/lib/flashcard-data";
import {
  feedbackStatus,
  filterFeedback,
  type FeedbackStatus,
} from "./feedback-inbox";

export type FeedbackRow = {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  message: string;
  page_path: string | null;
  screenshots: number;
  question_id: string | null;
  flashcard_id: string | null;
  session_id: string | null;
  linked: string;
  status: FeedbackStatus;
  created_at: string;
};

const KEYS: Record<string, (r: FeedbackRow) => string | number | null> = {
  age: (r) => r.created_at,
  kind: (r) => FEEDBACK_KIND[r.kind as keyof typeof FEEDBACK_KIND] ?? r.kind,
  student: (r) => r.name.toLowerCase(),
  message: (r) => r.message.toLowerCase(),
  linked: (r) => r.linked.toLowerCase(),
  page: (r) => r.page_path,
  shots: (r) => r.screenshots,
  status: (r) => r.status,
};

export async function loadFeedbackCounts() {
  await requireAdmin();
  const db = await createClient();
  const { count } = await db
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "new")
    .throwOnError();
  return { new: count ?? 0 };
}

/** The filtered, sorted page of the inbox (§4.10). */
export async function loadFeedbackList(f: Record<string, string | undefined>) {
  await requireAdmin();
  const db = await createClient();
  const status = feedbackStatus(f.status);
  const query = (from: number, to: number) => {
    let q = db
      .from("feedback")
      .select(
        "id,user_id,kind,message,page_path,screenshots,question_id,flashcard_id,session_id,status,created_at,profile:profiles(full_name),question:questions(source)",
      )
      .eq("status", status);
    if (
      f.kind &&
      ["general", "bug", "content", "marking", "feature"].includes(f.kind)
    )
      q = q.eq("kind", f.kind);
    return q.order("id").range(from, to);
  };
  const data = await pages((from, to) => query(from, to));
  const rows: FeedbackRow[] = data.map((r) => {
    const name =
      (r.profile as unknown as { full_name: string | null } | null)
        ?.full_name ?? "Student";
    const source = (r.question as unknown as { source: string } | null)?.source;
    return {
      id: r.id,
      user_id: r.user_id,
      name,
      kind: r.kind,
      message: r.message,
      page_path: r.page_path,
      screenshots: (r.screenshots as string[]).length,
      question_id: r.question_id,
      flashcard_id: r.flashcard_id,
      session_id: r.session_id,
      linked: r.question_id
        ? source || r.question_id
        : r.session_id
          ? "Session"
          : r.flashcard_id
            ? "Flashcard"
            : "",
      status: r.status as FeedbackStatus,
      created_at: r.created_at,
    };
  });
  const { sort, page } = tableParams(f, { id: "age", dir: "desc" });
  return {
    ...pageOf(filterFeedback(rows, f), KEYS, sort, page, {
      id: "age",
      dir: "desc",
    }),
    status,
  };
}

/** One item for the Sheet: the row, signed screenshot URLs and its linked attempt. */
export async function loadFeedbackItem(id: string) {
  await requireAdmin();
  const db = await createClient();
  const { data } = await db
    .from("feedback")
    .select(
      "id,user_id,kind,message,page_path,user_agent,screenshots,question_id,session_id,status,admin_note,created_at,profile:profiles(full_name)",
    )
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (!data) return null;
  const paths = data.screenshots as string[];
  const [signed, attempt] = await Promise.all([
    paths.length
      ? db.storage
          .from("reports")
          .createSignedUrls(paths, 3600)
          .catch(() => null)
      : null,
    data.session_id && data.question_id
      ? db
          .from("attempts")
          .select("id,status,question:questions(type)")
          .eq("session_id", data.session_id)
          .eq("question_id", data.question_id)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(1)
          .throwOnError()
      : null,
  ]);
  const screenshots = (signed?.data ?? []).flatMap((s) =>
    !s.error && s.signedUrl ? [s.signedUrl] : [],
  );
  const linkedAttempt = attempt?.data?.[0];
  const question = linkedAttempt?.question as unknown as {
    type: string;
  } | null;
  return {
    id: data.id,
    user_id: data.user_id,
    kind: data.kind,
    message: data.message,
    page_path: data.page_path,
    user_agent: data.user_agent,
    question_id: data.question_id,
    session_id: data.session_id,
    admin_note: data.admin_note,
    created_at: data.created_at,
    status: data.status as FeedbackStatus,
    name:
      (data.profile as unknown as { full_name: string | null } | null)
        ?.full_name ?? "Student",
    screenshots,
    missingScreenshots: paths.length - screenshots.length,
    attempt:
      linkedAttempt && question && ["short", "extended"].includes(question.type)
        ? { id: linkedAttempt.id, status: linkedAttempt.status }
        : null,
  };
}
