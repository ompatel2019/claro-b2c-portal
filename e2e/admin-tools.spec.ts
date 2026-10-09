import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Admin tools", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test.setTimeout(120000);

  test("admin can open students, marking review, questions and spend", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 60000 });
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/(admin)?$/, { timeout: 30000 });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Admin navigation" })
      .getByRole("link", { name: "All students" })
      .click();
    await expect(page).toHaveURL(/\/admin\/students$/);
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    const count = await page.getByText(/^\d+ students?$/).textContent();
    expect(count).toMatch(/^(1 student|([02-9]|\d{2,}) students)$/);
    await page.goto("/admin/marking/review");
    await expect(
      page.getByRole("heading", { name: "Marking review" }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page
        .getByRole("navigation", { name: "Review queues" })
        .getByRole("link", { name: /^Open \(\d+\)$/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Add 5 spot checks" }),
    ).toBeVisible();
    await page.goto("/admin/questions?type=mcq");
    await expect(
      page.getByRole("heading", { name: "Questions" }),
    ).toBeVisible();
    // Pagination reaches row 101 onwards (there are more than 100 MC questions).
    const pages = page.getByRole("navigation", { name: "Question pages" });
    await expect(pages.first()).toContainText(/Showing 1–100 of \d{3,}/);
    await pages.first().getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/type=mcq&page=2/);
    await expect(pages.first()).toContainText(/Showing 101–\d+ of \d+/);
    expect(await page.locator("li[id]").count()).toBeGreaterThan(0);
    await expect(
      pages.first().getByRole("link", { name: "Previous" }),
    ).toBeVisible();
    await page.goto("/admin/spend");
    await expect(page.getByRole("heading", { name: "AI spend" })).toBeVisible();
    await expect(page.getByText(/Cap \$100/)).toBeVisible();
  });
});

test.describe("Admin tools denied to students", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a student account",
  );
  test.setTimeout(90000);

  test("student is redirected away from /admin routes", async ({ page }) => {
    await signIn(page);
    for (const path of [
      "/admin",
      "/admin/students",
      "/admin/marking/review",
      "/admin/questions",
      "/admin/spend",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/student$/);
    }
  });
});
