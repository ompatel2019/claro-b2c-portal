import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Mark my answer form — no AI or writes", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Needs a student account",
  );
  test.beforeEach(async ({ page }) => {
    // Guardrails: these tests must never create sessions, mark or transcribe.
    await page.route("**/api/attempts/**", (route) => {
      throw new Error(`Forbidden AI request: ${route.request().url()}`);
    });
    await page.route(
      /\/student\/(?:mark|activity\/[^/?]+)(?:\?|$)/,
      async (route) => {
        if (route.request().method() !== "GET")
          throw new Error("Form tests must not invoke server actions");
        await route.continue();
      },
    );
    await signIn(page);
    await page.goto("/student/mark");
  });
  test("toggles answer format and validates an own question, auto-filling its verb", async ({
    page,
  }) => {
    const submit = page.getByRole("button", {
      name: "Mark my answer",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await expect(async () => {
      await page
        .getByRole("button", { name: "My own question", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: /Question text/ }),
      ).toBeVisible();
    }).toPass();
    await expect(async () => {
      await page
        .getByRole("textbox", { name: /Question text/ })
        .fill("Explain");
      await page.getByRole("textbox", { name: /Question text/ }).blur();
      await expect(
        page.getByText("Use at least 10 characters for your question."),
      ).toBeVisible();
    }).toPass();
    await expect(async () => {
      await page
        .getByRole("textbox", { name: /Question text/ })
        .fill("Evaluate the effectiveness of monetary policy.");
      await expect(
        page.getByRole("combobox", { name: "Directive verb" }),
      ).toContainText("Evaluate");
    }).toPass();
    await expect(async () => {
      await page.getByRole("button", { name: "Photo", exact: true }).click();
      await expect(page.getByLabel("Take photo / Upload")).toBeVisible();
    }).toPass();
    await expect(async () => {
      await page.getByRole("button", { name: "Type", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Your answer" }),
      ).toBeVisible();
    }).toPass();
    await expect(submit).toBeDisabled();
  });
  test("bank search shows selectable results and an empty search state", async ({
    page,
  }) => {
    await expect(async () => {
      await page.getByLabel("Search questions").fill("inflation");
      await expect(
        page.getByRole("option", { name: /inflation/i }).first(),
      ).toBeVisible();
    }).toPass();
    await expect(async () => {
      await page
        .getByRole("option", { name: /inflation/i })
        .first()
        .click();
      await expect(
        page.getByText(/Selected question · \d+ marks/),
      ).toBeVisible();
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Search questions").fill("no-such-question-zzzz");
      await expect(page.getByText(/No questions match/)).toBeVisible();
    }).toPass();
  });
});
