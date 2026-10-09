import { singleSlotIds } from "@/lib/single-check";
import {
  ANSWER_PHOTO_BYTE_LIMIT,
  LONG_PHOTO_PAGE_LIMIT,
  SHORT_PHOTO_PAGE_LIMIT,
} from "@/lib/limits";
import { BUDGET_USD } from "@/lib/ai/prices";
import { transcribeImage } from "@/lib/marking/engine";
import { admin } from "@/utils/supabase/admin";
import {
  assertStudentAiRateLimit,
  rateLimitedResponse,
} from "@/lib/ai/rate-limit";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const { data: attempt } = await supabase
    .from("attempts")
    .select(
      "session_id, image_paths, question_id, status, question:questions(type,stem), session:sessions(kind,config,started_at,finished_at)",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!attempt)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  if (!["pending", "transcribed", "unreadable"].includes(attempt.status))
    return Response.json(
      { error: "Attempt is already being marked or marked" },
      { status: 409 },
    );
  const pages: string[] = attempt.image_paths ?? [];
  if (!pages.length || !pages.every((p) => p.startsWith(`${user.id}/`)))
    return Response.json({ error: "No answer image" }, { status: 400 });
  const question = attempt.question as unknown as {
    type: string;
    stem: string;
  } | null;
  const session = attempt.session as unknown as {
    kind: string;
    started_at: string;
    finished_at?: string | null;
    config: { question?: { stem: string } };
  } | null;
  if (
    session?.kind === "single" &&
    (!session.started_at ||
      !(await singleSlotIds(user.id, new Date(session.started_at))).includes(
        attempt.session_id,
      ))
  )
    return Response.json({ error: "Check not found" }, { status: 404 });
  if (session?.kind === "single" && session.finished_at)
    return Response.json(
      { error: "This check has already been submitted." },
      { status: 409 },
    );
  const questionType = question?.type;
  const kind = (attempt.session as unknown as { kind: string } | null)?.kind;
  const pageLimit =
    kind === "paper" || kind === "single" || questionType === "extended"
      ? LONG_PHOTO_PAGE_LIMIT
      : SHORT_PHOTO_PAGE_LIMIT;
  if (pages.length > pageLimit)
    return Response.json(
      { error: `Upload up to ${pageLimit} pages per question.` },
      { status: 400 },
    );
  const limited = await assertStudentAiRateLimit({ userId: user.id });
  if (!limited.ok) return rateLimitedResponse(limited);
  try {
    const { data: spent, error: spendError } = await admin().rpc("ai_spend");
    if (spendError) throw spendError;
    if (Number(spent) >= BUDGET_USD)
      return Response.json(
        {
          error:
            "Marking is paused right now. Your photos are saved; try again later.",
        },
        { status: 503 },
      );
    const stem = question?.stem ?? session?.config?.question?.stem;
    if (!stem)
      return Response.json({ error: "Question not found" }, { status: 400 });
    const images: Blob[] = [];
    for (const page of pages) {
      const { data: image, error } = await admin()
        .storage.from("answers")
        .download(page);
      if (error || !image) throw new Error("Image not found");
      if (
        image.size > ANSWER_PHOTO_BYTE_LIMIT ||
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ].includes(image.type)
      )
        return Response.json(
          { error: "Choose a JPEG, PNG, WebP or HEIC photo of 10 MB or less." },
          { status: 400 },
        );
      images.push(image);
    }
    const results = [];
    for (const [index, image] of images.entries()) {
      if (index > 0) {
        const pageLimited = await assertStudentAiRateLimit({ userId: user.id });
        if (!pageLimited.ok) return rateLimitedResponse(pageLimited);
      }
      results.push(
        await transcribeImage(
          await image.arrayBuffer(),
          image.type,
          stem,
          user.id,
        ),
      );
    }
    const result = {
      transcript: results.map((r) => r.transcript).join("\n\n"),
      lines: results.flatMap((r) => r.lines),
      notes: results
        .map((r) => r.notes)
        .filter(Boolean)
        .join("\n"),
    };
    const unreadable = !result.transcript.trim();
    const status =
      unreadable && kind === "single" ? "unreadable" : "transcribed";
    await admin()
      .from("attempts")
      .update({ transcript: result.transcript, status })
      .eq("id", id)
      .in("status", ["pending", "transcribed", "unreadable"])
      .throwOnError();
    return Response.json({
      ...result,
      ...(kind === "single" ? { status } : {}),
      ...(unreadable ? { unreadable: true } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AI budget reached")
      return Response.json(
        {
          error:
            "Marking is paused right now. Your photos are saved; try again later.",
        },
        { status: 503 },
      );
    console.error(error);
    return Response.json(
      { error: "Could not transcribe answer" },
      { status: 500 },
    );
  }
}
