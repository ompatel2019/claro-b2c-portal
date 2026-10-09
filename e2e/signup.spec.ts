import { test, expect } from "@playwright/test";
import { adminClient } from "./helpers";
test.describe("Real sign up", () => {
  test.skip(
    !process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Requires Supabase admin credentials",
  );
  const email = `claro.e2e.${crypto.randomUUID()}@getclaro.com.au`;
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
    const password = `E2e-${crypto.randomUUID()}`;
    await expect(async () => {
      if (new URL(page.url()).pathname === "/student") return;
      await page.getByLabel("Name", { exact: true }).fill("Claro E2E Student");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await expect(page).toHaveURL(/\/student$/, { timeout: 5000 });
    }).toPass({ timeout: 60000 });
    const welcome = page.getByRole("dialog", { name: "Welcome", exact: true });
    await expect(welcome).toBeVisible();
    await expect(welcome.getByLabel("Full name", { exact: true })).toHaveValue(
      "Claro E2E Student",
    );
    await expect(async () => {
      await welcome
        .getByRole("combobox", { name: "Year", exact: true })
        .click();
      await page.getByRole("option", { name: "Year 11", exact: true }).click();
      await expect(
        welcome.getByRole("combobox", { name: "Year", exact: true }),
      ).toContainText("Year 11");
    }).toPass();
    await expect(async () => {
      if (await welcome.count())
        await welcome
          .getByRole("button", { name: "Let's go", exact: true })
          .click();
      await expect(welcome).toHaveCount(0, { timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await expect(page.getByText("No marks yet", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Quick start", exact: true }),
    ).toBeVisible();
  });
});
