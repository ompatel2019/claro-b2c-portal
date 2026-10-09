import { expect, test } from "@playwright/test";
import { cleanupSessions, signIn, start } from "./helpers";

test.describe("Session shell", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });

  test("keyboard, booklet, calculator and the finish dialog", async ({
    page,
  }) => {
    await signIn(page);
    await start(page, "Multiple choice", ids);
    await expect(page.getByText(/^Q 1 of \d+$/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Time remaining/ }),
    ).toBeVisible();
    // Keys: B picks option B on multiple choice, F to flag, K for next question.
    await page.keyboard.press("b");
    await expect(page.getByRole("radio", { name: /^Option B:/ })).toBeChecked();
    await page.keyboard.press("f");
    await expect(
      page.getByRole("button", { name: "Flag for review", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.keyboard.press("k");
    await expect(page.getByText(/^Q 2 of/)).toBeVisible();
    await page.keyboard.press("2");
    await expect(page.getByRole("radio", { name: /^Option B:/ })).toBeChecked();
    // Clicking the chosen card again clears it.
    await page
      .locator("label", {
        has: page.getByRole("radio", { name: /^Option B:/ }),
      })
      .click();
    await expect(
      page.getByRole("radio", { name: /^Option B:/ }),
    ).not.toBeChecked();
    await page.keyboard.press("j");
    await expect(page.getByText(/^Q 1 of/)).toBeVisible();

    const booklet = page.getByRole("navigation", { name: "Question booklet" });
    await expect(
      booklet.getByRole("button", { name: "Question 1: Answered, Flagged" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Flagged", exact: true }).click();
    await expect(booklet.getByRole("button")).toHaveCount(1);
    await page.getByRole("button", { name: "All", exact: true }).click();

    // On multiple choice, C picks option C; the button opens the calculator.
    await page.getByRole("button", { name: "Calculator (C)" }).click();
    const calc = page.getByRole("dialog", { name: "Calculator" });
    await expect(calc).toBeVisible();
    await page.keyboard.type("2+3*4");
    await page.keyboard.press("Enter");
    await expect(calc.getByLabel("Calculator display")).toHaveText("14");
    await page.keyboard.press("Escape");
    await expect(calc).toHaveCount(0);

    await page.keyboard.press("?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page
      .getByRole("button", { name: "Finish", exact: true })
      .first()
      .click();
    const finish = page.getByRole("dialog", { name: "Finish and mark?" });
    await expect(finish.getByText(/1 of \d+ answered/)).toBeVisible();
    await expect(finish.getByText(/^Flagged: Q1$/)).toBeVisible();
    await finish.getByRole("button", { name: "Q2" }).first().click();
    await expect(page.getByText(/^Q 2 of/)).toBeVisible();
  });

  test("typed answers show a word count against the marks", async ({
    page,
  }) => {
    await signIn(page);
    await start(page, "Short answer", ids);
    const box = page.getByRole("textbox", { name: "Your answer" });
    await box.fill("Inflation rose because demand grew.");
    await expect(
      page.getByText(/^5 words · aim for about \d+–\d+$/),
    ).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });
});
