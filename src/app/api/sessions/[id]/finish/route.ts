import { admin } from "@/utils/supabase/admin";
import {
  resolvePaperChoices,
  paperClock,
  type PaperConfig,
} from "@/lib/paper-session";
import { type Attempt } from "@/lib/practice";
import {
  finishSession,
  markAttempt,
  STALE_CLAIM_MS,
} from "@/lib/marking/engine";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const { data: session } = await supabase
    .from("sessions")
    .select("kind,config,started_at,finished_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session)
    return Response.json({ error: "Session not found" }, { status: 404 });
  try {
    if (session.kind === "paper" && !session.finished_at) {
      const config = session.config as PaperConfig;
      const submittedAt = new Date();
      const body = await request.json().catch(() => ({}));
      const { data: rows } = await admin()
        .from("attempts")
        .select("id,position,choice_index,answer_text,transcript")
        .eq("session_id", id)
        .eq("user_id", user.id)
        .order("position")
        .throwOnError();
      const attempts = (rows ?? []) as unknown as Attempt[];
      const choices =
        body.choices && typeof body.choices === "object" ? body.choices : {};
      // Only server time authorises automatic choice resolution. A late sit is always accepted.
      const automatic =
        paperClock(session.started_at, config, submittedAt.getTime())
          .remaining === 0;
      const resolution = resolvePaperChoices(
        config.sections,
        attempts,
        choices,
        automatic,
      );
      if (resolution.unresolved.length)
        return Response.json(
          { error: "Choose which question we should mark." },
          { status: 400 },
        );
      if (resolution.skipped.length)
        await admin()
          .from("attempts")
          .update({
            status: "skipped",
            mark: 0,
            max_marks: 0,
          })
          .in("id", resolution.skipped)
          .eq("session_id", id)
          .throwOnError();
      // The shared engine does not exclude skipped rows. Mark only the chosen rows here.
      const readMarks = async () => {
        const { data } = await admin()
          .from("attempts")
          .select(
            "id,status,claimed_at,mark,max_marks,question:questions(marks)",
          )
          .eq("session_id", id)
          .eq("user_id", user.id)
          .neq("status", "skipped")
          .throwOnError();
        return data ?? [];
      };
      let marked = await readMarks();
      const settleDeadline = Date.now() + 90_000;
      const inFlight = (a: (typeof marked)[number]) =>
        a.status === "marking" &&
        Date.now() - Date.parse(a.claimed_at ?? "1970-01-01") < STALE_CLAIM_MS;
      const settle = async () => {
        while (marked.some(inFlight) && Date.now() < settleDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          marked = await readMarks();
        }
      };
      for (let round = 0; round < 2; round++) {
        await settle();
        const todo = marked.filter(
          (a) => a.status !== "marked" && !inFlight(a),
        );
        if (!todo.length) break;
        const results = await Promise.allSettled(
          todo.map((a) => markAttempt(a.id)),
        );
        results.forEach((result) => {
          if (result.status === "rejected") console.error(result.reason);
        });
        marked = await readMarks();
      }
      await settle();
      // sessions.summary is produced by the paper results work in §3.10.
      const score = marked.reduce(
        (sum, a) => sum + (a.status === "marked" ? Number(a.mark ?? 0) : 0),
        0,
      );
      const max_score = marked.reduce(
        (sum, a) =>
          sum +
          Number(
            a.max_marks ?? (a.question as unknown as { marks: number }).marks,
          ),
        0,
      );
      await admin()
        .from("sessions")
        .update({
          finished_at: submittedAt.toISOString(),
          elapsed_s: Math.max(
            0,
            Math.min(
              (config.time_limit_min + config.reading_min) * 60,
              Math.floor(
                (submittedAt.getTime() - Date.parse(session.started_at)) / 1000,
              ),
            ),
          ),
          score,
          max_score,
        })
        .eq("id", id)
        .eq("user_id", user.id)
        .throwOnError();
      return Response.json({ score, max_score, finished: true });
    }
    const finished = await finishSession(id);
    return Response.json({
      score: finished.score,
      max_score: finished.max_score,
      summary: finished.summary,
      finished: true,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not finish session. Your answers are still saved. Please try again.",
      },
      { status: 500 },
    );
  }
}
