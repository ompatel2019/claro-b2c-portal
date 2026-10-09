import { TYPED_ANSWER_WORD_LIMIT } from "@/lib/limits";
import { z } from "zod";
import { markWritten, MARKER } from "@/lib/marking/engine";
import { requireAdmin } from "@/lib/auth";
import {
  validateCriteria,
  marksRange,
  criterionSchema,
} from "@/lib/question-bank";
import { pages } from "@/lib/flashcard-data";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 240;

const body = z.object({
  question: z.object({
    id: z.string().min(1).max(40),
    type: z.enum(["short", "extended"]),
    marks: z.number().int().min(1).max(20),
    stem: z.string().min(1).max(4000),
    stimulus: z.string().max(8000).nullable(),
    criteria: z.array(criterionSchema).min(1),
    guideline_notes: z.string().nullable(),
    sample_answer: z.string().nullable(),
    source: z.string().max(60),
  }),
  answer: z.string().trim().min(1),
});

/** §4.4 Test mark: runs the live engine on unsaved criteria (ai_usage task admin_test). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin")
    return Response.json({ error: "Admins only" }, { status: 403 });
  await requireAdmin();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Add an answer and at least one criteria band." },
      { status: 400 },
    );
  const bands = validateCriteria(
    parsed.data.question.criteria,
    parsed.data.question.marks,
  );
  const [lo, hi] = marksRange(parsed.data.question.type);
  if (
    bands.summary ||
    bands.rows.some(Boolean) ||
    parsed.data.question.marks < lo ||
    parsed.data.question.marks > hi ||
    parsed.data.answer.split(/\s+/).length > TYPED_ANSWER_WORD_LIMIT
  )
    return Response.json(
      { error: "Check the criteria, marks and 3,000-word answer limit." },
      { status: 400 },
    );
  const { data: allowed, error: limitError } = await supabase.rpc(
    "admin_reserve_test_mark",
  );
  if (limitError)
    return Response.json(
      { error: "Couldn't check the rate limit. Try again." },
      { status: 503 },
    );
  if (!allowed)
    return Response.json(
      { error: "Test mark limit reached. Try again later." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const started = new Date().toISOString();
  try {
    const result = await markWritten(
      parsed.data.question,
      parsed.data.answer,
      user.id,
      "admin_test",
    );
    const usage = await pages<{ usd: number }>((from, to) =>
      admin()
        .from("ai_usage")
        .select("usd")
        .eq("user_id", user.id)
        .eq("task", "admin_test")
        .gte("created_at", started)
        .order("id")
        .range(from, to),
    );
    return Response.json({
      ...result,
      model: MARKER.model,
      effort: MARKER.effort,
      cost: (usage ?? []).reduce((n, u) => n + Number(u.usd), 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      {
        error: /budget/i.test(message)
          ? "Marking is paused: the AI budget is reached."
          : "Could not mark this answer. Try again.",
      },
      { status: 500 },
    );
  } finally {
    await admin()
      .from("ai_usage")
      .update({ model: "completed" })
      .eq("id", allowed)
      .eq("user_id", user.id);
  }
}
