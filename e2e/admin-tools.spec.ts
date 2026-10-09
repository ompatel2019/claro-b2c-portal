import { expect, test } from "@playwright/test";
import { signIn, signInAdmin } from "./helpers";

test.describe("Admin tools", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test.setTimeout(120000);

  test("admin can open the marking review queue", async ({ page }) => {
    await signInAdmin(page);
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
      "/admin/content/questions",
      "/admin/content/flashcards",
      "/admin/content/papers",
      "/admin/feedback",
      "/admin/spend",
    ]) {
      // Routes not built yet 404; built ones must send the student home.
      const response = await page.goto(path);
      if (response?.status() === 404) continue;
      await expect(page).toHaveURL(/\/student$/);
    }
  });
});
