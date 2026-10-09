import { test, expect } from "@playwright/test";
import { adminClient } from "./helpers";
test.describe("Real sign up", () => {
  test.skip(
    !process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Requires Supabase admin credentials",
  );
  const email = `claro.e2e.${Date.now()}@getclaro.com.au`;
  test.afterAll(async () => {
    const db = adminClient();
    if (!db) return;
    const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error("Could not find throwaway user for cleanup.");
    const user = data.users.find((u) => u.email === email);
    if (user) {
      const { error } = await db.auth.admin.deleteUser(user.id);
      if (error) throw new Error("Could not delete throwaway user.");
    }
  });
  test("a new student lands on their dashboard", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Name", { exact: true }).fill("Claro E2E Student");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(`E2e-${crypto.randomUUID()}`);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(
      page.getByText("No scores yet", { exact: true }),
    ).toBeVisible();
  });
});
