import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  cleanupSessions,
  signIn,
  snapshotFlashcardProgress,
  restoreFlashcardProgress,
} from "./helpers";
import { normaliseAnswer } from "../src/lib/flashcards";
import { DECK_DEFAULTS } from "../src/lib/deck";

test.describe("Flashcard session and results", () => {
  test.skip(
    !process.env.STUDENT_EMAIL ||
      !process.env.STUDENT_PASSWORD ||
      !process.env.SUPABASE_SECRET_KEY,
    "Requires a student account and seed credentials",
  );
  test.describe.configure({ mode: "serial" });
  const sessions: string[] = [];
  const reviewed = new Set<string>();
  let userId = "";
  let cards: { id: string; front: string; back: string }[] = [];
  let snapshot: Awaited<ReturnType<typeof snapshotFlashcardProgress>>;
  test.beforeAll(async () => {
    snapshot = await snapshotFlashcardProgress();
    userId = snapshot.userId;
    const db = adminClient()!;
    const { data, error } = await db
      .from("flashcards")
      .select("id,front,back")
      .eq("status", "live")
      .is("owner_id", null)
      .eq("kind", "term")
      .order("id");
    if (error) throw error;
    cards = (data ?? []).filter((c) => normaliseAnswer(c.back)).slice(0, 2);
    expect(cards).toHaveLength(2);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  test.afterAll(async () => {
    await cleanupSessions(sessions);
    if (snapshot) await restoreFlashcardProgress(snapshot, reviewed);
  });
  async function deck(page: Page, mode: "study" | "test") {
    // Seed only this test's session; existing unfinished sessions remain untouched.
    const { data, error } = await adminClient()!
      .from("sessions")
      .insert({
        user_id: userId,
        kind: "flashcards",
        config: {
          ...DECK_DEFAULTS,
          mode,
          order: "topic",
          repeat_missed: false,
          card_ids: cards.map((c) => c.id),
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    sessions.push(data.id);
    await page.goto(`/student/flashcards/${data.id}`);
    await expect(
      page.getByRole("heading", { name: cards[0].front, exact: true }),
    ).toBeVisible();
    return data.id as string;
  }
  test("study flip, list, resume, last skip, results actions and legacy redirects", async ({
    page,
  }) => {
    const id = await deck(page, "study");
    let markRequests = 0;
    page.on("request", (r) => {
      if (/\/api\/flashcards\/[^/]+\/mark$/.test(new URL(r.url()).pathname))
        markRequests++;
    });
    // The first key press can land before hydration on prod: retry it.
    await expect(async () => {
      if (!(await page.getByRole("table").isVisible()))
        await page.keyboard.press("l");
      await expect(page.getByRole("table")).toContainText(cards[1].back, {
        timeout: 1000,
      });
    }).toPass({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "Knew it (3)" })).toHaveCount(
      0,
    );
    await page.keyboard.press("l");
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("heading", { name: "Model answer", exact: true }),
    ).toBeVisible();
    reviewed.add(cards[0].id);
    await page.keyboard.press("3");
    await expect(
      page.getByRole("heading", { name: cards[1].front, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save and exit", exact: true })
      .click();
    await expect(page).toHaveURL(/\/student$/);
    await page.goto(`/flashcards/${id}`);
    await expect(page).toHaveURL(`/student/flashcards/${id}`);
    await expect(
      page.getByText("Welcome back, 1 card left", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("s");
    await expect(
      page.getByRole("heading", {
        name: "Your flashcard results",
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole("table")).toContainText(cards[0].back);
    await expect(page.getByRole("table")).toContainText(cards[1].back);
    await expect(
      page.getByRole("row").filter({ hasText: cards[1].front }),
    ).toContainText("Not rated");
    await expect(
      page.getByRole("button", { name: "Practise missed (0)", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Review due", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to flashcards", exact: true }),
    ).toHaveAttribute("href", "/student/flashcards");
    await page.goto(`/flashcards/${id}/results`);
    await expect(page).toHaveURL(`/student/flashcards/${id}`);
    await expect(
      page.getByRole("heading", {
        name: "Your flashcard results",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Test these cards", exact: true })
      .click();
    await page.waitForURL(
      (u) =>
        /\/student\/flashcards\/[^/]+$/.test(u.pathname) &&
        !u.pathname.endsWith(id),
    );
    const nextId = page.url().split("/").at(-1)!;
    sessions.push(nextId);
    await expect(
      page.getByRole("textbox", { name: "Your answer", exact: true }),
    ).toBeVisible();
    const { data } = await adminClient()!
      .from("sessions")
      .select("config")
      .eq("id", nextId)
      .single();
    expect(data?.config.mode).toBe("test");
    expect([...data?.config.card_ids].sort()).toEqual(
      cards.map((c) => c.id).sort(),
    );
    expect(markRequests).toBe(0);
  });
  test("exact deterministic answer, Disagree override, reveal self rating and results", async ({
    page,
  }) => {
    await deck(page, "test");
    // Read the exact back from adminClient above. Never submit a guessed answer.
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill(cards[0].back);
    reviewed.add(cards[0].id);
    const checked = page.waitForResponse((r) =>
      /\/api\/flashcards\/[^/]+\/mark$/.test(new URL(r.url()).pathname),
    );
    await page
      .getByRole("button", { name: "Check (⌘Enter)", exact: true })
      .click();
    const verdict = await (await checked).json();
    expect(verdict).toMatchObject({ local: true, source: "self", mark: 1 });
    await expect(
      page.getByRole("status").filter({ hasText: /^Knew it$/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Disagree?", exact: true }).click();
    const overridden = page.waitForResponse((r) =>
      /\/api\/flashcards\/[^/]+\/mark$/.test(new URL(r.url()).pathname),
    );
    await page.getByRole("button", { name: "Mostly", exact: true }).click();
    expect(await (await overridden).json()).toMatchObject({
      reviewId: verdict.reviewId,
      mark: 0.5,
      source: "self",
    });
    await expect(
      page.getByRole("status").filter({ hasText: /^Mostly$/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next card", exact: true }).click();
    await page
      .getByRole("button", { name: "Reveal answer", exact: true })
      .click();
    await expect(page.getByText(cards[1].back, { exact: true })).toBeVisible();
    reviewed.add(cards[1].id);
    await page
      .getByRole("button", { name: "Knew it (3)", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Your flashcard results",
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole("row").filter({ hasText: cards[0].front }),
    ).toContainText("Mostly");
    await expect(page.getByRole("table")).toContainText(cards[1].back);
    await expect(
      page.getByRole("button", { name: "Practise missed (1)", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Test these cards", exact: true }),
    ).toHaveCount(0);
    const { data } = await adminClient()!
      .from("flashcard_reviews")
      .select("source,mark")
      .eq("session_id", sessions.at(-1)!);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "self", mark: 0.5 }),
        expect.objectContaining({ source: "self", mark: 1 }),
      ]),
    );
    expect(data?.some((r) => r.source === "ai")).toBe(false);
    await page
      .getByRole("button", { name: "Practise missed (1)", exact: true })
      .click();
    const testId = sessions.at(-1)!;
    await page.waitForURL(
      (u) =>
        /\/student\/flashcards\/[^/]+$/.test(u.pathname) &&
        !u.pathname.endsWith(testId),
    );
    const retryId = page.url().split("/").at(-1)!;
    sessions.push(retryId);
    const retry = await adminClient()!
      .from("sessions")
      .select("config")
      .eq("id", retryId)
      .single();
    expect(retry.data?.config.card_ids).toEqual([cards[0].id]);
  });
});
