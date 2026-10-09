import { expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export async function expectStackedBelow(text: Locator, button: Locator) {
  await expect(text).toBeVisible();
  await expect(button).toBeVisible();
  await expect
    .poll(async () => {
      const [copy, control] = await Promise.all([
        text.boundingBox(),
        button.boundingBox(),
      ]);
      return !!copy && !!control && control.y >= copy.y + copy.height;
    })
    .toBe(true);
}

/** Retry geometry while async pool counts and wrapped summaries settle. */
export async function expectNoOverlap(a: Locator, b: Locator) {
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  await expect
    .poll(async () => {
      const [first, second] = await Promise.all([
        a.boundingBox(),
        b.boundingBox(),
      ]);
      if (!first || !second) return true;
      return (
        first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y
      );
    })
    .toBe(false);
}

async function signInAs(
  page: Page,
  email: string,
  password: string,
  destination: RegExp,
) {
  await page.goto("/sign-in");
  await expect(async () => {
    if (destination.test(new URL(page.url()).pathname)) return;
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(destination, { timeout: 5000 });
  }).toPass({ timeout: 60000 });
}
export async function signIn(page: Page) {
  await signInAs(
    page,
    process.env.STUDENT_EMAIL!,
    process.env.STUDENT_PASSWORD!,
    /\/student$/,
  );
}
/** Signs in with the admin account and waits for hydration when submitting. */
export async function signInAdmin(page: Page) {
  await signInAs(
    page,
    process.env.ADMIN_EMAIL!,
    process.env.ADMIN_PASSWORD!,
    /\/admin$/,
  );
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

/** Snapshot before any ratings; restore existing rows and delete only test-created rows. */
export async function snapshotFlashcardProgress() {
  const db = adminClient()!;
  let userId = "";
  for (let page = 1; !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    userId =
      data.users.find(
        (u) =>
          u.email?.toLowerCase() === process.env.STUDENT_EMAIL?.toLowerCase(),
      )?.id ?? "";
    if (data.users.length < 1000) break;
  }
  if (!userId) throw new Error("Could not find the E2E student for cleanup.");
  const before: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("flashcard_progress")
      .select("*")
      .eq("user_id", userId)
      .order("flashcard_id")
      .range(from, from + 499);
    if (error) throw error;
    before.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return { userId, before };
}
export async function restoreFlashcardProgress(
  snapshot: Awaited<ReturnType<typeof snapshotFlashcardProgress>>,
  reviewed: Set<string>,
) {
  const db = adminClient()!;
  const { userId, before } = snapshot;
  const created = [...reviewed].filter(
    (id) => !before.some((p) => p.flashcard_id === id),
  );
  if (created.length) {
    const { error } = await db
      .from("flashcard_progress")
      .delete()
      .eq("user_id", userId)
      .in("flashcard_id", created);
    if (error) throw error;
  }
  const existing = before.filter((p) => reviewed.has(p.flashcard_id as string));
  if (existing.length) {
    const { error } = await db
      .from("flashcard_progress")
      .upsert(existing, { onConflict: "user_id,flashcard_id" });
    if (error) throw error;
  }
}
