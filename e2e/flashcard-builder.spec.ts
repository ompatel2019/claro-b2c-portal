import { expect, test } from "@playwright/test";
import {
  cleanupSessions,
  expectNoOverlap,
  expectStackedBelow,
  signIn,
} from "./helpers";

test.describe("Flashcard deck builder", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Needs a student account",
  );
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("400px builder controls clear feedback and the sticky summary at page end", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto("/student/flashcards?topic=t3");
    await page.getByRole("button", { name: "Study", exact: true }).click();
    const start = page.getByRole("button", { name: "Start", exact: true });
    const bar = page.locator("form").filter({ has: start });
    await expect(bar).toContainText("Economic Issues · Study");
    await expect(
      page.locator('button.fixed[aria-label="Feedback"]'),
    ).toBeHidden();
    await expect(
      page
        .locator("header")
        .getByRole("button", { name: "Feedback", exact: true }),
    ).toBeVisible();

    // An unrelated Continue banner is allowed; do not finish or delete its session.
    const resume = page.getByRole("link", { name: "Continue", exact: true });
    if (await resume.count()) {
      const text = page.getByText(/^You have an unfinished/);
      await expectStackedBelow(text, resume);
    }

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const last = page.locator("label").filter({
      has: page.getByRole("switch", { name: "Repeat missed cards" }),
    });
    await expect(last).toBeInViewport({ ratio: 1 });
    await expectNoOverlap(bar, last);
    await expect(start).toBeInViewport({ ratio: 1 });
  });

  test("header, due strip and all builder controls render; a subtopic updates the count", async ({
    page,
  }) => {
    await page.goto("/student/flashcards?topic=t3");
    await expect(
      page.locator("form").filter({
        has: page.getByRole("button", { name: "Start", exact: true }),
      }),
    ).toContainText("Economic Issues · Study");
    await expect(
      page.getByRole("heading", { name: "Flashcards", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/^(\d+ cards? due today · \d+ tomorrow|Nothing due\.)/),
    ).toBeVisible();
    for (const name of [
      "Mode",
      "Card type",
      "Source",
      "Topics",
      "Which cards",
      "Deck size",
      "Order",
    ]) {
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("switch", { name: "Repeat missed cards" }),
    ).toBeChecked();
    const count = page.getByText(/^\d+ of \d+ cards?$/);
    const before = await count.innerText();
    const subs = page.getByRole("group", { name: "Economic Issues subtopics" });
    await subs.getByRole("button", { name: /^Inflation · \d+$/ }).click();
    await expect(count).not.toHaveText(before);
    await expect(
      page.locator("form").filter({
        has: page.getByRole("button", { name: "Start", exact: true }),
      }),
    ).toContainText("Inflation · Study");
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Answer by", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Custom deck size" })
      .fill("999");
    await page.getByRole("spinbutton", { name: "Custom deck size" }).blur();
    await expect(
      page.getByRole("spinbutton", { name: "Custom deck size" }),
    ).toHaveValue("200");
    const text = await count.innerText();
    const [actual, available] = text.match(/\d+/g)!.map(Number);
    expect(actual).toBe(Math.min(200, available));
    // The saved setup restores when there is no URL prefill.
    await page.goto("/student/flashcards");
    await expect(count).toHaveText(text);
  });

  test("zero matches disables Start and Include all topics fixes the selection", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        "claro.flashcards.v1",
        JSON.stringify({
          mode: "study",
          topics: ["t3"],
          subtopics: ["t3-no-such-subtopic"],
        }),
      ),
    );
    await page.goto("/student/flashcards");
    await expect(
      page.getByText("No cards match", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Include all topics", exact: true })
      .click();
    await expect(page.getByText("No cards match", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Start", exact: true }),
    ).toBeEnabled();
  });

  test("starts a Study deck and keeps the session route", async ({ page }) => {
    await page.goto("/student/flashcards?topic=t3-inflation");
    await expect(
      page.locator("form").filter({
        has: page.getByRole("button", { name: "Start", exact: true }),
      }),
    ).toContainText("Inflation · Study");
    await page.getByRole("button", { name: "Study", exact: true }).click();
    await page.getByRole("button", { name: "10", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Start", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "10", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Control+Enter");
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/);
    ids.push(page.url().split("/").at(-1)!);
    await expect(page.getByText(/^Card 1 of \d+$/)).toBeVisible();
  });

  test("the old setup route redirects", async ({ page }) => {
    await page.goto("/flashcards");
    await expect(page).toHaveURL(/\/student\/flashcards$/);
    await expect(
      page.getByRole("heading", { name: "Flashcards", exact: true }),
    ).toBeVisible();
  });
});
