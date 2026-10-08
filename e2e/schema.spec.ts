import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanupSessions } from "./helpers";

// Row-level security and RPC checks for the v1 schema (migrations 0011–0017), as real users.
async function as(email?: string, password?: string) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await db.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (error) throw new Error("Could not sign in for schema checks.");
  return { db, uid: data.user.id };
}

test.describe("Schema and RLS", () => {
  test.skip(
    !process.env.SUPABASE_SECRET_KEY ||
      !process.env.STUDENT_EMAIL ||
      !process.env.ADMIN_EMAIL,
    "Requires service-role, student and admin credentials",
  );
  test.describe.configure({ mode: "serial" });
  const draftId = `e2e-draft-${Date.now()}`;
  const sessionIds: string[] = [];
  let student: { db: SupabaseClient; uid: string };
  test.beforeAll(async () => {
    student = await as(process.env.STUDENT_EMAIL, process.env.STUDENT_PASSWORD);
    const { error } = await adminClient()!
      .from("questions")
      .insert({
        id: draftId,
        type: "short",
        topic_id: "t3-inflation",
        marks: 2,
        stem: `E2E draft question ${draftId}`,
        criteria: [],
        source: "E2E",
        year: 2026,
        origin: "claro",
        status: "draft",
      });
    if (error) throw new Error("Could not create the E2E draft question.");
  });
  test.afterAll(async () => {
    await cleanupSessions(sessionIds);
    await adminClient()!.from("questions").delete().eq("id", draftId);
  });

  test("students never see keys, drafts, marking data or homework", async () => {
    const { db } = student;
    for (const column of ["correct_index", "explanation", "sample_answer"])
      expect(
        (await db.from("questions").select(column).limit(1)).error,
      ).toBeTruthy();
    const draft = await db.from("questions").select("id").eq("id", draftId);
    expect(draft.error).toBeNull();
    expect(draft.data).toEqual([]);
    const examples = await db.from("marking_examples").select("id").limit(1);
    expect(examples.error).toBeNull();
    expect(examples.data).toEqual([]);
    expect(
      (await db.from("marking_examples_for_grader").select("id").limit(1))
        .error,
    ).toBeTruthy();
    const queue = await db.from("review_queue").select("id");
    expect(queue.error).toBeNull();
    expect(queue.data).toEqual([]);
    expect(
      (await db.from("homework_sets").select("id").limit(1)).error,
    ).toBeTruthy();
  });

  test("students manage only their own flashcards", async () => {
    const { db, uid } = student;
    const card = {
      topic_id: "t3-inflation",
      kind: "term",
      front: `E2E own card ${Date.now()}`,
      back: "A card made by the E2E student.",
    };
    expect(
      (await db.from("flashcards").insert({ ...card, origin: "claro" })).error,
    ).toBeTruthy();
    const own = await db
      .from("flashcards")
      .insert({ ...card, owner_id: uid, origin: "student" })
      .select("id")
      .single();
    expect(own.error).toBeNull();
    const removed = await db
      .from("flashcards")
      .delete()
      .eq("id", own.data!.id)
      .select("id");
    expect(removed.data).toHaveLength(1);
  });

  test("sprints start from a config and keys stay hidden until finish", async () => {
    const { db } = student;
    const tooMany = await db.rpc("start_sprint", {
      p_config: { mode: "mcq", topics: ["t1", "t2", "t3"] },
    });
    expect(tooMany.error?.message).toMatch(/at most two topics/);
    const { data: id, error } = await db.rpc("start_sprint", {
      p_config: {
        mode: "mcq",
        topics: ["t3"],
        subtopics: ["t3-inflation"],
        target_marks: 5,
        time_limit_min: null,
      },
    });
    expect(error).toBeNull();
    sessionIds.push(id);
    const session = await db
      .from("sessions")
      .select("config,attempts(question:questions(topic_id))")
      .eq("id", id)
      .single();
    expect(session.data!.config).toMatchObject({
      mode: "mcq",
      target_marks: 5,
      time_limit_min: null,
    });
    const attempts = session.data!.attempts as unknown as {
      question: { topic_id: string };
    }[];
    expect(attempts).toHaveLength(5);
    expect(attempts.every((a) => a.question.topic_id === "t3-inflation")).toBe(
      true,
    );
    const review = await db.rpc("session_review", { p_session: id });
    expect(review.error).toBeNull();
    expect(review.data).toEqual([]);
    const paper = await db.rpc("start_paper", {
      p_paper: "00000000-0000-4000-8000-000000000000",
    });
    expect(paper.error?.message).toMatch(/paper not found/);
  });

  test("activity days and streaks: students read only their own", async () => {
    const admin = await as(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    const own = await student.db.rpc("activity_days");
    expect(own.error).toBeNull();
    const other = await student.db.rpc("activity_days", { p_user: admin.uid });
    expect(other.data).toEqual([]);
    const seen = await admin.db.rpc("activity_days", { p_user: student.uid });
    expect(seen.data).toEqual(own.data);
    const streaks = await student.db.rpc("activity_streaks").single();
    expect(streaks.error).toBeNull();
    const { current_streak, longest_streak } = streaks.data as {
      current_streak: number;
      longest_streak: number;
    };
    expect(current_streak).toBeLessThanOrEqual(longest_streak);
    const stats = await student.db.rpc("dashboard_stats");
    expect(stats.data.streak_days).toBe(current_streak);
  });
  test("admins see drafts and marking examples", async () => {
    const { db } = await as(
      process.env.ADMIN_EMAIL,
      process.env.ADMIN_PASSWORD,
    );
    const draft = await db
      .from("questions")
      .select("id,status")
      .eq("id", draftId);
    expect(draft.data).toEqual([{ id: draftId, status: "draft" }]);
    expect(
      (await db.from("marking_examples").select("id").limit(1)).error,
    ).toBeNull();
  });
});
