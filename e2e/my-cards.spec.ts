import { expect, test, type Page } from "@playwright/test";
import { adminClient, signIn } from "./helpers";

test.describe("My cards", () => {
  test.skip(
    !process.env.STUDENT_EMAIL ||
      !process.env.STUDENT_PASSWORD ||
      !process.env.SUPABASE_SECRET_KEY,
    "Needs a student account and an admin client for cleanup.",
  );
  // The student account is shared, so every front carries this run's tag.
  const run = `my-cards-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  test.afterAll(async () => {
    const { error } = await adminClient()!
      .from("flashcards")
      .delete()
      .eq("origin", "student")
      .like("front", `${run}%`);
    if (error) throw error;
  });
  const front = (page: Page, text: string) =>
    page.getByRole("button", { name: `${run} ${text}`, exact: true });
  const choose = async (page: Page, label: string, option: string) => {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  const toastUndo = (page: Page, text: string) =>
    page
      .locator("[data-sonner-toast]")
      .filter({ hasText: text })
      .getByRole("button", { name: "Undo", exact: true });
  const importCards = async (page: Page) => {
    await page.getByRole("button", { name: "Import", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Paste text")
      .fill(
        `Front,Back\n${run} edited,duplicate\n${run} imported,"A quoted, answer"\n,invalid`,
      );
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await choose(page, "Default topic", "Inflation");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      dialog.getByText("1 ready · 1 duplicates · 1 invalid"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: "Include row 1" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("checkbox", { name: "Include row 3" }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Import 1 card" }).click();
    await expect(front(page, "imported")).toBeVisible();
  };

  test("creates, edits, blocks duplicates, imports, undoes and bulk deletes its own cards", async ({
    page,
  }) => {
    const aiRequests: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/.*\/mark$/.test(new URL(r.url()).pathname))
        aiRequests.push(r.url());
    });
    await signIn(page);
    await page.goto(`/student/flashcards/mine?q=${run}`);
    await expect(page.getByText(/^No cards (match|yet)$/)).toBeVisible();
    const dialog = page.getByRole("dialog");
    // The first click can land before hydration: retry until the dialog opens.
    await expect(async () => {
      if (!(await dialog.isVisible()))
        await page
          .getByRole("button", { name: "Add card", exact: true })
          .first()
          .click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await choose(page, "Topic", "Inflation");
    await dialog.getByLabel("Front", { exact: true }).fill(`${run} first`);
    await dialog.getByLabel("Back", { exact: true }).fill("Prices increase");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(front(page, "first")).toBeVisible();
    // Check only this run's tagged cards; unrelated cards and sessions stay untouched.
    // A long card (unbroken word, long back) is the worst case for the narrow table.
    const db = adminClient()!;
    const { data: mine } = await db
      .from("flashcards")
      .select("owner_id,topic_id")
      .eq("front", `${run} first`)
      .single()
      .throwOnError();
    await db
      .from("flashcards")
      .insert({
        ...mine,
        origin: "student",
        kind: "term",
        front: `${run} long Supercalifragilisticexpialidociousmonetarypolicytransmission mechanism`,
        back: "A long answer about how changes in the cash rate flow through lending rates, asset prices, the exchange rate and expectations to aggregate demand and, eventually, inflation. ".repeat(
          3,
        ),
      })
      .throwOnError();
    await page.reload();
    await expect(page.getByText(`${run} long`).first()).toBeVisible();
    const desktop = page.viewportSize()!;
    await page.setViewportSize({ width: 400, height: 800 });
    const table = page.getByRole("table", { name: "My cards", exact: true });
    await expect(table).toBeVisible();
    await expect
      .poll(() =>
        table
          .locator("..")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    for (const name of ["Front", "Back", "Actions"]) {
      await expect(
        table.getByRole("columnheader", { name, exact: true }),
      ).toBeVisible();
    }
    for (const name of ["Topic", "Kind", "Seen / %", "Next due", "Updated"]) {
      await expect(
        table.getByRole("columnheader", { name, exact: true }),
      ).toBeHidden();
    }
    await expect(
      table.getByRole("checkbox", { name: `Select ${run} first`, exact: true }),
    ).toBeVisible();
    await expect(
      table.getByRole("button", {
        name: `Actions for ${run} first`,
        exact: true,
      }),
    ).toBeVisible();
    await page.setViewportSize(desktop);
    // The long card has done its job; the delete flow below counts two cards.
    await db
      .from("flashcards")
      .delete()
      .eq(
        "front",
        `${run} long Supercalifragilisticexpialidociousmonetarypolicytransmission mechanism`,
      )
      .throwOnError();
    await page.reload();
    await front(page, "first").click();
    await expect(dialog.getByRole("combobox", { name: "Topic" })).toHaveText(
      "Inflation",
    );
    await dialog.getByLabel("Front", { exact: true }).fill(`${run} edited`);
    await dialog
      .getByLabel("Back", { exact: true })
      .fill("A sustained rise in prices");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(front(page, "edited")).toBeVisible();
    // The same front with different case and punctuation is its own duplicate.
    await page
      .getByRole("button", { name: "Add card", exact: true })
      .first()
      .click();
    await choose(page, "Topic", "Inflation");
    await dialog.getByLabel("Front", { exact: true }).fill(`${run} EDITED!`);
    await dialog.getByLabel("Back", { exact: true }).fill("Again");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "You already have this card",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await importCards(page);
    await toastUndo(page, "1 card imported.").click();
    await expect(front(page, "imported")).toHaveCount(0);
    await importCards(page);
    await page
      .getByRole("checkbox", { name: "Select all cards on this page" })
      .check();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert.getByText("Delete 2 cards?")).toBeVisible();
    await alert
      .getByRole("button", { name: "Delete cards", exact: true })
      .click();
    await toastUndo(page, "2 cards deleted.").click();
    await expect(front(page, "edited")).toBeVisible();
    await expect(front(page, "imported")).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Select all cards on this page" })
      .check();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await alert
      .getByRole("button", { name: "Delete cards", exact: true })
      .click();
    await expect(front(page, "edited")).toHaveCount(0);
    await expect(front(page, "imported")).toHaveCount(0);
    expect(aiRequests).toEqual([]);
  });
});
