import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const sidebarWidth = (page: Page) =>
  page
    .locator('[data-slot="sidebar-container"]')
    .evaluate((el) => el.getBoundingClientRect().width);

test.describe("App shell", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a real student account",
  );
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies({ name: "sidebar_state" });
    await signIn(page);
  });

  test("sidebar collapses to icons with tooltips, toggles with ⌘B and remembers", async ({
    page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByText("Practise", { exact: true })).toBeVisible();
    await expect(nav.getByText("Track", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect.poll(() => sidebarWidth(page)).toBe(260);
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    await nav.getByRole("link", { name: "Flashcards" }).hover();
    await expect(
      page.locator('[data-slot="tooltip-content"]', { hasText: "Flashcards" }),
    ).toBeVisible();
    await page.reload();
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    await page.locator("body").press("ControlOrMeta+b");
    await expect.poll(() => sidebarWidth(page)).toBe(260);
    await nav.getByRole("link", { name: "Activity" }).click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(nav.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("Bricolage Grotesque is the only font", async ({ page }) => {
    const families = await page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll("body, body *")].map(
          (el) => getComputedStyle(el).fontFamily,
        ),
      ),
    ]);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) expect(family).toMatch(/Bricolage/);
    const italic = await page.evaluate(
      () =>
        [...document.querySelectorAll("body *")].filter(
          (el) => getComputedStyle(el).fontStyle === "italic",
        ).length,
    );
    expect(italic).toBe(0);
    const html = await page.content();
    expect(html).not.toMatch(/Instrument|Caveat/);
  });

  test("mobile opens the sidebar as a sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("link", { name: "Topic Sprint" }).click();
    await expect(page).toHaveURL(/\/student\/sprint$/);
  });
});

test.describe("Admin shell", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test("admin sidebar is grouped and separate from the student nav", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/admin$/);
    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    for (const group of [
      "Overview",
      "Students",
      "Content",
      "Marking",
      "Spend & settings",
    ])
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    await expect(nav.getByRole("link")).toHaveText([
      "Dashboard",
      "All students",
      "Questions",
      "Review queue",
      "AI spend",
    ]);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    await nav.getByRole("link", { name: "AI spend" }).click();
    await expect(page.getByRole("heading", { name: "AI spend" })).toBeVisible();
  });
});
