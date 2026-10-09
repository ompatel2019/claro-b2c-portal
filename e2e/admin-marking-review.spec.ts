import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, cleanupSessions, signIn, start } from "./helpers";

const answer =
  "Inflation rose because demand grew faster than supply. Wages lagged behind prices.";
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
async function signInAdmin(page: Page) {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(admin)?$/, { timeout: 30000 });
}
const noOverflow = (page: Page) =>
  page.evaluate(
    () => document.scrollingElement!.scrollWidth <= window.innerWidth + 1,
  );

test.describe("admin marking review", () => {
  test.skip(
    !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.STUDENT_EMAIL ||
      !adminClient(),
    "Needs admin and student accounts and the service key to seed a review",
  );
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120000);
  const ids: string[] = [];
  let attemptId = "";
  let reviewId = "";
  let stem = "";
  const editor = () => `/admin/marking/review/${reviewId}`;
  test.afterAll(async () => {
    const db = adminClient()!;
    if (attemptId) {
      await db.from("mark_reviews").delete().eq("attempt_id", attemptId);
      await db
        .from("marking_examples")
        .delete()
        .eq(
          "source_hash",
          createHash("sha256")
            .update(`admin_override:${attemptId}`)
            .digest("hex"),
        );
    }
    await cleanupSessions(ids);
  });

  test("seed a marked answer with an open spot check", async ({ page }) => {
    await signIn(page);
    const id = await start(page, "Short answer", ids);
    // Mark directly in the DB so nothing calls the marking models.
    const db = adminClient()!;
    const { data: attempts } = await db
      .from("attempts")
      .select("id,user_id,position,question:questions(stem)")
      .eq("session_id", id)
      .order("position");
    const [first, ...rest] = attempts!;
    attemptId = first.id;
    stem = (first.question as unknown as { stem: string }).stem;
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
        check_status: "agreed",
        answer_text: answer,
        mark: 2,
        max_marks: 4,
        marked_at: new Date().toISOString(),
        marked_by_model: "e2e-seed",
        feedback: { comments, justification: "Seeded by the E2E run." },
      })
      .eq("id", first.id);
    const finished = await db
      .from("sessions")
      .update({ finished_at: new Date().toISOString(), score: 2, max_score: 4 })
      .eq("id", id);
    const review = await db
      .from("mark_reviews")
      .insert({
        attempt_id: first.id,
        user_id: first.user_id,
        reason: "spot_check",
        ai_mark: 2,
        ai_model: "e2e-seed",
        check_mark: 3,
        check_notes: "Seeded by the E2E run.",
      })
      .select("id")
      .single();
    expect([skipped.error, marked.error, finished.error, review.error]).toEqual(
      [null, null, null, null],
    );
    reviewId = review.data!.id;
  });

  test("the queue lists the review under Open with its reason and stem", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin/marking/review");
    await expect(
      page
        .getByRole("navigation", { name: "Review queues" })
        .getByRole("link", { name: /^Open \(\d+\)$/ }),
    ).toHaveAttribute("aria-current", "page");
    const row = page
      .getByRole("row")
      .filter({ has: page.locator(`a[href="${editor()}"]`) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Spot check");
    await expect(row).toContainText(stem.slice(0, 60));
    if (stem.length > 60) await expect(row).toContainText("…");
    await expect(row.getByRole("cell").nth(4)).toHaveText("2");
    await expect(row.getByRole("cell").nth(5)).toHaveText("3");
    await expect(row.getByRole("cell").nth(6)).toHaveText("1");
  });

  test("queue and editor fit a 390px phone without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAdmin(page);
    await page.goto("/admin/marking/review");
    await expect(
      page.getByRole("heading", { name: "Marking review" }),
    ).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await page.goto(editor());
    const mark = page.getByRole("spinbutton", { name: "Final mark" });
    await expect(mark).toHaveValue("2");
    await expect(mark).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Increase mark/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Decrease mark/ }),
    ).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });

  test("keys move the mark, edits are summarised and undone, ⌘Enter resolves", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto(editor());
    const mark = page.getByRole("spinbutton", { name: "Final mark" });
    await expect(mark).toHaveValue("2");
    await expect(page.getByText("Spot check", { exact: true })).toBeVisible();
    const band = page
      .getByRole("group")
      .filter({ has: mark })
      .locator("p")
      .first();
    const bandAt2 = await band.textContent();
    expect(bandAt2).toMatch(/^(Band: .+ marks?|No band satisfied)$/);
    // Retry the first key until the client has hydrated.
    await expect(async () => {
      await page.keyboard.press("c");
      await expect(mark).toHaveValue("3", { timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await page.keyboard.press("a");
    await expect(mark).toHaveValue("2");
    await page.keyboard.press("ArrowUp");
    await expect(mark).toHaveValue("3");
    await page.keyboard.press("ArrowDown");
    await expect(mark).toHaveValue("2");
    await expect(band).toHaveText(bandAt2!);
    await page.keyboard.press("c");
    await expect(mark).toHaveValue("3");
    await expect(band).toHaveText(/^(Band: .+ marks?|No band satisfied)$/);
    await expect(page.getByText("Mark 2 → 3", { exact: true })).toBeVisible();

    const bodies = page.getByRole("textbox", { name: "Comment" });
    await expect(bodies).toHaveCount(3);
    await bodies.first().fill("Give the latest CPI figure.");
    const summary = page.getByText(/^Mark 2 → 3/);
    await expect(summary).toHaveText("Mark 2 → 3 · 1 comment edited");
    // Comments are numbered by position in the answer; 2 is the strength.
    const deleteSecond = page.getByRole("button", {
      name: "Delete comment 2",
    });
    const deleted = "Mark 2 → 3 · 1 comment edited · 1 deleted";
    await deleteSecond.click();
    await expect(summary).toHaveText(deleted);
    await expect(bodies).toHaveCount(2);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(summary).toHaveText("Mark 2 → 3 · 1 comment edited");
    await expect(bodies).toHaveCount(3);
    // The delete toast's Undo restores the comment too (keeping the body edit).
    await deleteSecond.click();
    await expect(summary).toHaveText(deleted);
    await page
      .locator('[data-sonner-toast][data-front="true"]')
      .getByRole("button", { name: "Undo" })
      .click();
    await expect(summary).toHaveText("Mark 2 → 3 · 1 comment edited");
    await expect(bodies).toHaveCount(3);
    await expect(bodies.first()).toHaveValue("Give the latest CPI figure.");
    await deleteSecond.click();
    await expect(summary).toHaveText(deleted);
    await page.getByLabel(/Admin note/).fill("Resolved by the E2E run.");

    const markCalls: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/.*\/mark$/.test(r.url())) markCalls.push(r.url());
    });
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page).toHaveURL(/notice=Resolved/, { timeout: 30000 });
    // Shown as a toast on the next review (or the queue when none is left).
    await expect(page.getByText("Resolved. Next review")).toBeVisible();
    expect(markCalls).toEqual([]);

    const db = adminClient()!;
    const { data: attempt } = await db
      .from("attempts")
      .select("mark,marked_by_model,check_status,feedback")
      .eq("id", attemptId)
      .single();
    expect(attempt).toMatchObject({
      mark: 3,
      marked_by_model: "admin",
      check_status: "reviewed",
    });
    const saved = (attempt!.feedback as { comments: { body: string }[] })
      .comments;
    expect(saved.map((c) => c.body)).toEqual([
      "Give the latest CPI figure.",
      "End with a one-line judgement.",
    ]);
    const { data: review } = await db
      .from("mark_reviews")
      .select("status,final_mark,admin_note,resolved_by,resolved_at")
      .eq("id", reviewId)
      .single();
    expect(review).toMatchObject({
      status: "resolved",
      final_mark: 3,
      admin_note: "Resolved by the E2E run.",
    });
    expect(review!.resolved_by).toBeTruthy();
    expect(review!.resolved_at).toBeTruthy();
    const { data: example } = await db
      .from("marking_examples")
      .select("tutor_mark,origin,rejected_ai_comments")
      .eq(
        "source_hash",
        createHash("sha256")
          .update(`admin_override:${attemptId}`)
          .digest("hex"),
      )
      .single();
    expect(example).toMatchObject({ tutor_mark: 3, origin: "admin_override" });
    expect(
      (example!.rejected_ai_comments as { body: string }[]).map((c) => c.body),
    ).toEqual([
      "Give a CPI figure.",
      "Correct cause of demand-pull inflation.",
    ]);
  });

  test("a resolved review reopens read-only with who and when", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto(editor());
    await expect(page.getByRole("status")).toContainText(
      /^Resolved by .+ · \d{1,2} \w{3} \d{4} at \d{1,2}:\d{2}/,
    );
    const mark = page.getByRole("spinbutton", { name: "Final mark" });
    await expect(mark).toHaveValue("3");
    await expect(mark).toBeDisabled();
    await expect(page.getByRole("button", { name: /Resolve/ })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Comment" })).toHaveCount(0);
    await expect(
      page.getByText("Give the latest CPI figure.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(/Admin note/)).toBeDisabled();
    await page.keyboard.press("c");
    await expect(mark).toHaveValue("3");
  });
});
