import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Student progress (read only)", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/student/progress");
    await expect(
      page.getByRole("heading", { level: 1, name: "Progress" }),
    ).toBeVisible();
    await expect(page.getByTestId("progress-stats")).toBeVisible();
  });
  test("range changes the URL and the card snapshot", async ({ page }) => {
    for (const [value, label] of [
      ["30", "30 days"],
      ["year", "This year"],
      ["all", "All time"],
      ["90", "90 days"],
    ]) {
      await expect(async () => {
        if (new URL(page.url()).searchParams.get("range") !== value) {
          const option = page.getByRole("option", { name: label, exact: true });
          if (!(await option.isVisible()))
            await page
              .getByRole("combobox", { name: "Progress range" })
              .click();
          await option.click();
        }
        await expect(page).toHaveURL(new RegExp(`[?&]range=${value}(?:&|$)`), {
          timeout: 1000,
        });
        await expect(page.getByTestId("progress-stats")).toHaveAttribute(
          "data-range",
          value,
          { timeout: 1000 },
        );
        await expect(
          page.getByTestId("progress-stats").getByText(label, { exact: true }),
        ).toBeVisible();
      }).toPass({ timeout: 20000 });
    }
  });
  test("practice and review links open existing setups without starting work", async ({
    page,
  }) => {
    await page.goto("/student/progress?range=all");
    await expect(page.getByTestId("progress-stats")).toHaveAttribute(
      "data-range",
      "all",
    );
    const practice = page.getByRole("link", { name: /^(Practise|Start) / });
    await expect(practice.first()).toBeVisible();
    for (const link of await practice.all()) {
      const target = new URL((await link.getAttribute("href"))!, page.url());
      expect(target.pathname).toBe("/student/sprint");
      expect(target.searchParams.has("topics")).toBe(true);
    }
    const weak = page.getByRole("link", { name: "Practise", exact: true });
    for (const link of await weak.all()) {
      const target = new URL((await link.getAttribute("href"))!, page.url());
      expect(target.pathname).toBe("/student/sprint");
      expect(
        target.searchParams.get("history") === "mistakes" ||
          target.searchParams.has("verb"),
      ).toBe(true);
    }
    for (const link of await page
      .getByRole("link", { name: "Review cards", exact: true })
      .all()) {
      const target = new URL((await link.getAttribute("href"))!, page.url());
      expect(target.pathname).toBe("/student/flashcards");
      expect([...target.searchParams.keys()]).toEqual(["topic"]);
      expect(target.searchParams.has("topic")).toBe(true);
    }
    const target = new URL(
      (await practice.first().getAttribute("href"))!,
      page.url(),
    );
    await practice.first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Topic Sprint" }),
    ).toBeVisible();
    await expect(async () => {
      const config = JSON.parse(
        await page.locator('form input[name="config"]').first().inputValue(),
      );
      expect(config.topics).toContain(target.searchParams.get("topics"));
      if (target.searchParams.has("sub"))
        expect(config.subtopics).toContain(target.searchParams.get("sub"));
    }).toPass({ timeout: 20000 });
    // The Start button is deliberately never pressed: no sessions or AI calls.
  });
  test("history chips survive hydration and preserve the range", async ({
    page,
  }) => {
    await expect(async () => {
      if (new URL(page.url()).searchParams.get("kind") !== "sprint")
        await page
          .getByRole("button", { name: "Sprints", exact: true })
          .click();
      await expect(page).toHaveURL(/[?&]kind=sprint(?:&|$)/, { timeout: 1000 });
      await expect(
        page.getByRole("button", { name: "Sprints", exact: true }),
      ).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await expect(async () => {
      if (new URL(page.url()).searchParams.get("type") !== "short")
        await page.getByRole("button", { name: "Short", exact: true }).click();
      const url = new URL(page.url());
      expect(url.searchParams.get("kind")).toBe("sprint");
      expect(url.searchParams.get("type")).toBe("short");
      await expect(
        page.getByRole("button", { name: "Short", exact: true }),
      ).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass({ timeout: 20000 });
  });
  test("400px has no page overflow, including expanded topics", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 850 });
    const parent = page
      .locator('table[aria-label="Marks by topic"] button[aria-expanded]')
      .first();
    await expect(async () => {
      if ((await parent.getAttribute("aria-expanded")) === "false")
        await parent.click();
      await expect(parent).toHaveAttribute("aria-expanded", "true", {
        timeout: 1000,
      });
    }).toPass({ timeout: 20000 });
    await expect(async () => {
      const sizes = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
    }).toPass({ timeout: 20000 });
  });
});
