import { normaliseAnswer } from "../src/lib/flashcards";
import { expect, test, type Page } from "@playwright/test";
import {
  cleanupSessions,
  signIn,
  snapshotFlashcardProgress,
  restoreFlashcardProgress,
} from "./helpers";

test.describe("Student flashcards", () => {
  test.skip(
    !process.env.STUDENT_EMAIL ||
      !process.env.STUDENT_PASSWORD ||
      !process.env.SUPABASE_SECRET_KEY,
    "Requires a real student account",
  );
  test.describe.configure({ mode: "serial" });
  const sessionIds: string[] = [];
  const reviewedCards = new Set<string>();
  let snapshot: Awaited<ReturnType<typeof snapshotFlashcardProgress>>;
  test.beforeAll(async () => {
    snapshot = await snapshotFlashcardProgress();
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  test.afterAll(async () => {
    await cleanupSessions(sessionIds);
    if (snapshot) await restoreFlashcardProgress(snapshot, reviewedCards);
  });
  async function startDeck(page: Page, mode: "study" | "test") {
    await page.goto("/student/flashcards?topic=t3-inflation");
    await expect(
      page.getByRole("heading", { name: "Flashcards", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.locator("form").filter({
        has: page.getByRole("button", { name: "Start", exact: true }),
      }),
    ).toContainText("Inflation ·");
    await page.getByRole("button", { name: /^Terms \(\d+\)$/ }).click();
    await page
      .getByRole("button", {
        name: mode === "study" ? "Study" : "Test",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: /^Terms \(\d+\)$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", {
        name: mode === "study" ? "Study" : "Test",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Start", exact: true }).click();
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
  test("deck chips use topic names and live counts", async ({ page }) => {
    await page.goto("/student/flashcards");
    await expect(
      page.getByRole("heading", { name: /^The Global Economy · \d+$/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Topic \d$/ })).toHaveCount(
      0,
    );
    await expect(page.getByText(/^\d+ of \d+ cards?$/)).toBeVisible();
  });
  test("dashboard shows cards due today", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /^Flashcards due \d+/ }),
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
    const countText = await page.getByText(/^Card \d+ of \d+$/).innerText();
    const count = Number(countText.match(/of (\d+)/)![1]);
    await page.getByRole("button", { name: "Flip card", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Model answer", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Missed it (1)", exact: true })
      .click();
    await expect(
      page.getByText("1 card coming back", { exact: true }),
    ).toBeVisible();
    for (let i = 1; i < count; i++) {
      await expect(
        page.getByText(`Card ${i + 1} of ${count}`, { exact: true }),
      ).toBeVisible();
      await cardId(page);
      await page
        .getByRole("button", { name: "Flip card", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Knew it (3)", exact: true })
        .click();
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
      page.getByText(`${count - 1} / ${count}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Practise missed (1)", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Test these cards", exact: true }),
    ).toBeVisible();
    expect(aiRequests).toBe(0);
    const id = sessionIds.at(-1)!;
    await page.goto("/activity?mode=study");
    await expect(
      page.locator(`a[href="/student/flashcards/${id}"]`),
    ).toContainText("Flashcards: Study");
  });
  test("test mode checks one answer and finishes with a model answer", async ({
    page,
  }) => {
    const verdictResponses: boolean[] = [];
    page.on("response", async (response) => {
      if (
        /\/api\/flashcards\/[^/]+\/mark$/.test(
          new URL(response.url()).pathname,
        ) &&
        response.ok()
      ) {
        const result = await response.json();
        verdictResponses.push(result.local === true && result.source !== "ai");
      }
    });
    await startDeck(page, "test");
    const currentId = await cardId(page);
    await page.getByRole("button", { name: "List (L)", exact: true }).click();
    const exactAnswer = await page
      .locator(`tr[data-card-id="${currentId}"] td`)
      .nth(1)
      .innerText();
    await page.getByRole("button", { name: "One by one", exact: true }).click();
    expect(normaliseAnswer(exactAnswer)).not.toBe("");
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill(exactAnswer);
    const checked = page.waitForResponse((r) =>
      /\/api\/flashcards\/[^/]+\/mark$/.test(new URL(r.url()).pathname),
    );
    await page
      .getByRole("button", { name: "Check (⌘Enter)", exact: true })
      .click();
    expect(await (await checked).json()).toMatchObject({
      local: true,
      mark: 1,
      source: "self",
    });
    await expect(
      page.getByRole("status").filter({ hasText: /^Knew it$/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Your flashcard results",
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole("columnheader", { name: "Model answer", exact: true }),
    ).toBeVisible();
    expect(verdictResponses).toEqual([true]);
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
    await page.goto("/student/flashcards", { waitUntil: "domcontentloaded" });
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
