"use server";

import { createHash, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { readComments, TAGS } from "@/lib/feedback";
import { markAttempt, rescoreSession } from "@/lib/marking/engine";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { loadReview, adjacentReview } from "./data";
import { z } from "zod";
import { anchorComments } from "@/lib/marking/grade";
import { commentChanged, concurrentMessage } from "./shared";

const editedComments = z
  .array(
    z.object({
      id: z.number().int(),
      quote: z.string().max(20000),
      start: z.number().int().nonnegative().nullable(),
      kind: z.enum(["strength", "fix"]),
      tag: z.enum(TAGS).nullable(),
      body: z.string().trim().min(1).max(4000),
      next_mark: z.string().max(4000).nullable(),
    }),
  )
  .max(100);

const queue = "/admin/marking/review";

export async function addSpotChecks() {
  await requireAdmin();
  const db = await createClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const candidates: {
    id: string;
    user_id: string;
    mark: number | null;
    marked_by_model: string | null;
  }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("attempts")
      .select("id,user_id,mark,marked_by_model")
      .eq("status", "marked")
      .eq("check_status", "agreed")
      .gte("marked_at", since)
      .order("id")
      .range(from, from + 999)
      .throwOnError();
    candidates.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  let added = 0;
  // Sample without replacement; the unique open-review index handles races.
  while (candidates.length && added < 5) {
    const index = randomInt(candidates.length);
    const [a] = candidates.splice(index, 1);
    const { error } = await admin().from("mark_reviews").insert({
      attempt_id: a.id,
      user_id: a.user_id,
      reason: "spot_check",
      ai_mark: a.mark,
      ai_model: a.marked_by_model,
    });
    if (error && error.code !== "23505") throw error;
    if (!error) added++;
  }
  revalidatePath(queue);
  redirect(
    `${queue}?notice=${encodeURIComponent(`Added ${added} spot checks.`)}`,
  );
}

export async function retryMarking(id: string) {
  await requireAdmin();
  const db = await createClient();
  const { data: a } = await db
    .from("attempts")
    .select("status,session_id")
    .eq("id", id)
    .single()
    .throwOnError();
  if (a.status !== "failed")
    redirect(`${queue}?tab=failed&notice=This+answer+is+no+longer+failed.`);
  let notice = "Marking retried.";
  try {
    await markAttempt(id);
    await rescoreSession(a.session_id);
  } catch {
    notice = "Retry did not complete. Refresh the queue or mark manually.";
  }
  revalidatePath(queue);
  redirect(`${queue}?tab=failed&notice=${encodeURIComponent(notice)}`);
}

export async function markManually(id: string) {
  await requireAdmin();
  const db = await createClient();
  const { data: a } = await db
    .from("attempts")
    .select("id,user_id,status,mark,marked_by_model")
    .eq("id", id)
    .single()
    .throwOnError();
  if (!["failed", "unreadable"].includes(a.status))
    redirect(
      `${queue}?tab=failed&notice=This+answer+is+no+longer+failed+or+unreadable.`,
    );
  const { data: inserted, error } = await admin()
    .from("mark_reviews")
    .insert({
      attempt_id: a.id,
      user_id: a.user_id,
      reason: "spot_check",
      ai_mark: a.mark,
      ai_model: a.marked_by_model,
    })
    .select("id")
    .single();
  if (error && error.code !== "23505") throw error;
  const { data: existing } = inserted
    ? { data: inserted }
    : await db
        .from("mark_reviews")
        .select("id")
        .eq("attempt_id", id)
        .eq("status", "open")
        .single()
        .throwOnError();
  revalidatePath(queue);
  redirect(`${queue}/${existing!.id}`);
}

export async function resolveReview(
  id: string,
  _state: string | null,
  form: FormData,
): Promise<string | null> {
  const profile = await requireAdmin();
  const loaded = await loadReview(id);
  if (!loaded?.attempt) return "Attempt missing.";
  const { review, attempt: a, fullName } = loaded;
  if (review.status !== "open") return concurrentMessage(review.resolved_at);
  if (
    a.question_id &&
    a.question?.type !== "mcq" &&
    a.question?.criteria == null
  )
    return "Marking guidelines are available after this session is finished. Keep this review open until then.";
  const unchanged = form.get("unchanged") === "yes";
  if (
    !unchanged &&
    (form.get("mark") == null || String(form.get("mark")).trim() === "")
  )
    return "Choose a final mark.";
  if (unchanged && a.mark == null)
    return "This attempt has no mark. Choose an explicit final mark and use Resolve.";
  const max = a.max_marks ?? a.question?.marks;
  const mark = unchanged ? Number(a.mark) : Number(form.get("mark"));
  const note = String(form.get("admin_note") ?? "");

  const answer = a.transcript ?? a.answer_text ?? "";
  const comments = readComments(a.feedback, answer);
  if (max == null || !Number.isInteger(mark) || mark < 0 || mark > max)
    return "Choose a whole mark within the question's range.";
  if (note.length > 1000) return "Admin note must be at most 1,000 characters.";
  const raw = Array.isArray(a.feedback?.comments) ? a.feedback.comments : [];
  let submitted: z.infer<typeof editedComments> = [];
  let nextLine = "";
  if (!unchanged) {
    try {
      submitted = editedComments.parse(
        JSON.parse(String(form.get("comments"))),
      );
      nextLine = z.string().max(4000).parse(form.get("next_mark_line"));
    } catch {
      return "Check comment bodies, tags and the next mark line before resolving.";
    }
    if (
      new Set(submitted.map((c) => c.id)).size !== submitted.length ||
      submitted.some(
        (c) =>
          (c.id >= 0 && !comments.some((before) => before.id === c.id)) ||
          (c.id < 0 &&
            (!c.quote ||
              c.start === null ||
              answer.slice(c.start, c.start + c.quote.length) !== c.quote ||
              !c.tag)) ||
          (!c.tag &&
            (c.id < 0 ||
              commentChanged(
                comments.find((before) => before.id === c.id)!,
                c,
              ))),
      )
    )
      return "Invalid comment selection or tag. Refresh and try again.";
  }
  const rejected = unchanged
    ? []
    : raw.filter((_c, id) => {
        const before = comments.find((c) => c.id === id);
        if (!before) return false;
        const after = submitted.find((c) => c.id === id);
        return !after || commentChanged(before, after);
      });
  const finalComments = unchanged
    ? raw
    : submitted
        .map(({ id: commentId, ...c }) => {
          const before = comments.find((item) => item.id === commentId);
          if (before && !commentChanged(before, c)) return raw[commentId];
          // Keep the exact selected occurrence; fall back to the marker's normalised anchoring.
          const anchored =
            c.start !== null &&
            c.quote &&
            answer.slice(c.start, c.start + c.quote.length) === c.quote
              ? c
              : anchorComments(answer, [{ ...c, tag: c.tag! }])[0];
          return {
            ...anchored,
            next_mark:
              c.kind === "strength" ? null : c.next_mark?.trim() || null,
          };
        })
        .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const feedback: Record<string, unknown> = {
    ...a.feedback,
    comments: finalComments,
    ...(!unchanged ? { next_mark_line: nextLine } : {}),
  };
  if (mark > 0 && feedback.note === "No answer") delete feedback.note;
  // Same mark-to-band rule as the marking engine: zero satisfies no band.
  const band =
    (mark === 0
      ? null
      : a.question?.criteria?.find((c) => mark >= c.min && mark <= c.max)
          ?.descriptor) ?? "NO BAND SATISFIED";
  const svc = admin();
  const { data: claimed, error: claimError } = await svc
    .from("mark_reviews")
    .update({
      status: "resolved",
      final_mark: mark,
      admin_note: note || null,
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (claimError) return "Could not resolve this review. Try again.";
  if (!claimed?.length) {
    const latest = await loadReview(id);
    return concurrentMessage(latest?.review.resolved_at);
  }
  // Intentionally sequential, after the guarded claim (no schema/transaction changes).
  let stage = "saving the attempt";
  try {
    await svc
      .from("attempts")
      .update({
        mark,
        band,
        feedback,
        status: "marked",
        max_marks: max,
        marked_at: a.marked_at ?? new Date().toISOString(),
        marked_by_model: "admin",
        check_status: "reviewed",
      })
      .eq("id", a.id)
      .select("id")
      .single()
      .throwOnError();
    stage = "rescoring the session";
    await rescoreSession(a.session_id);
    stage = "saving the marking example";
    if (a.question_id) {
      const tokens = (fullName ?? "")
        .split(/\s+/)
        .filter((token) => token.length >= 3);
      const anonymise = (text: string) => {
        let result = text.replace(
          /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
          "[email]",
        );
        for (const token of tokens) {
          const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          result = result.replace(
            new RegExp(
              `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
              "giu",
            ),
            "[name]",
          );
        }
        return result;
      };
      // Comments can quote the student's identifying text too.
      const cleanComments = (items: Record<string, unknown>[]) =>
        items.map((c) =>
          Object.fromEntries(
            Object.entries(c).map(([key, value]) => [
              key,
              typeof value === "string" ? anonymise(value) : value,
            ]),
          ),
        );
      await svc
        .from("marking_examples")
        .upsert(
          {
            question_id: a.question_id,
            answer_text: anonymise(answer),
            tutor_mark: mark,
            band,
            accepted_tutor_comments: cleanComments(finalComments),
            rejected_ai_comments: cleanComments(rejected),
            split: "example",
            origin: "admin_override",
            source_hash: createHash("sha256")
              .update(`admin_override:${a.id}`)
              .digest("hex"),
          },
          { onConflict: "source_hash", ignoreDuplicates: true },
        )
        .throwOnError();
    }
  } catch {
    let reopened = false;
    try {
      await svc
        .from("mark_reviews")
        .update({
          status: "open",
          final_mark: null,
          admin_note: null,
          resolved_by: null,
          resolved_at: null,
        })
        .eq("id", id)
        .eq("status", "resolved")
        .eq("resolved_by", profile.id)
        .select("id")
        .single()
        .throwOnError();
      reopened = true;
    } catch {
      // Report a failed recovery too, rather than claiming the review is open.
    }
    revalidatePath(queue, "layout");
    return reopened
      ? `Could not resolve: ${stage} failed. The review is open; try again.`
      : `Could not reopen the review after ${stage} failed. Reload the review before continuing.`;
  }
  const db = await createClient();
  // Advance chronologically, wrapping to the oldest remaining open review.
  const next = await adjacentReview(db, review, "next");
  const { data: first } = next
    ? { data: next }
    : await db
        .from("mark_reviews")
        .select("id")
        .eq("status", "open")
        .order("created_at")
        .order("id")
        .limit(1)
        .maybeSingle()
        .throwOnError();
  revalidatePath(queue, "layout");
  const notice = "Resolved. Next review";
  redirect(
    `${queue}${first ? `/${first.id}` : ""}?notice=${encodeURIComponent(notice)}`,
  );
}
