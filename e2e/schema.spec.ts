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
    const tooBig = await db.rpc("start_sprint", {
      p_config: { mode: "mcq", target: 41 },
    });
    expect(tooBig.error?.message).toMatch(/size is out of range/);
    const pool = await db.rpc("sprint_pool", {
      p_config: { mode: "mcq", topics: ["t3"], subtopics: ["t3-inflation"] },
    });
    expect(pool.error).toBeNull();
    expect(pool.data.questions).toBeGreaterThanOrEqual(5);
    expect(pool.data.subtopics["t3-inflation"]).toBe(pool.data.questions);
    expect(pool.data.all_subtopics).toBeGreaterThan(pool.data.questions);
    const { data: id, error } = await db.rpc("start_sprint", {
      p_config: {
        mode: "mcq",
        topics: ["t3"],
        subtopics: ["t3-inflation"],
        target: 5,
        timed: false,
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
      target: 5,
      time_limit_s: null,
      actual_questions: 5,
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
  test("students cannot read where a flashcard came from", async () => {
    const hidden = await student.db
      .from("flashcards")
      .select("origin")
      .limit(1);
    expect(hidden.error).not.toBeNull();
    const hiddenRef = await student.db
      .from("flashcards")
      .select("origin_ref")
      .limit(1);
    expect(hiddenRef.error).not.toBeNull();
    const ok = await student.db
      .from("flashcards")
      .select("id,front,back,kind,topic_id,owner_id,status")
      .limit(1);
    expect(ok.error).toBeNull();
    expect(ok.data!.length).toBe(1);
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
    // The 20 A1 eval questions (0020) and 41 mock-exam questions (0022) are retired;
    // the eval set's held-out answers are there (claro-ml may import more).
    const evalSet = await db
      .from("marking_examples")
      .select("question_id")
      .eq("split", "test")
      .like("question_id", "a1-%");
    expect(evalSet.error).toBeNull();
    expect(evalSet.data!.length).toBeGreaterThanOrEqual(20);
    const evalQuestions = await db
      .from("questions")
      .select("status")
      .like("id", "a1-%")
      // A1 content imports (a1-p-*, a1-x-*) are content, not the eval set.
      .not("id", "like", "a1-p-%")
      .not("id", "like", "a1-x-%");
    expect(evalQuestions.data).toEqual(Array(61).fill({ status: "retired" }));
    // Students never see the retired eval/mock questions; published A1 practice (a1-p-*, a1-x-*)
    // is visible, but only the live ones.
    const hidden = await student.db
      .from("questions")
      .select("id")
      .like("id", "a1-%")
      .not("id", "like", "a1-p-%")
      .not("id", "like", "a1-x-%");
    expect(hidden.data).toEqual([]);
    const seenPractice = await student.db
      .from("questions")
      .select("id")
      .like("id", "a1-p-%")
      .limit(1000);
    const practiceStatus = await db
      .from("questions")
      .select("id,status")
      .in(
        "id",
        (seenPractice.data ?? []).map((r) => r.id),
      );
    expect(
      (practiceStatus.data ?? []).filter((r) => r.status !== "live"),
    ).toEqual([]);
  });
});
