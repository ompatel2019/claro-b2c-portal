import { expect, test, type Page } from "@playwright/test";

async function signInAdmin(page: Page) {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(admin)?$/, { timeout: 30000 });
}
const headers = [
  "Date",
  "Model",
  "Thinking",
  "Passes",
  "Items",
  "Exact %",
  "Agree %",
  "Mean |Δ|",
  "Total |Δ|",
  "Cost",
  "Duration",
  "By",
];
const noOverflow = (page: Page) =>
  page.evaluate(
    () => document.scrollingElement!.scrollWidth <= window.innerWidth + 1,
  );

test.describe("admin marking engine", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Needs an admin account",
  );
  test.setTimeout(120000);
  test("docs navigation and read-only runs table", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAdmin(page);
    await page
      .context()
      .addCookies([{ name: "sidebar_state", value: "true", url: page.url() }]);
    await page.goto("/admin/marking/engine");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Marking engine",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    const docs = page.getByRole("navigation", { name: "Engine documents" });
    await expect(docs.getByRole("link", { name: /^ENGINE/ })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "Model", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Admin navigation" })
        .getByRole("link", { name: "Engine", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await docs.getByRole("link", { name: /^CHANGELOG/ }).click();
    await expect(page).toHaveURL(/[?&]doc=CHANGELOG(&|$)/);
    await expect(
      docs.getByRole("link", { name: /^CHANGELOG/ }),
    ).toHaveAttribute("aria-current", "page");
    await docs.getByRole("link", { name: /^ENGINE/ }).click();
    await expect(page).toHaveURL(/[?&]doc=ENGINE(&|$)/);
    await page.getByRole("button", { name: "Eval runs", exact: true }).click();
    await expect(page).toHaveURL(/[?&]tab=runs(&|$)/);
    const wrapper = page.getByTestId("runs-region");
    expect(
      await wrapper.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      await wrapper
        .locator('[data-slot="table-container"]')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const table = page.getByRole("table", { name: "Eval runs" });
    await expect(table).toBeVisible();
    expect(await table.getByRole("row").count()).toBeGreaterThan(1);
    for (const header of headers)
      await expect(
        table.getByRole("columnheader").filter({ hasText: header }),
      ).toHaveCount(1);
    const sort = table.getByRole("button", { name: "Date", exact: true });
    await sort.click();
    await expect(sort.locator("..")).toHaveAttribute("aria-sort", "ascending");
    await sort.click();
    await expect(sort.locator("..")).toHaveAttribute("aria-sort", "descending");
    await page.getByRole("button", { name: "New run", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New run" });
    await expect(dialog.getByLabel("Test set")).toContainText(
      "A1 20-answer set",
    );
    await expect(dialog.getByLabel("Model")).toContainText("Claude Sonnet 5.5");
    await expect(
      dialog.getByRole("radio", { name: "Low", exact: true }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("radio", { name: "With blind check (as production)" }),
    ).toBeChecked();
    await expect(dialog).toContainText("Estimated cost:");
    await expect(dialog).toContainText("Remaining budget:");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("#main")).not.toContainText("Compare");
  });
  test("docs and runs fit a 400px phone", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 844 });
    await signInAdmin(page);
    for (const query of [
      "tab=docs&doc=ENGINE",
      "tab=docs&doc=CHANGELOG",
      "tab=runs",
    ]) {
      await page.goto(`/admin/marking/engine?${query}`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Marking engine",
          exact: true,
        }),
      ).toBeVisible({ timeout: 30000 });
      if (query === "tab=runs")
        await expect(
          page.getByRole("list", { name: "Eval runs" }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("navigation", { name: "Engine documents" }),
        ).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      if (query === "tab=runs") {
        const wrapper = page.getByTestId("runs-region");
        expect(
          await wrapper.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        ).toBe(true);
      }
    }
  });
});
