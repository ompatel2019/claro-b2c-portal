import Link from "next/link";
import { Pen } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth";
import type { ReviewRow } from "@/lib/feedback";
import { dateLabel } from "@/lib/practice";
import { createClient } from "@/utils/supabase/server";
import { loadReview, adjacentReview } from "../data";
import { ageLabel, reasons } from "../shared";
import { ReviewNotice } from "../notice";
import { ReviewEditor } from "./review-editor";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const loaded = await loadReview(id);
  if (!loaded?.attempt)
    return (
      <EmptyState
        icon={Pen}
        title="Attempt missing"
        description="This review or its answer is no longer available."
        action={<Link href="/admin/marking/review">Back to queue</Link>}
      />
    );
  const { review, attempt: a, session, name, resolver } = loaded;
  const db = await createClient();
  const [prev, next, signed] = await Promise.all([
    adjacentReview(db, review, "prev"),
    adjacentReview(db, review, "next"),
    a.image_paths?.length
      ? db.storage.from("answers").createSignedUrls(a.image_paths, 3600)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (signed.error) throw signed.error;
  const q = a.question;
  const row: ReviewRow = {
    attempt_id: a.id,
    position: 0,
    question_id: a.question_id,
    type: q?.type ?? "short",
    marks: q?.marks ?? a.max_marks ?? 0,
    stem: q?.stem ?? "Own question",
    source: q?.source ?? "Own question",
    criteria: q?.criteria ?? null,
    sample_answer: q?.sample_answer ?? null,
    stimulus: null,
    options: null,
    topic_id: null,
    year: null,
    choice_index: null,
    flagged: false,
    correct_index: null,
    explanation: null,
    answer_text: a.answer_text,
    transcript: a.transcript,
    image_paths: a.image_paths,
    status: a.status,
    check_status: a.check_status,
    mark: a.mark,
    max_marks: a.max_marks,
    band: a.band,
    feedback: a.feedback,
    review,
  };
  const query = await searchParams;
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Marking review"
        title={
          <Link
            className="underline"
            href={`/admin/students/${review.user_id}`}
          >
            {name}
          </Link>
        }
        description={`${session?.kind ?? "Session"} · ${session ? dateLabel(session.started_at) : ""} · ${row.source} · ${ageLabel(review.created_at)}`}
        actions={<Link href="/admin/marking/review">Back to queue</Link>}
      />
      <Badge variant="outline">{reasons[review.reason]}</Badge>
      <ReviewNotice
        key={id}
        message={typeof query.notice === "string" ? query.notice : undefined}
      />
      {review.status === "resolved" && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          Resolved by {resolver} ·{" "}
          {review.resolved_at
            ? `${dateLabel(review.resolved_at)} at ${new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).format(new Date(review.resolved_at))}`
            : ""}
        </p>
      )}
      <ReviewEditor
        key={`${id}:${review.status}`}
        id={id}
        row={row}
        review={review}
        photos={(signed.data ?? []).flatMap((p) =>
          p.signedUrl ? [p.signedUrl] : [],
        )}
        prev={prev?.id ?? null}
        next={next?.id ?? null}
        guidelineNotes={q?.guideline_notes ?? null}
      />
    </div>
  );
}
