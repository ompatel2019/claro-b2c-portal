import { expect, test } from "@playwright/test";
import { adminClient, signIn } from "./helpers";
test.describe("Student homework", () => {
  test.skip(
    !process.env.STUDENT_EMAIL ||
      !process.env.STUDENT_PASSWORD ||
      !process.env.SUPABASE_SECRET_KEY,
    "Requires a student account and service-role seed credentials",
  );
  test.describe.configure({ mode: "serial" });
  const title = `E2E homework ${Date.now()}`;
  let setId = "";
  let correctIndex = 0;
  let userId = "";
  let seededCardIds: string[] = [];
  let previousProgress: Record<string, unknown>[] = [];
  const db = adminClient();
  test.beforeAll(async () => {
    if (!db) throw new Error("Supabase seed configuration is missing.");
    const [cards, mc, short] = await Promise.all([
      db
        .from("flashcards")
        .select("id")
        .eq("kind", "term")
        .order("id")
        .limit(2)
        .throwOnError(),
      db
        .from("questions")
        .select("id,correct_index")
        .eq("type", "mcq")
        .order("id")
        .limit(1)
        .throwOnError(),
      db
        .from("questions")
        .select("id")
        .eq("type", "short")
        .order("id")
        .limit(1)
        .throwOnError(),
    ]);
    expect(cards.data).toHaveLength(2);
    expect(mc.data).toHaveLength(1);
    expect(short.data).toHaveLength(1);
    correctIndex = mc.data![0].correct_index;
    seededCardIds = cards.data!.map((c) => c.id);
    const { data: set } = await db
      .from("homework_sets")
      .insert({
        title,
        due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single()
      .throwOnError();
    setId = set!.id;
    await db
      .from("homework_items")
      .insert([
        ...cards.data!.map((c, i) => ({
          set_id: setId,
          position: i + 1,
          flashcard_id: c.id,
        })),
        { set_id: setId, position: 3, question_id: mc.data![0].id },
        { set_id: setId, position: 4, question_id: short.data![0].id },
      ])
      .throwOnError();
  });
  test.afterAll(async () => {
    if (!db || !setId) return;
    if (userId) {
      await db
        .from("flashcard_progress")
        .delete()
        .eq("user_id", userId)
        .in("flashcard_id", seededCardIds)
        .throwOnError();
      if (previousProgress.length)
        await db
          .from("flashcard_progress")
          .insert(previousProgress)
          .throwOnError();
    }
    await db
      .from("sessions")
      .delete()
      .eq("homework_set_id", setId)
      .throwOnError();
    await db.from("homework_sets").delete().eq("id", setId).throwOnError();
  });
  test("recycles missed cards, saves progress and submits with an unanswered short answer without AI", async ({
    page,
  }) => {
    let aiChecks = 0;
    page.on("request", (request) => {
      if (
        /\/api\/(flashcards|attempts)\/[^/]+\/(mark|transcribe)$/.test(
          new URL(request.url()).pathname,
        )
      )
        aiChecks++;
    });
    await signIn(page);
    await page.goto("/homework", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Your homework." }),
    ).toBeVisible({ timeout: 30000 });
    const card = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .last();
    await expect(card).toBeVisible();
    await card
      .getByRole("link", { name: "Begin homework", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/homework/${setId}$`));
    await expect(
      page.getByRole("heading", { name: new RegExp(`Welcome to ${title}`) }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Begin homework", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/homework/${setId}/do`));
    await expect(page.getByRole("button", { name: "Finish now" })).toHaveCount(
      0,
    );
    const { data: run } = await db!
      .from("sessions")
      .select("user_id")
      .eq("homework_set_id", setId)
      .single()
      .throwOnError();
    userId = run!.user_id;
    const { data: progress } = await db!
      .from("flashcard_progress")
      .select("*")
      .eq("user_id", userId)
      .in("flashcard_id", seededCardIds)
      .throwOnError();
    previousProgress = progress ?? [];
    const first = await page
      .locator("article[data-card-id]")
      .getAttribute("data-card-id");
    await page.getByRole("button", { name: "Flip and rate myself" }).click();
    await page.getByRole("button", { name: "Missed", exact: true }).click();
    await expect(page.locator("article[data-card-id]")).not.toHaveAttribute(
      "data-card-id",
      first!,
    );
    // Mid Stage 1 reload must resume with the missed card still pending (not Card 1 at 0/2).
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/homework/${setId}/do`));
    await expect(page.getByText(/Card \d+ of 2/)).toBeVisible();
    await expect(page.locator("article[data-card-id]")).toBeVisible();
    await page.getByRole("button", { name: "Flip and rate myself" }).click();
    await page.getByRole("button", { name: "Knew it", exact: true }).click();
    await expect(page.locator("article[data-card-id]")).toHaveAttribute(
      "data-card-id",
      first!,
    );
    await page.getByRole("button", { name: "Flip and rate myself" }).click();
    await page.getByRole("button", { name: "Knew it", exact: true }).click();
    const continueBtn = page.getByRole("button", {
      name: "Continue to questions",
      exact: true,
    });
    if (await continueBtn.isVisible().catch(() => false))
      await continueBtn.click();
    await expect(
      page.getByRole("group", { name: "Choose your answer" }),
    ).toBeVisible({ timeout: 60000 });
    await page.getByRole("radio").nth(correctIndex).check();
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByRole("button", { name: "Review and submit" }).click();
    await expect(
      page.getByRole("heading", { name: "Ready to submit?" }),
    ).toBeVisible();
    await expect(
      page.getByText("1 question not answered.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Answer question 2" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Submit homework", exact: true })
      .click();
    await expect(page).toHaveURL(/\/practice\/[^/]+\/results$/, {
      timeout: 90000,
    });
    expect(aiChecks).toBe(0);
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Flashcards: 2 cards · 1 retries"),
    ).toBeVisible();
    await page.locator("details").first().locator("summary").click();
    await expect(page.locator("details").first()).toContainText("1/1");
    await page
      .getByRole("link", { name: "Back to homework", exact: true })
      .click();
    await expect(
      page.locator("article").filter({ hasText: title }).last(),
    ).toContainText("Submitted");
  });
});

test.describe("Homework written draft isolation", () => {
  test.skip(
    !process.env.STUDENT_EMAIL ||
      !process.env.STUDENT_PASSWORD ||
      !process.env.SUPABASE_SECRET_KEY,
    "Requires a student account and service-role seed credentials",
  );
  test.describe.configure({ mode: "serial" });
  const title = `E2E draft isolation ${Date.now()}`;
  let setId = "";
  const db = adminClient();
  test.beforeAll(async () => {
    if (!db) throw new Error("Supabase seed configuration is missing.");
    const [card, shorts] = await Promise.all([
      db
        .from("flashcards")
        .select("id")
        .eq("kind", "term")
        .order("id")
        .limit(1)
        .throwOnError(),
      db
        .from("questions")
        .select("id")
        .eq("type", "short")
        .order("id")
        .limit(2)
        .throwOnError(),
    ]);
    expect(card.data).toHaveLength(1);
    expect(shorts.data).toHaveLength(2);
    const { data: set } = await db
      .from("homework_sets")
      .insert({
        title,
        due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single()
      .throwOnError();
    setId = set!.id;
    await db
      .from("homework_items")
      .insert([
        { set_id: setId, position: 1, flashcard_id: card.data![0].id },
        { set_id: setId, position: 2, question_id: shorts.data![0].id },
        { set_id: setId, position: 3, question_id: shorts.data![1].id },
      ])
      .throwOnError();
  });
  test.afterAll(async () => {
    if (!db || !setId) return;
    // Clean only rows this test created (by set id).
    await db
      .from("sessions")
      .delete()
      .eq("homework_set_id", setId)
      .throwOnError();
    await db.from("homework_sets").delete().eq("id", setId).throwOnError();
  });
  test("keeps typed answers on the question they were typed into", async ({
    page,
  }) => {
    test.setTimeout(180000);
    await signIn(page);
    await page.goto("/homework", { waitUntil: "domcontentloaded" });
    const card = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .last();
    await card
      .getByRole("link", { name: "Begin homework", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Begin homework", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/homework/${setId}/do`));
    await page.getByRole("button", { name: "Flip and rate myself" }).click();
    await page.getByRole("button", { name: "Knew it", exact: true }).click();
    const continueBtn = page.getByRole("button", {
      name: "Continue to questions",
      exact: true,
    });
    if (await continueBtn.isVisible().catch(() => false))
      await continueBtn.click();
    await expect(page.getByLabel("Your answer")).toBeVisible({
      timeout: 60000,
    });
    const q3 = "UNIQUE_DRAFT_Q3_" + Date.now();
    await page.getByLabel("Your answer").fill(q3);
    await page
      .getByRole("button", { name: "Next question", exact: true })
      .click();
    await expect(page.getByLabel("Your answer")).toHaveValue("", {
      timeout: 15000,
    });
    await page
      .getByRole("button", { name: "Previous question", exact: true })
      .click();
    await expect(page.getByLabel("Your answer")).toHaveValue(q3, {
      timeout: 15000,
    });
  });
});
