import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Sign-in is the only permitted action. After it, browsing cannot make writes or AI calls.
test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      !["GET", "HEAD"].includes(request.method()) ||
      /\/api\/.*(?:mark|transcribe|finish)/.test(
        new URL(request.url()).pathname,
      )
    ) {
      await route.abort();
      throw new Error(
        `Read-only activity spec blocked ${request.method()} ${request.url()}`,
      );
    }
    await route.continue();
  });
});

test.describe("Activity heatmap", () => {
  test("home shows a year of activity with streaks; a day links to Activity", async ({
    page,
  }) => {
    await expect(
      page.getByText(
        /^Current streak \d+ days? · Longest \d+ days? · \d+ active days? in the last year$/,
      ),
    ).toBeVisible();
    const grid = page.getByRole("group", {
      name: "Activity over the last year",
    });
    const today = grid.locator("a[tabindex='0']");
    await expect(today).toHaveCount(1);
    expect(await grid.locator("a").count()).toBeGreaterThan(364);
    await expect(async () => {
      await today.focus();
      await expect(page.getByRole("tooltip")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.keyboard.press("ArrowUp");
    const day = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-day"),
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/student/activity\\?date=${day}$`),
    );
    await expect(
      page.getByRole("button", { name: "Remove day filter" }),
    ).toBeVisible();
  });

  test("at 400px the legend clears the floating feedback button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    const more = page.getByText(/^Less\s*More$/);
    // Worst case: the legend sits on the bottom edge, next to the button.
    await more.evaluate((el) => el.scrollIntoView({ block: "end" }));
    const a = (await more.boundingBox())!;
    const b = (await page
      .getByRole("button", { name: "Feedback", exact: true })
      .boundingBox())!;
    const overlap =
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    expect(overlap).toBe(false);
  });
});

// Browsing only: no session starts, writes, marking calls or cleanup.
test.describe("Activity browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/student/activity");
    await expect(
      page.getByRole("heading", { name: "Your activity", exact: true }),
    ).toBeVisible();
  });
  test("filters update the URL and show matching rows or a filtered empty state", async ({
    page,
  }) => {
    await expect(async () => {
      await page.getByRole("button", { name: /^Sprints ·/ }).click();
      await expect(page).toHaveURL(/kind=sprint/, { timeout: 1000 });
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Status", { exact: true }).selectOption("progress");
      await expect(page).toHaveURL(/status=progress/, { timeout: 1000 });
    }).toPass();
    await expect(
      page
        .getByRole("table", { name: "Your activity" })
        .or(page.getByText("No sessions match"))
        .or(page.getByText("Nothing here yet")),
    ).toBeVisible();
    const rows = page.locator("table tbody tr");
    expect(await rows.count()).toBeLessThanOrEqual(20);
    const titles = await rows
      .locator("td:nth-child(2) a:first-child")
      .allTextContents();
    expect(titles.every((t) => t.toLowerCase().includes("sprint"))).toBe(true);
    await expect(async () => {
      await page
        .getByLabel("Search", { exact: true })
        .fill("__no_matching_session_128f__");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(page).toHaveURL(/q=__no_matching_session_128f__/, {
        timeout: 1000,
      });
    }).toPass();
    await expect(
      page
        .getByText("No sessions match")
        .or(page.getByText("Nothing here yet")),
    ).toBeVisible();
  });
  test("row title links to the existing session report", async ({ page }) => {
    await expect(async () => {
      await page.getByLabel("Status", { exact: true }).selectOption("finished");
      await expect(page).toHaveURL(/status=finished/, { timeout: 1000 });
    }).toPass();
    await expect(
      page
        .getByRole("table", { name: "Your activity" })
        .or(page.getByText("No sessions match"))
        .or(page.getByText("Nothing here yet")),
    ).toBeVisible();
    const row = page.locator("table tbody td a[href]").first();
    test.skip((await row.count()) === 0, "No existing reports to view");
    const href = await row.getAttribute("href");
    expect(href).toMatch(
      /^\/student\/(?:sprint\/[^/]+\/results|papers\/[^/]+\/results\?sit=[^/]+|flashcards\/[^/]+)$/,
    );
    await row.click();
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
    await expect(page.getByText("This page could not be found.")).toHaveCount(
      0,
    );
  });
  for (const width of [360, 400, 1440]) {
    test(`at ${width}px the page has no horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await expect(async () => {
        await expect(page.getByLabel("Status", { exact: true })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }).toPass();
    });
  }
  test("date, topic, sort and Clear keep URL state", async ({ page }) => {
    await expect(async () => {
      await page.getByLabel("Date", { exact: true }).selectOption("7");
      await expect(page).toHaveURL(/range=7/, { timeout: 1000 });
    }).toPass();
    const options = page
      .getByLabel("Topic", { exact: true })
      .locator('option[value]:not([value=""])');
    const topic = (await options.count())
      ? await options.first().getAttribute("value")
      : null;
    if (topic) {
      await expect(async () => {
        await page.getByLabel("Topic", { exact: true }).selectOption(topic);
        await expect(page).toHaveURL(
          new RegExp(`topic=${encodeURIComponent(topic)}`),
          { timeout: 1000 },
        );
      }).toPass();
    }
    await expect(async () => {
      await page.getByLabel("Sort", { exact: true }).selectOption("highest");
      await expect(page).toHaveURL(/sort=highest/, { timeout: 1000 });
    }).toPass();
    await page.getByRole("link", { name: /^Clear \(/ }).click();
    await expect(page).toHaveURL(/\/student\/activity$/);
  });
});
