import { expect, test, type Page } from "@playwright/test";
import { adminClient, cleanupSessions, signIn } from "./helpers";

test.describe("Student flashcards", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a real student account",
  );
  test.describe.configure({ mode: "serial" });
  const sessionIds: string[] = [];
  const reviewedCards = new Set<string>();
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  test.afterAll(async () => {
    await cleanupSessions(sessionIds);
    const db = adminClient();
    if (!db || !reviewedCards.size) return;
    let userId: string | undefined;
    for (let page = 1; !userId; page++) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error)
        throw new Error("Could not look up the E2E student for cleanup.");
      userId = data.users.find(
        (u) =>
          u.email?.toLowerCase() === process.env.STUDENT_EMAIL?.toLowerCase(),
      )?.id;
      if (data.users.length < 1000) break;
    }
    if (!userId) throw new Error("Could not find the E2E student for cleanup.");
    const { error } = await db
      .from("flashcard_progress")
      .delete()
      .eq("user_id", userId)
      .in("flashcard_id", [...reviewedCards]);
    if (error) throw new Error("Could not clean up E2E flashcard progress.");
  });
  async function startDeck(page: Page, mode: "study" | "test") {
    await page.goto("/flashcards?topic=t3-inflation&filter=t3");
    await expect(
      page.getByRole("heading", { name: "Inflation", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    const type = page.locator("#flashcard-type");
    await expect(type).toBeVisible({ timeout: 30000 });
    await type.selectOption("term");
    await page.locator("#flashcard-mode").selectOption(mode);
    await page.getByRole("button", { name: "Start deck", exact: true }).click();
    await expect(page).toHaveURL(/\/flashcards\/[^/]+$/, { timeout: 60000 });
    sessionIds.push(page.url().split("/").at(-1)!);
  }
  async function cardId(page: Page) {
    const id = await page
      .locator("article[data-card-id]")
      .getAttribute("data-card-id");
    expect(id).toBeTruthy();
    reviewedCards.add(id!);
    return id!;
  }
  test("deck chips use topic names and counts are pluralised", async ({
    page,
  }) => {
    await page.goto("/flashcards");
    const chips = page.getByRole("navigation", {
      name: "Filter flashcard topics",
    });
    await expect(
      chips.getByRole("link", { name: "The Global Economy", exact: true }),
    ).toBeVisible();
    await expect(chips.getByRole("link", { name: /^Topic \d$/ })).toHaveCount(
      0,
    );
    const counts = page.getByText(/^\d+ terms? · \d+ statistics cards?$/);
    expect(await counts.count()).toBeGreaterThan(0);
    for (const text of await counts.allTextContents())
      expect(text).not.toMatch(/(^|· )1 (terms|statistics cards)/);
  });
  test("dashboard shows cards due today", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: "Due today", exact: true }),
    ).toBeVisible();
  });
  test("study recycles a missed card and scores only first tries", async ({
    page,
  }) => {
    let aiRequests = 0;
    page.on("request", (r) => {
      if (/\/api\/flashcards\/[^/]+\/mark$/.test(new URL(r.url()).pathname))
        aiRequests++;
    });
    await startDeck(page, "study");
    const first = await cardId(page);
    const front = await page.locator("article h2").innerText();
    const countText = await page
      .getByText(/^Card \d+ of \d+ · Study$/)
      .innerText();
    const count = Number(countText.match(/of (\d+)/)![1]);
    await page.getByRole("button", { name: "Flip card", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Model answer", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Missed", exact: true }).click();
    await expect(
      page.getByText("1 card coming back", { exact: true }),
    ).toBeVisible();
    for (let i = 1; i < count; i++) {
      await expect(
        page.getByText(`Card ${i + 1} of ${count} · Study`, { exact: true }),
      ).toBeVisible();
      await cardId(page);
      await page
        .getByRole("button", { name: "Flip card", exact: true })
        .click();
      await page.getByRole("button", { name: "Knew it", exact: true }).click();
    }
    await expect(page.locator("article")).toHaveAttribute(
      "data-card-id",
      first,
    );
    await expect(page.locator("article h2")).toHaveText(front);
    // The remaining missed card survives a refresh; known cards stay out of the queue.
    await page.reload();
    await expect(page.locator("article")).toHaveAttribute(
      "data-card-id",
      first,
    );
    await page.getByRole("button", { name: "Flip card", exact: true }).click();
    await page.getByRole("button", { name: "Knew it", exact: true }).click();
    // Finish may hard-navigate; if the runner lands on the complete state first, click through.
    const results = page.waitForURL(/\/results$/, { timeout: 60000 });
    const see = page.getByRole("button", { name: "See results", exact: true });
    if (await see.isVisible().catch(() => false)) await see.click();
    await results;
    await expect(
      page.getByText(`${count - 1}/${count}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your cards", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("First mark: 0/1 · 2 attempts", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Practise missed cards again",
        exact: true,
      }),
    ).toBeVisible();
    expect(aiRequests).toBe(0);
    const id = sessionIds.at(-1)!;
    await page.goto("/activity?mode=study");
    await expect(
      page.locator(`a[href="/flashcards/${id}/results"]`),
    ).toContainText("Flashcards: Study");
  });
  test("test mode checks one answer and finishes with a model answer", async ({
    page,
  }) => {
    test.skip(!process.env.E2E_AI, "Calls OpenAI: set E2E_AI=1");
    test.setTimeout(180000);
    let aiRequests = 0;
    page.on("request", (r) => {
      if (/\/api\/flashcards\/[^/]+\/mark$/.test(new URL(r.url()).pathname))
        aiRequests++;
    });
    await startDeck(page, "test");
    await cardId(page);
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill(
        "Inflation is a sustained increase in the general price level, reducing the purchasing power of money.",
      );
    await page
      .getByRole("button", { name: "Check answer", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /^(Knew it|Nearly there|Not yet)$/ }),
    ).toBeVisible({ timeout: 120000 });
    await expect(
      page.getByRole("heading", { name: "Model answer", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next card", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Finish now", exact: true }).click();
    await expect(page).toHaveURL(/\/results$/);
    await expect(
      page.getByText("First-try marks / cards reviewed", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^AI feedback:/)).toBeVisible();
    expect(aiRequests).toBe(1);
  });
});

test.describe("Flashcard persist queue", () => {
  test.skip(
    !process.env.STUDENT_EMAIL ||
      !process.env.STUDENT_PASSWORD ||
      !process.env.SUPABASE_SECRET_KEY,
    "Requires a student account and service-role seed credentials",
  );
  test("drops a stale queued rating after the first missing-session error", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const staleSession = "00000000-0000-4000-8000-000000000099";
    const markUrls: string[] = [];
    const serverErrors: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/flashcards/") && req.url().includes("/mark"))
        markUrls.push(req.url());
    });
    page.on("response", (res) => {
      if (res.status() >= 500) serverErrors.push(res.url());
    });
    await signIn(page);
    await page.goto("/flashcards", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ key, sessionId }) => {
        localStorage.setItem(
          key,
          JSON.stringify([
            { sessionId, cardId: "real-gdp", mark: 1 },
            { sessionId, cardId: "gdp-per-capita", mark: 0 },
          ]),
        );
      },
      { key: "claro.flashcard.persist", sessionId: staleSession },
    );
    await page.reload({ waitUntil: "networkidle" });
    await expect
      .poll(
        async () =>
          page.evaluate(
            (key) => localStorage.getItem(key),
            "claro.flashcard.persist",
          ),
        { timeout: 15000 },
      )
      .toBeNull();
    // Drain uses rateFlashcard (server action). Mark API must stay quiet; nothing may 5xx.
    expect(markUrls).toEqual([]);
    expect(serverErrors).toEqual([]);
  });
});
