import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Student home", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("greeting, KPIs, heatmap and the side cards", async ({ page }) => {
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening)(, \S+)?$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} [A-Z][a-z]+$/,
      ),
    ).toBeVisible();
    for (const label of [
      "Questions this week",
      "Average mark",
      "Streak",
      "Flashcards due",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText(/^vs \d+ last week$/)).toBeVisible();
    await expect(page.getByText(/^Longest \d+$/)).toBeVisible();
    await expect(page.getByText(/^\d+ more tomorrow$/)).toBeVisible();
    await expect(page.getByText(/^Less\s*More$/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent activity" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "See all" })).toHaveAttribute(
      "href",
      "/activity",
    );
    await expect(
      page.getByRole("heading", { name: "Weak topics" }),
    ).toBeVisible();
    // Either resume cards or one-click quick starts, never neither.
    const resume = page.getByRole("heading", {
      name: "Continue where you left off",
    });
    const quick = page.getByRole("heading", { name: "Quick start" });
    await expect(resume.or(quick)).toBeVisible();
    if (await quick.isVisible())
      await expect(
        page.getByRole("button", { name: "20 MC questions · 20 min" }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("link", { name: "Continue" }).first(),
      ).toHaveAttribute(
        "href",
        /^\/student\/(sprint|flashcards)\/[0-9a-f-]{36}$/,
      );
  });

  test("score trend switches range", async ({ page }) => {
    const chart = page.locator("svg[data-range]");
    const heading = page.getByRole("heading", { name: "Score trend" });
    const empty = page.getByText("Finish a sprint to see your trend.");
    await expect(heading.or(empty)).toBeVisible();
    if (await empty.isVisible()) return;
    const sparse = page.getByText(
      /^(No marked work in this range\.|Mark work on at least 3 days to see a trend\.)$/,
    );
    await expect(chart.or(sparse)).toBeVisible();
    await page.getByRole("combobox", { name: "Range" }).click();
    await page.getByRole("option", { name: "All time" }).click();
    await expect(
      page.locator('svg[data-range="all"]').or(sparse),
    ).toBeVisible();
    await expect(page.getByTestId("previous-period")).toHaveCount(0);
  });

  test("S starts a sprint and / redirects home", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(async () => {
      if (!page.url().includes("/student/sprint"))
        await page.keyboard.press("s");
      await expect(page).toHaveURL(/\/student\/sprint$/, { timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await page.goto("/");
    await expect(page).toHaveURL(/\/student$/);
  });
});
