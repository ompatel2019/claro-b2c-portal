import { expect, test } from "@playwright/test";
import { adminClient, cleanupSessions, signIn, start } from "./helpers";

const answer =
  "Inflation rose because demand grew faster than supply. Wages lagg[?] behind prices.";
const comments = [
  {
    quote: "Inflation rose",
    start: 0,
    kind: "fix",
    tag: "Evidence",
    body: "Give a CPI figure.",
    next_mark: "Quote the latest CPI rate.",
  },
  {
    quote: "demand grew faster than supply",
    start: 23,
    kind: "strength",
    tag: "Knowledge",
    body: "Correct cause of demand-pull inflation.",
    next_mark: null,
  },
  {
    quote: "",
    start: null,
    kind: "fix",
    tag: "Structure",
    body: "End with a one-line judgement.",
    next_mark: null,
  },
];

test.describe("annotated written feedback", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !adminClient(),
    "Needs a student account and the service key to seed a marked answer",
  );
  test.describe.configure({ mode: "serial" });
  const ids: string[] = [];
  const reports: { id: string; screenshots: string[] }[] = [];
  let results = "";
  test.afterAll(async () => {
    const db = adminClient()!;
    for (const r of reports) {
      if (r.screenshots.length)
        await db.storage.from("reports").remove(r.screenshots);
      await db.from("feedback").delete().eq("id", r.id);
    }
    await cleanupSessions(ids);
  });

  test("seed a finished sprint with a marked written answer", async ({
    page,
  }) => {
    await signIn(page);
    const id = await start(page, "Short answer", ids);
    // Seed the marking directly so nothing calls OpenAI: the first answer
    // is marked, the rest skipped, and the session is finished in the DB.
    const db = adminClient()!;
    const { data: attempts } = await db
      .from("attempts")
      .select("id,position")
      .eq("session_id", id)
      .order("position");
    const [first, ...rest] = attempts!;
    const skipped = await db
      .from("attempts")
      .update({ status: "skipped" })
      .in(
        "id",
        rest.map((a) => a.id),
      );
    const marked = await db
      .from("attempts")
      .update({
        status: "marked",
        check_status: "skipped",
        answer_text: answer,
        mark: 2,
        max_marks: 4,
        feedback: { comments, better_answer_outline: ["State a cause."] },
      })
      .eq("id", first.id);
    const finished = await db
      .from("sessions")
      .update({ finished_at: new Date().toISOString(), score: 2, max_score: 4 })
      .eq("id", id);
    expect([skipped.error, marked.error, finished.error]).toEqual([
      null,
      null,
      null,
    ]);
    results = `/practice/${id}/results`;
  });

  test("highlights and margin cards link both ways on wide screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1700, height: 1000 });
    await signIn(page);
    await page.goto(results);
    await page.locator("summary").first().click();
    await expect(page.getByText("2 / 4")).toBeVisible();
    await expect(
      page.getByText("Marked", { exact: true }).last(),
    ).toBeVisible();
    await expect(
      page.getByText("Quote the latest CPI rate.").first(),
    ).toBeVisible();
    const fix = page.getByRole("button", {
      name: "Fix 1, Evidence: Give a CPI figure.",
    });
    await expect(fix).toHaveText("Inflation rose");
    await fix.click();
    await expect(page.locator('[data-card="0"]')).toBeFocused();
    await expect(page.getByText("Overall")).toBeVisible();
    await expect(
      page.getByTitle("Hard to read. Not counted against you."),
    ).toHaveText("lagg[?]");
    // The margin card sits level with its highlight.
    const [h, c] = await Promise.all([
      fix.boundingBox(),
      page.locator('[data-card="0"]').boundingBox(),
    ]);
    expect(Math.abs(h!.y - c!.y)).toBeLessThan(40);
    expect(c!.x).toBeGreaterThan(h!.x + 300);
    await page.getByRole("button", { name: "Fixes (2)" }).click();
    await expect(page.getByRole("button", { name: /^Strength 2/ })).toHaveCount(
      0,
    );
  });

  test("tapping a highlight opens its comment on phones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto(results);
    await page.locator("summary").first().click();
    await page.getByRole("button", { name: /^Strength 2/ }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByText("Correct cause of demand-pull inflation."),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("report a problem with this question sends linked feedback", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(results);
    await page.locator("summary").first().click();
    await page
      .getByRole("button", { name: "Report a problem with this question" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/^Linked: /)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Content error" }),
    ).toHaveAttribute("aria-pressed", "true");
    const message = `E2E report ${Date.now()}`;
    await dialog.getByRole("textbox", { name: "Message" }).fill(message);
    await dialog
      .getByLabel("Add screenshots")
      .setInputFiles("e2e/fixtures/answer.jpg");
    await expect(dialog.getByRole("img", { name: "answer.jpg" })).toBeVisible();
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(
      page.getByText("Thanks. We read every message."),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    const { data } = await adminClient()!
      .from("feedback")
      .select("id,kind,question_id,session_id,screenshots,page_path")
      .eq("message", message)
      .single();
    reports.push(data!);
    expect(data).toMatchObject({
      kind: "content",
      session_id: ids[0],
      page_path: results,
    });
    expect(data!.question_id).toBeTruthy();
    expect(data!.screenshots).toHaveLength(1);
  });

  test("the floating button opens general feedback on any student page", async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Feedback", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "General" }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });
});
