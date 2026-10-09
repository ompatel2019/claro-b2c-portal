"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { paperSchema } from "@/lib/paper-builder";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { contentUndoToken, readContentUndoToken } from "@/lib/admin-content";
import { pages } from "@/lib/flashcard-data";

const LIST = "/admin/content/papers";

/** "New paper": a Claro draft with the defaults, then straight into the builder. */
export async function createPaper() {
  await requireAdmin();
  const { data, error } = await admin()
    .from("papers")
    .insert({
      title: "Untitled paper",
      origin: "claro",
      status: "draft",
      total_marks: 1, // papers_total_marks_check; shown as 0 until it has questions
    })
    .select("id")
    .single();
  if (error) throw new Error("Could not create the paper.");
  revalidatePath(LIST);
  redirect(`${LIST}/${data.id}`);
}

/** SQL validates canonical bank facts and writes the whole paper atomically. */
export async function savePaper(
  id: string,
  input: unknown,
  status: "draft" | "live" | "retired",
  publishDrafts = false,
  expected: string,
): Promise<{ ok: true; total: number; undo?: string } | { error: string }> {
  const profile = await requireAdmin();
  const parsed = paperSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (
    !z.uuid().safeParse(id).success ||
    !z.iso.datetime({ offset: true }).safeParse(expected).success ||
    !z.enum(["draft", "live", "retired"]).safeParse(status).success ||
    typeof publishDrafts !== "boolean"
  )
    return { error: "Check the paper details." };
  const db = await createClient();
  const { data, error } = await db.rpc("admin_save_paper", {
    p_id: id,
    p_input: parsed.data,
    p_status: status,
    p_publish_drafts: publishDrafts,
    p_expected: expected,
  });
  if (error)
    return {
      error:
        error.code === "P0001" ? error.message : "Couldn't save. Try again.",
    };
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
  revalidatePath("/admin/content/questions");
  revalidatePath("/student/papers");
  const saved = data as {
    total: number;
    version: string;
    previous_status: "draft" | "live" | "retired";
  };
  return {
    ok: true,
    total: saved.total,
    ...(status === "retired" && saved.previous_status === "live"
      ? {
          undo: contentUndoToken("papers", profile.id, {
            previous: [{ id, status: saved.previous_status }],
            version: saved.version,
          }),
        }
      : {}),
  };
}

const bankFilters = z.object({
  q: z.string().max(100).optional(),
  type: z.enum(["mcq", "short", "extended"]).optional(),
  topic: z.string().max(40).optional(),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  origin: z.enum(["nesa", "a1", "claro"]).optional(),
  status: z.enum(["live", "draft"]).optional(),
});

/** The "Add questions" bank picker: up to 50 matches with the papers they're already in. */
export async function searchBank(filters: unknown, requestedPage = 1) {
  await requireAdmin();
  const f = bankFilters.parse(filters);
  const page = z.number().int().min(1).max(100000).parse(requestedPage);
  let q = admin()
    .from("questions")
    .select("id,source,type,marks,topic_id,status,stem,stimulus,options,year", {
      count: "exact",
    })
    .in("status", f.status ? [f.status] : ["live", "draft"])
    .order("year", { ascending: false })
    .order("id")
    .range((page - 1) * 50, page * 50 - 1);
  if (f.type) q = q.eq("type", f.type);
  if (f.topic)
    q = f.topic.includes("-")
      ? q.eq("topic_id", f.topic)
      : q.like("topic_id", `${f.topic}-%`);
  if (f.from) q = q.gte("year", f.from);
  if (f.to) q = q.lte("year", f.to);
  if (f.origin) q = q.eq("origin", f.origin);
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ");
    q = q.or(`id.ilike.%${term}%,source.ilike.%${term}%,stem.ilike.%${term}%`);
  }
  const { data, count } = await q
    .overrideTypes<
      {
        id: string;
        source: string;
        type: "mcq" | "short" | "extended";
        marks: number;
        topic_id: string;
        status: "draft" | "live";
        stem: string;
        stimulus: string | null;
        options: string[] | null;
        year: number;
      }[],
      { merge: false }
    >()
    .throwOnError();
  const rows = data ?? [];
  const inPapers = rows.length
    ? await pages<{ question_id: string; paper: { title: string } | null }>(
        (from, to) =>
          admin()
            .from("paper_questions")
            .select("question_id,paper:papers(title)")
            .in(
              "question_id",
              rows.map((r) => r.id),
            )
            .order("paper_id")
            .order("position")
            .range(from, to)
            .overrideTypes<
              { question_id: string; paper: { title: string } | null }[],
              { merge: false }
            >(),
      )
    : [];
  const titles = new Map<string, string[]>();
  for (const r of inPapers ?? []) {
    const title = (r.paper as unknown as { title: string } | null)?.title;
    if (title)
      titles.set(r.question_id, [...(titles.get(r.question_id) ?? []), title]);
  }
  return {
    rows: rows.map((r) => ({ ...r, papers: titles.get(r.id) ?? [] })),
    count: count ?? 0,
    page,
  };
}

/** Bulk retirement never publishes a paper. Return versions for guarded Undo. */
export async function retirePapers(input: unknown) {
  const profile = await requireAdmin();
  const ids = z.array(z.uuid()).min(1).max(50).parse(input);
  const db = await createClient();
  const { data } = await db
    .rpc("admin_retire_papers", { p_ids: ids })
    .throwOnError();
  const saved = data as {
    previous: { id: string; status: "draft" | "live" }[];
    version: string;
  };
  revalidatePath(LIST);
  revalidatePath("/student/papers");
  return {
    done: saved.previous.length,
    undo: contentUndoToken("papers", profile.id, saved),
  };
}

export async function undoRetirePapers(token: string) {
  const profile = await requireAdmin();
  const saved = z
    .object({
      previous: z
        .array(z.object({ id: z.uuid(), status: z.enum(["draft", "live"]) }))
        .max(50),
      version: z.iso.datetime({ offset: true }),
    })
    .parse(readContentUndoToken("papers", profile.id, token));
  const { previous, version } = saved;
  const db = await createClient();
  let done = 0;
  for (const p of previous) {
    const { data } = await db
      .from("papers")
      .update({ status: p.status, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("status", "retired")
      .eq("updated_at", version)
      .select("id")
      .throwOnError();
    done += data?.length ?? 0;
  }
  revalidatePath(LIST);
  revalidatePath("/student/papers");
  return done;
}
