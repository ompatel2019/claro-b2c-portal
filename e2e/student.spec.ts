import { test, expect } from "@playwright/test";
import path from "node:path";
test.describe.configure({ mode: "serial" });
import { signIn, start, finish, cleanupSessions, pick } from "./helpers";
test.describe("Student practice", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a real student account",
  );
  test.describe.configure({ mode: "serial" });
  const ids: string[] = [];
  let finishedId = "";
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  test("sign in, dashboard and sign out", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in(\?|$)/);
  });
  test("multiple choice sprint, flag and results", async ({ page }) => {
    finishedId = await start(page, "Multiple choice", ids);
    const nav = page.getByRole("navigation", { name: "Question booklet" });
    const count = await nav.getByRole("button").count();
    const flag = page.getByRole("button", {
      name: "Flag for review",
      exact: true,
    });
    await expect(flag).toHaveAttribute("aria-pressed", "false");
    await flag.click();
    await expect(flag).toHaveAttribute("aria-pressed", "true");
    for (let i = 0; i < count; i++) {
      await pick(page, "A");
      if (i < count - 1)
        await page.getByRole("button", { name: "Next question" }).click();
    }
    await finish(page);
    await expect(
      page.getByRole("heading", { name: /sprint · / }),
    ).toBeVisible();
    await expect(page.getByText("Score", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/^Your answer: A · Correct: [ABCD]$/).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Your answer", { exact: true }).first(),
    ).toBeVisible();
  });
  test("exit and resume at the first unanswered question", async ({ page }) => {
    const id = await start(page, "Multiple choice", ids);
    await pick(page, "A");
    await page
      .getByRole("button", { name: "Save and exit", exact: true })
      .click();
    await expect(page).toHaveURL(/\/student$/);
    await page.locator(`a[href="/student/sprint/${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/student/sprint/${id}$`));
    await expect(page.getByText(/^Q 2 of \d+$/)).toBeVisible();
    await page.getByRole("button", { name: "Previous question" }).click();
    await expect(page.getByRole("radio", { name: /^Option A:/ })).toBeChecked();
  });
  test("activity mode filter links to the finished sprint", async ({
    page,
  }) => {
    await page.goto("/activity");
    await page.getByRole("combobox", { name: /^Mode/ }).selectOption("mcq");
    await expect(page).toHaveURL(/mode=mcq/);
    await page
      .locator(`a[href="/student/sprint/${finishedId}/results"]`)
      .click();
    await expect(
      page.getByRole("heading", { name: /sprint · / }),
    ).toBeVisible();
  });
});

test.describe("AI backed written practice", () => {
  test.skip(
    !process.env.E2E_AI || !process.env.STUDENT_EMAIL,
    "Calls OpenAI: set E2E_AI=1 with a real student account",
  );
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180000);
  const ids: string[] = [];
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test("typed answer is marked with a band and highlighted comments", async ({
    page,
  }) => {
    await start(page, "Short answer", ids);
    await page
      .getByRole("textbox", { name: "Your answer" })
      .fill(
        "Demand-pull inflation occurs when aggregate demand rises faster than the economy’s productive capacity. Higher household consumption, investment or government spending increases competition for scarce goods and services, pushing up the general price level. Inflation reduces the purchasing power of households on fixed incomes, lowering their real income. It can also reduce international competitiveness as Australian export prices rise relative to overseas goods, weakening export demand and worsening the current account balance.",
      );
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      page.getByText("Submitted, marking in the background", { exact: true }),
    ).toBeVisible();
    await finish(page);
    await expect(page.getByText(/^Band:/)).toBeVisible({ timeout: 90000 });
    await expect(page.locator("mark").first()).toBeVisible();
    await expect(page.getByText("How to reach full marks")).toBeVisible();
  });
  test("photo transcription can be edited and confirmed without grading", async ({
    page,
  }) => {
    await start(page, "Short answer", ids);
    await page
      .getByLabel("Upload a photo", { exact: true })
      .setInputFiles(path.join(process.cwd(), "e2e/fixtures/answer.jpg"));
    const transcript = page.getByRole("textbox", {
      name: "Check your transcript",
    });
    await expect(transcript).toBeVisible({ timeout: 90000 });
    await expect(transcript).not.toHaveValue("");
    await transcript.fill(
      (await transcript.inputValue()) + "\nHigher demand pushes prices up.",
    );
    await page
      .getByRole("button", { name: "Confirm transcript", exact: true })
      .click();
    await expect(page.getByText("Transcript confirmed.")).toBeVisible();
    await page
      .getByRole("button", { name: "Save and exit", exact: true })
      .click();
    await expect(page).toHaveURL(/\/student$/);
  });
});
