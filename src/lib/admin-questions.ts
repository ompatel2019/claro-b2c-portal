import "server-only";
import { unstable_cache } from "next/cache";
import { QUESTION_IMPORT_REVIEW_TAG } from "@/lib/question-review-cache";
import { admin } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { loadTopics } from "@/lib/admin-content";
import { pageOf, tableParams, type Pager } from "@/lib/admin";
import { pages } from "@/lib/flashcard-data";
import {
  QUESTION_FILTER_KEYS,
  TYPE_LABELS,
  ORIGIN_LABELS,
  type QuestionInput,
} from "@/lib/question-bank";
import { dateLabel } from "@/lib/practice";
import { createClient } from "@/utils/supabase/server";
import type { ReviewPair } from "@/components/import-review";

export { loadTopics } from "@/lib/admin-content";

/** One row of the §4.4 list. */
export type QuestionListRow = {
  id: string;
  source: string;
  year: number;
  type: QuestionInput["type"];
  topic_id: string;
  marks: number;
  verb: string | null;
  status: string;
  origin: string;
  updated_at: string;
  attempts: number;
  avg: number | null;
  disagreements: number;
  reports: number;
};

export type QuestionFilters = Record<string, string | undefined>;
const AGGREGATE = ["attempts", "avg", "disagreements", "reports"];
const KEYS: Record<string, (r: QuestionListRow) => string | number | null> = {
  id: (r) => r.id,
  source: (r) => r.source.toLowerCase(),
  year: (r) => r.year,
  type: (r) => r.type,
  topic: (r) => r.topic_id,
  marks: (r) => r.marks,
  verb: (r) => r.verb?.toLowerCase() || null,
  status: (r) => r.status,
  origin: (r) => r.origin,
  attempts: (r) => r.attempts,
  avg: (r) => r.avg,
  disagreements: (r) => r.disagreements,
  reports: (r) => r.reports,
  updated: (r) => r.updated_at,
};

type QuestionStats = {
  id: string;
  attempts: number;
  avg: number | null;
  disagreements: number;
  reports: number;
  histogram: number[];
  picks: { rates: number[]; flagged: boolean; picks: number };
};
async function aggregates(ids: string[], detail = false) {
  const db = await createClient();
  const result = new Map<string, QuestionStats>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .rpc("admin_question_stats", {
        p_ids: ids.slice(i, i + 200),
        p_detail: detail,
      })
      .throwOnError();
    for (const row of (data ?? []) as QuestionStats[]) result.set(row.id, row);
  }
  return result;
}

const REVIEW_FETCH = 1000;

/** Cache only service data; caller authorization stays outside the cache scope. */
function importReviewPairs(threshold: number, filters: QuestionFilters) {
  const normalized = Object.fromEntries(
    QUESTION_FILTER_KEYS.flatMap((key) => {
      const value =
        key === "q" ? filters.q?.trim().slice(0, 100) : filters[key];
      return value ? [[key, value]] : [];
    }),
  );
  return unstable_cache(
    async () => {
      // PostgREST caps a response (1000 rows by default), so read every page.
      const all: ReviewPair[] = [];
      for (let from = 0; ; from += REVIEW_FETCH) {
        const { data } = await admin()
          .rpc("question_import_review", {
            p_threshold: threshold,
            p_filters: normalized,
          })
          .order("id")
          .range(from, from + REVIEW_FETCH - 1)
          .throwOnError();
        const chunk = (data ?? []) as ReviewPair[];
        all.push(...chunk);
        if (chunk.length < REVIEW_FETCH) return all;
      }
    },
    [QUESTION_IMPORT_REVIEW_TAG, String(threshold), JSON.stringify(normalized)],
    { revalidate: 120, tags: [QUESTION_IMPORT_REVIEW_TAG] },
  )();
}

export async function loadImportReview(
  threshold: number,
  requestedPage = 1,
  includeRows = true,
  filters: QuestionFilters = {},
) {
  await requireAdmin();
  const filtering = QUESTION_FILTER_KEYS.some((key) =>
    key === "q" ? filters.q?.trim() : filters[key],
  );
  const pairs = importReviewPairs(threshold, filters);
  // A badge is secondary; active review failures must still propagate.
  const [rows, all] = await Promise.all([
    includeRows ? pairs : pairs.catch(() => null),
    filtering ? importReviewPairs(threshold, {}).catch(() => null) : null,
  ]);
  const tabCount = filtering ? all : rows;
  const total = rows?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const page = Math.min(
    pages,
    Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1),
  );
  return {
    tabCount: tabCount?.length ?? null,
    rows: includeRows ? (rows ?? []).slice((page - 1) * 50, page * 50) : [],
    pager: {
      page,
      pages,
      total,
      sort: { id: "id", dir: "asc" },
    } satisfies Pager,
  };
}

/** Status tab counts (whole bank). */
export async function loadQuestionCounts() {
  await requireAdmin();
  const count = async (status: string) => {
    try {
      const result = await admin()
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
        .throwOnError();
      return result.count ?? null;
    } catch {
      return null;
    }
  };
  const [live, draft, retired] = await Promise.all([
    count("live"),
    count("draft"),
    count("retired"),
  ]);
  return {
    live,
    draft,
    retired,
  };
}

/** The filtered, sorted page of questions with their aggregates. */
export async function loadQuestionList(f: QuestionFilters) {
  await requireAdmin();
  const status = ["live", "draft", "retired"].includes(f.status ?? "")
    ? f.status!
    : "live";
  let q = admin()
    .from("questions")
    .select(
      "id,source,year,type,topic_id,marks,verb,status,origin,updated_at,stem",
    )
    .eq("status", status);
  if (f.type && ["mcq", "short", "extended"].includes(f.type))
    q = q.eq("type", f.type);
  const topics = await loadTopics();
  if (f.topic) {
    const topic = topics.find((t) => t.id === f.topic);
    q = topic?.parent_id
      ? q.eq("topic_id", topic.id)
      : q.in(
          "topic_id",
          topics.filter((t) => t.parent_id === f.topic).map((t) => t.id),
        );
  }
  if (f.from && /^\d{4}$/.test(f.from)) q = q.gte("year", Number(f.from));
  if (f.to && /^\d{4}$/.test(f.to)) q = q.lte("year", Number(f.to));
  if (f.origin && ["nesa", "a1", "claro"].includes(f.origin))
    q = q.eq("origin", f.origin);
  if (f.verb) q = q.eq("verb", f.verb.slice(0, 40));
  if (f.marks && /^\d{1,2}$/.test(f.marks)) q = q.eq("marks", Number(f.marks));
  if (f.missing === "explanation")
    q = q.eq("type", "mcq").or('explanation.is.null,explanation.eq.""');
  if (f.missing === "sample")
    q = q.neq("type", "mcq").or('sample_answer.is.null,sample_answer.eq.""');
  if (f.missing === "criteria")
    q = q.neq("type", "mcq").or("criteria.is.null,criteria.eq.[]");
  if (f.missing === "stimulus")
    q = q.not("stimulus", "is", null).neq("stimulus", "");
  const data = await pages((from, to) => q.order("id").range(from, to));
  const rows = (data ?? []) as Omit<
    QuestionListRow,
    "attempts" | "avg" | "disagreements" | "reports"
  >[];
  const { sort, page } = tableParams(f, { id: "updated", dir: "desc" });
  const byAggregate = AGGREGATE.includes(sort.id) || !!f.q?.trim();
  const keys = {
    ...KEYS,
    topic: (r: QuestionListRow) =>
      topics.find((t) => t.id === r.topic_id)?.name.toLowerCase() ?? r.topic_id,
    type: (r: QuestionListRow) => TYPE_LABELS[r.type],
  };
  const term = f.q?.trim().toLowerCase().slice(0, 100);
  const matches = (r: QuestionListRow) =>
    !term ||
    [
      r.id,
      r.source,
      (r as QuestionListRow & { stem: string }).stem,
      r.year,
      TYPE_LABELS[r.type],
      keys.topic(r),
      r.marks,
      r.verb ?? "None",
      r.status,
      ORIGIN_LABELS[r.origin as keyof typeof ORIGIN_LABELS] ?? r.origin,
      r.attempts,
      r.avg === null ? "No marks" : `${r.avg}%`,
      r.disagreements,
      r.reports,
      dateLabel(r.updated_at),
    ]
      .join(" ")
      .toLowerCase()
      .includes(term);
  const withStats = (
    list: typeof rows,
    stats: Awaited<ReturnType<typeof aggregates>>,
  ): QuestionListRow[] =>
    list.map((r) => {
      const s = stats.get(r.id);
      return {
        ...r,
        attempts: s?.attempts ?? 0,
        avg: s?.avg ?? null,
        disagreements: s?.disagreements ?? 0,
        reports: s?.reports ?? 0,
      };
    });
  if (byAggregate) {
    const all = withStats(rows, await aggregates(rows.map((r) => r.id)));
    return {
      ...pageOf(all.filter(matches), keys, sort, page, {
        id: "updated",
        dir: "desc",
      }),
      status,
    };
  }
  const paged = pageOf(withStats(rows, new Map()), keys, sort, page, {
    id: "updated",
    dir: "desc",
  });
  const stats = await aggregates(paged.rows.map((r) => r.id));
  return { ...paged, rows: withStats(paged.rows, stats), status };
}

export type StoredQuestion = QuestionInput & {
  origin: string;
  duplicate_of: string | null;
  updated_at: string;
};

/** Editor data: the row, its locks and banners, stats and 5 recent real answers. */
export async function loadQuestion(id: string) {
  await requireAdmin();
  const db = admin();
  const { data } = await db
    .from("questions")
    .select(
      "id,type,topic_id,marks,verb,source,year,stem,stimulus,options,correct_index,explanation,criteria,guideline_notes,sample_answer,status,origin,duplicate_of,updated_at",
    )
    .eq("id", id)
    .maybeSingle()
    .throwOnError();
  if (!data) return null;
  const question = data as StoredQuestion;
  const [statsById, duplicate, reports, recent] = await Promise.all([
    aggregates([id], true),
    question.duplicate_of
      ? db
          .from("questions")
          .select("id,status")
          .eq("id", question.duplicate_of)
          .maybeSingle()
          .throwOnError()
      : null,
    pages<{ id: string; message: string; created_at: string }>((from, to) =>
      db
        .from("feedback")
        .select("id,message,created_at")
        .eq("kind", "content")
        .eq("question_id", id)
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    db
      .from("attempts")
      .select("answer_text,transcript")
      .eq("question_id", id)
      .eq("status", "marked")
      .or('answer_text.neq."",transcript.neq.""')
      .order("marked_at", { ascending: false })
      .order("id")
      .limit(5)
      .throwOnError(),
  ]);
  const stats = statsById.get(id)!;
  return {
    question,
    attemptCount: stats.attempts,
    duplicate: duplicate?.data ?? null,
    stats: { ...stats, reportCount: stats.reports, reports },
    recentAnswers: (recent.data ?? [])
      .map((a) => (a.transcript ?? a.answer_text ?? "").trim())
      .filter(Boolean),
  };
}
