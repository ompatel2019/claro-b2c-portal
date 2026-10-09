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
    await expect(
      page.getByRole("combobox", { name: "Progress range" }),
    ).toBeEnabled();
  });
  test("range changes the URL and the card snapshot", async ({ page }) => {
    for (const [value, label] of [
      ["30", "30 days"],
      ["year", "This year"],
      ["all", "All time"],
      ["90", "90 days"],
    ]) {
      const control = page.getByRole("combobox", { name: "Progress range" });
      await expect(control).toBeEnabled();
      await expect(async () => {
        if (new URL(page.url()).searchParams.get("range") !== value) {
          const option = page.getByRole("option", { name: label, exact: true });
          if (!(await option.isVisible())) await control.click();
          await option.click();
        }
        await expect(page).toHaveURL(new RegExp(`[?&]range=${value}(?:&|$)`), {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      // URL changes can precede the streamed cards and transition completion.
      await expect(page.getByTestId("progress-stats")).toHaveAttribute(
        "data-range",
        value,
      );
      await expect(
        page.getByTestId("progress-stats").getByText(label, { exact: true }),
      ).toBeVisible();
      await expect(control).toBeEnabled();
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
  for (const width of [360, 400, 1280]) {
    test(`${width}px keeps the heatmap and topic tables within their containers`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      const heatmap = page.getByTestId("activity-heatmap");
      await expect(heatmap).toHaveCount(1);
      await expect(heatmap).toBeVisible();
      await expect
        .poll(() =>
          heatmap.evaluate(
            (el) => el.scrollWidth <= el.clientWidth && el.scrollLeft === 0,
          ),
        )
        .toBe(true);
      const months = heatmap.locator("[data-month-label]");
      await expect(months.first()).toBeVisible();
      await expect(heatmap.getByRole("group")).toHaveAccessibleName(
        /^Activity from \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/,
      );
      const latest = heatmap.locator("a[data-day]").last();
      await expect(async () => {
        await latest.focus();
        await expect(heatmap.getByRole("tooltip")).toBeVisible({
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      await expect
        .poll(() => heatmap.evaluate((el) => el.scrollWidth <= el.clientWidth))
        .toBe(true);
      await latest.blur();
      await expect
        .poll(() =>
          months.evaluateAll((labels) =>
            labels.every((label) => {
              const bounds = label
                .closest('[data-testid="activity-heatmap"]')!
                .getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(label);
              const text = range.getBoundingClientRect();
              return (
                label.textContent?.length === 3 &&
                text.left >= bounds.left &&
                text.right <= bounds.right
              );
            }),
          ),
        )
        .toBe(true);
      const table = page.getByRole("table", {
        name: "Marks by topic",
        exact: true,
      });
      const parent = table.locator("button[aria-expanded]").first();
      await expect(async () => {
        if ((await parent.getAttribute("aria-expanded")) === "false")
          await parent.click();
        await expect(parent).toHaveAttribute("aria-expanded", "true", {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      const tables = page.locator(
        'table[aria-label="Marks by topic"], table[aria-label$=" subtopics"]',
      );
      await expect(tables).toHaveCount(2);
      await expect
        .poll(() =>
          tables.evaluateAll((tables) =>
            tables.every((table) => {
              const container = table.closest('[data-slot="table-container"]')!;
              return container.scrollWidth <= container.clientWidth;
            }),
          ),
        )
        .toBe(true);
      for (const topicTable of await tables.all()) {
        const percent = topicTable
          .locator(":scope > thead")
          .getByRole("columnheader", { name: "%", exact: true });
        await expect(percent).toHaveCount(1);
        await expect(percent).toBeVisible();
      }
      if (width < 640) {
        await expect(
          table.getByText(/answered · .* marks · Last practised/).first(),
        ).toBeVisible();
      }
      const action = table
        .getByRole("link", { name: /^(Practise|Start) / })
        .first();
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    });
  }
});
