import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
export async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(process.env.STUDENT_EMAIL!);
  await page.getByLabel("Password").fill(process.env.STUDENT_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
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
const TYPES: Record<string, string> = {
  "Multiple choice": "mcq",
  "Short answer": "short",
  "Extended response": "extended",
  Mixed: "mixed",
};
/** Starts a sprint of one type on Inflation through the §3.2 setup page. */
export async function start(page: Page, mode: string, ids: string[]) {
  await page.goto(`/student/sprint?type=${TYPES[mode]}&sub=t3-inflation`);
  await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
  await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
  await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
  const id = page.url().split("/").at(-1)!;
  ids.push(id);
  return id;
}
/** MC inputs are visually hidden inside radio cards, so wait, then force. */
export async function pick(page: Page, letter: string) {
  const radio = page.getByRole("radio", {
    name: new RegExp(`^Option ${letter}:`),
  });
  await expect(radio).toBeEnabled();
  await radio.check({ force: true });
}
export async function finish(page: Page) {
  await page
    .getByRole("button", { name: "Finish", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Finish and mark", exact: true })
    .click();
  await expect(page).toHaveURL(/\/results$/, { timeout: 90000 });
}
