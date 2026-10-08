import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./helpers";
test.describe("Admin homework builder", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test.describe.configure({ mode: "serial" });
  const title = `E2E admin homework ${Date.now()}`;
  let setId = "";
  let db: SupabaseClient | null = null;
  test.beforeAll(async () => {
    db = adminClient();
    if (!db) {
      db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { error } = await db.auth.signInWithPassword({
        email: process.env.ADMIN_EMAIL!,
        password: process.env.ADMIN_PASSWORD!,
      });
      if (error) throw new Error("Could not authenticate the cleanup admin.");
    }
  });
  test.afterAll(async () => {
    if (!db) return;
    if (setId)
      await db.from("homework_sets").delete().eq("id", setId).throwOnError();
    else
      await db.from("homework_sets").delete().eq("title", title).throwOnError();
  });
  test.setTimeout(180000);
  test("creates a draft, selects real items and publishes", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 60000 });
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/(admin)?$/, { timeout: 30000 });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole("link", { name: /Homework builder/ }).click();
    await page.getByLabel("Title", { exact: true }).fill(title);
    // Sydney wall-clock date safely in the future in either daylight saving offset.
    await page
      .getByLabel("Due date and time (Sydney)")
      .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/admin\/homework\/[^/]+$/);
    setId = page.url().split("/").at(-1)!;
    await page
      .getByRole("checkbox", { name: /^Flashcard:/ })
      .first()
      .check();
    await page
      .getByRole("checkbox", { name: /^Question:/ })
      .first()
      .check();
    await expect(page.getByText(/^TOTAL MARKS: [1-9]/)).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/saved=1/, { timeout: 30000 });
    await expect(
      page.getByRole("status").filter({ hasText: "Homework saved." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(
      page.getByText(/^Published · 0 students started$/),
    ).toBeVisible();
    await expect(page.getByRole("checkbox").first()).toBeDisabled();
    await page.getByRole("link", { name: "Back to homework sets" }).click();
    await expect(
      page.getByRole("link").filter({
        has: page.getByRole("heading", { name: title, exact: true }),
      }),
    ).toContainText("Published");
  });
});
