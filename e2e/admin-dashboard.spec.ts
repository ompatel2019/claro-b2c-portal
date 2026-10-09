import { expect, test } from "@playwright/test";
import { signInAdmin } from "./helpers";

test.describe("Admin dashboard", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test.setTimeout(120000);

  test("KPIs, charts, needs attention and the latest sessions", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 60000 });
    for (const label of [
      "Active students, 7 days",
      "Sessions, 7 days",
      "Open reviews",
      "Spend this month",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText(/^vs \d+ previous 7$/)).toBeVisible();
    await expect(page.getByText(/^\$\d+\.\d\d of \$100$/)).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "All-time spend against cap" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Sessions per day, last 30 days" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "AI spend per day, last 30 days" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Needs attention" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Latest finished sessions" }),
    ).toBeVisible();
    // Either rows that open a student's report, or the empty install state.
    const table = page.getByRole("table", { name: "Latest finished sessions" });
    const empty = page.getByText(
      /^(No students yet|No finished sessions yet)$/,
    );
    await expect(table.or(empty)).toBeVisible();
    if (await table.isVisible()) {
      expect(await table.getByRole("row").count()).toBeLessThanOrEqual(11);
      const first = table.getByRole("link").first();
      await expect(first).toHaveAttribute(
        "href",
        /^\/admin\/students\/[0-9a-f-]{36}#session-[0-9a-f-]{36}$/,
      );
      await expect(
        table.getByText(/ago$|^just now$|^\d+ [A-Z][a-z]+ \d{4}$/).first(),
      ).toBeVisible();
    }
    // Each plotted day is also readable without a mouse.
    for (const title of ["Sessions per day", "AI spend per day"]) {
      await expect(
        page.getByRole("combobox", { name: `${title} day` }),
      ).toHaveValue(/\d{4}-\d{2}-\d{2}/);
    }
    // Sidebar follows the §1 admin navigation.
    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    for (const name of [
      "Dashboard",
      "All students",
      "Questions",
      "Flashcards",
      "Papers",
      "Review queue",
      "Accuracy",
      "Inbox",
      "AI spend",
    ])
      await expect(nav.getByRole("link", { name })).toBeVisible();
  });
  test("dashboard fits narrow screens", async ({ page }) => {
    await signInAdmin(page);
    for (const width of [360, 390, 400]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin");
      await expect(
        page.getByRole("heading", { name: "Needs attention" }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    }
  });
});
