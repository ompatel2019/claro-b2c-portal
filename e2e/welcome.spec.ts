import { test, expect, type Page } from "@playwright/test";
import { adminClient, signInAdmin } from "./helpers";

test.describe("First sign-in welcome", () => {
  test.skip(
    !process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Requires Supabase admin credentials",
  );
  let userId: string | undefined;
  const email = `claro.e2e.welcome.${crypto.randomUUID()}@getclaro.com.au`;
  const password = `E2e-${crypto.randomUUID()}`;
  const fullName = "Claro E2E Welcome";

  test.beforeAll(async () => {
    const { data, error } = await adminClient()!.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, e2e_tag: "welcome" },
    });
    if (error) throw error;
    userId = data.user.id;
  });
  test.afterAll(async () => {
    if (!userId) return;
    const { error } = await adminClient()!.auth.admin.deleteUser(userId);
    if (error) throw error;
  });

  async function login(page: Page) {
    await page.goto("/sign-in");
    await expect(async () => {
      if (new URL(page.url()).pathname === "/student") return;
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/student$/, { timeout: 5000 });
    }).toPass({ timeout: 60000 });
  }

  test("requires Year, retries a failed save, and completes only once", async ({
    page,
  }) => {
    await login(page);
    const dialog = page.getByRole("dialog", { name: "Welcome", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Full name", { exact: true })).toHaveValue(
      fullName,
    );
    await expect(
      dialog.getByRole("button", { name: "Close", exact: true }),
    ).toHaveCount(0);
    await expect(async () => {
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }).toPass();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
    await expect(async () => {
      await dialog
        .getByRole("button", { name: "Let's go", exact: true })
        .focus();
      await page.keyboard.press("s");
      await expect(page).toHaveURL(/\/student$/);
      await expect(dialog).toBeVisible();
    }).toPass();
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    for (const width of [360, 400, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(async () => {
        const box = await dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }).toPass();
    }
    await dialog.getByRole("button", { name: "Let's go", exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(
      (
        await adminClient()!
          .from("profiles")
          .select("year_level")
          .eq("id", userId!)
          .single()
      ).data?.year_level,
    ).toBeNull();
    await page.reload();
    await expect(dialog).toBeVisible();
    await expect(async () => {
      await dialog.getByRole("combobox", { name: "Year", exact: true }).click();
      await page.getByRole("option", { name: "Year 12", exact: true }).click();
      await expect(
        dialog.getByRole("combobox", { name: "Year", exact: true }),
      ).toContainText("Year 12");
    }).toPass();
    await expect(async () => {
      await dialog
        .getByLabel("School", { exact: true })
        .fill("Claro E2E School");
      await expect(dialog.getByLabel("School", { exact: true })).toHaveValue(
        "Claro E2E School",
      );
    }).toPass();
    const db = adminClient()!;
    await page.route("**/student", async (route) => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await expect(async () => {
      await dialog
        .getByRole("button", { name: "Let's go", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText("Try again.");
    }).toPass();
    await expect(dialog.getByLabel("School", { exact: true })).toHaveValue(
      "Claro E2E School",
    );
    await page.unroute("**/student");
    await expect(async () => {
      if (await dialog.count())
        await dialog
          .getByRole("button", { name: "Let's go", exact: true })
          .click();
      await expect(dialog).toHaveCount(0, { timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await expect(
      page.getByRole("heading", { name: "Quick start", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No marks yet", { exact: true })).toBeVisible();
    const { data, error } = await db
      .from("profiles")
      .select("full_name,year_level,school")
      .eq("id", userId!)
      .single();
    if (error) throw error;
    expect(data).toEqual({
      full_name: fullName,
      year_level: 12,
      school: "Claro E2E School",
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Quick start", exact: true }),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.context().clearCookies();
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Quick start", exact: true }),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // Only the tagged throwaway is changed: one finished session, no attempts or AI.
    const { error: sessionError } = await db.from("sessions").insert({
      user_id: userId!,
      kind: "sprint",
      config: { mode: "mcq", e2e_tag: "welcome" },
      finished_at: new Date().toISOString(),
    });
    if (sessionError) throw sessionError;
    const { error: profileError } = await db
      .from("profiles")
      .update({ year_level: null })
      .eq("id", userId!);
    if (profileError) throw profileError;
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Quick start", exact: true }),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.context().clearCookies();
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Quick start", exact: true }),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });
});

test("admin sign-in still opens admin and student Home has no welcome", async ({
  page,
}) => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires admin credentials",
  );
  await signInAdmin(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/student");
  await expect(
    page.getByRole("dialog", { name: "Welcome", exact: true }),
  ).toHaveCount(0);
});
