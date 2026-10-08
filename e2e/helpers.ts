import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
export async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(process.env.STUDENT_EMAIL!);
  await page.getByLabel("Password").fill(process.env.STUDENT_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}
export function adminClient() {
  return process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SECRET_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
}
export async function cleanupSessions(ids: string[]) {
  const db = adminClient();
  if (db && ids.length) {
    const { error } = await db.from("sessions").delete().in("id", ids);
    if (error) throw new Error("Could not clean up E2E sessions.");
  }
}
export async function start(page: Page, mode: string, ids: string[]) {
  await page.goto("/practice");
  await page.getByLabel(mode, { exact: false }).first().check();
  await page.locator('input[name="topics"][value="t3-inflation"]').check();
  await page.getByRole("button", { name: "Start sprint", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[^/]+$/);
  const id = page.url().split("/").at(-1)!;
  ids.push(id);
  return id;
}
export async function finish(page: Page) {
  await page
    .getByRole("button", { name: "Submit sprint", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Confirm submit", exact: true })
    .click();
  await expect(page).toHaveURL(/\/results$/, { timeout: 90000 });
}
