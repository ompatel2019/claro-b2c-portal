import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Admin tools", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test.setTimeout(120000);

  test("admin can open students, submissions, questions and spend", async ({
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
    await page.goto("/admin/submissions");
    await expect(
      page.getByRole("heading", { name: "Submissions" }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText(
        /Recent AI-marked short and extended|No marked written answers yet/,
      ),
    ).toBeVisible();
    await page.goto("/admin/questions");
    await expect(
      page.getByRole("heading", { name: "Questions" }),
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
      "/admin/submissions",
      "/admin/questions",
      "/admin/spend",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
    }
  });
});
