import { expect, test, type Page } from "@playwright/test";
import { adminClient, signIn, signInAdmin } from "./helpers";

// No marking or AI. Mutations target only this run's tagged cards.
const tag = `e2e${Date.now().toString(36)}`;
async function openDialog(page: Page, button: string, heading: string) {
  await expect(async () => {
    if (!(await page.getByRole("dialog").isVisible()))
      await page.getByRole("button", { name: button, exact: true }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: heading }),
    ).toBeVisible();
  }).toPass();
}

async function choose(page: Page, label: string, option: string) {
  await expect(async () => {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await expect(
      page.getByRole("option", { name: option, exact: true }),
    ).toBeVisible();
  }).toPass();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("Admin flashcards", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !adminClient(),
    "Requires an admin account and the service key",
  );
  test.describe.configure({ mode: "serial" });
  test.setTimeout(150000);
  test.afterAll(async () => {
    const db = adminClient();
    if (db)
      await db
        .from("flashcards")
        .delete()
        .is("owner_id", null)
        .like("front", `${tag}%`)
        .throwOnError();
  });

  test("adds, edits, sorts, moves, retires, undoes and fits mobile widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1536, height: 800 });
    await signInAdmin(page);
    await page.goto("/admin/content/flashcards?status=draft");
    await expect(
      page.getByRole("heading", { name: "Flashcards", level: 1 }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByText(/^Students have made [\d,]+ cards? of their own\.$/),
    ).toBeVisible();
    await openDialog(page, "Add card", "Add card");
    const dialog = page.getByRole("dialog");
    await expect(async () => {
      await dialog
        .getByLabel("Topic", { exact: true })
        .selectOption("t3-inflation");
      await dialog
        .getByLabel("Front", { exact: true })
        .fill(`${tag} Inflation`);
      await dialog
        .getByLabel("Back", { exact: true })
        .fill("A sustained rise in the general price level.");
      await expect(dialog.getByLabel("Front", { exact: true })).toHaveValue(
        `${tag} Inflation`,
      );
      await expect(dialog.getByLabel("Topic", { exact: true })).toHaveValue(
        "t3-inflation",
      );
    }).toPass();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.goto(`/admin/content/flashcards?status=draft&q=${tag}`);
    const table = page.getByRole("table", { name: "Flashcards", exact: true });
    await expect(table.getByRole("row")).toHaveCount(2, { timeout: 60000 });
    await expect(table).toContainText("No reviews");
    await expect(async () => {
      if (!(await dialog.isVisible()))
        await table
          .getByRole("button", { name: `Edit ${tag} Inflation`, exact: true })
          .click();
      await expect(
        dialog.getByRole("heading", { name: "Edit card" }),
      ).toBeVisible();
    }).toPass();
    await dialog
      .getByLabel("Back", { exact: true })
      .fill("A sustained rise in prices, measured by the CPI.");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(table).toContainText("measured by the CPI");
    await expect(async () => {
      if (new URL(page.url()).searchParams.get("sort") !== "reviews")
        await table
          .getByRole("button", { name: "Reviews", exact: true })
          .click();
      await expect(
        table.getByRole("columnheader", { name: "Reviews", exact: true }),
      ).toHaveAttribute("aria-sort", "ascending");
    }).toPass();
    await expect(async () => {
      await table
        .getByRole("checkbox", { name: "Select all rows on this page" })
        .check();
      await expect(
        page.getByRole("button", { name: "Move to topic" }),
      ).toBeVisible();
    }).toPass();
    await openDialog(page, "Move to topic", "Move to topic");
    await dialog
      .getByLabel("Subtopic", { exact: true })
      .selectOption("t3-unemployment");
    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(table).toContainText("Unemployment");
    await table
      .getByRole("checkbox", { name: "Select all rows on this page" })
      .check();
    await page.getByRole("button", { name: "Retire", exact: true }).click();
    const alert = page.getByRole("alertdialog");
    await expect(
      alert.getByRole("heading", { name: "Retire card?" }),
    ).toBeVisible();
    await alert.getByRole("button", { name: "Retire", exact: true }).click();
    await expect(alert).toBeHidden();
    const notice = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "1 retired" });
    await notice.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Draft");
    for (const width of [360, 400]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(
        table.getByRole("columnheader", { name: "Back", exact: true }),
      ).toBeHidden();
      await expect(async () => {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }).toPass();
    }
    await table
      .getByRole("button", { name: `Edit ${tag} Inflation`, exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      dialog.getByRole("heading", { name: "Edit card" }),
    ).toBeVisible();
  });

  test("imports quoted CSV as drafts, skips duplicates and undoes its batch", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin/content/flashcards?status=draft");
    const dialog = page.getByRole("dialog");
    // The list may re-render after hydration and drop an early dialog; reopen it.
    await expect(async () => {
      await openDialog(page, "Import CSV", "Import cards · step 1 of 3");
      await dialog
        .getByLabel("Paste text", { exact: true })
        .fill(
          [
            "Front,Back,Kind",
            `${tag} GDP,"Gross domestic product, total output",term`,
            `${tag} GDP,Repeated row,term`,
            `${tag} Inflation,Already added by the first test,term`,
            `,Missing front,term`,
            `${tag} Cash rate,4.35%,stat`,
          ].join("\n"),
        );
      await expect(
        dialog.getByLabel("Paste text", { exact: true }),
      ).toHaveValue(/Cash rate/);
    }).toPass();
    await expect(async () => {
      if (
        await dialog
          .getByRole("button", { name: "Next", exact: true })
          .isVisible()
      )
        await dialog.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        dialog.getByRole("combobox", { name: "Kind column", exact: true }),
      ).toBeVisible();
    }).toPass();
    await choose(page, "Kind column", "Column 3 · Kind");
    await choose(page, "Default topic", "Inflation");
    await dialog.getByRole("button", { name: "Review", exact: true }).click();
    await expect(
      dialog.getByText("2 ready · 2 duplicates · 1 invalid", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText(/Already a Claro card/)).toBeVisible();
    await expect(dialog.getByText(/Repeated in this file/)).toBeVisible();
    await expect(dialog.getByText(/Front is empty/)).toBeVisible();
    await dialog
      .getByRole("button", { name: "Import 2 cards", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => {
        const { count } = await adminClient()!
          .from("flashcards")
          .select("id", { count: "exact", head: true })
          .like("front", `${tag}%`)
          .eq("status", "draft")
          .throwOnError();
        return count;
      })
      .toBe(3);
    const notice = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Imported 2 cards as drafts" });
    await notice.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(async () => {
        const { count } = await adminClient()!
          .from("flashcards")
          .select("id", { count: "exact", head: true })
          .like("front", `${tag}%`)
          .throwOnError();
        return count;
      })
      .toBe(1);
  });

  test("the flashcards list and editor fit mobile and sidebar widths with long text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInAdmin(page);
    await page
      .context()
      .addCookies([{ name: "sidebar_state", value: "true", url: page.url() }]);
    await page.goto("/admin/content/flashcards?status=draft");
    await openDialog(page, "Add card", "Add card");
    const dialog = page.getByRole("dialog");
    const front = `${tag} ${"W".repeat(160)}`;
    await dialog
      .getByLabel("Topic", { exact: true })
      .selectOption("t3-inflation");
    await dialog.getByLabel("Front", { exact: true }).fill(front);
    await dialog
      .getByLabel("Back", { exact: true })
      .fill(`A sustained rise in prices. ${"W".repeat(300)}`);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.goto(
      `/admin/content/flashcards?status=draft&q=${encodeURIComponent(front)}`,
    );
    const table = page.getByRole("table", { name: "Flashcards", exact: true });
    await expect(table.getByRole("row")).toHaveCount(2, { timeout: 60000 });
    for (const width of [1280, 360, 400]) {
      await page.setViewportSize({ width, height: 800 });
      await expect
        .poll(() =>
          table.evaluate(
            (t) =>
              t.parentElement!.scrollWidth <= t.parentElement!.clientWidth + 1,
          ),
        )
        .toBe(true);
      if (width === 1280) {
        for (const name of ["Front", "Back"]) {
          await expect
            .poll(() =>
              table
                .getByRole("columnheader", { name, exact: true })
                .evaluate((cell) => cell.getBoundingClientRect().width),
            )
            .toBeGreaterThanOrEqual(160);
        }
      }
      await table
        .getByRole("button", { name: `Edit ${front}`, exact: true })
        .click();
      await expect(dialog).toBeVisible();
      await expect
        .poll(() => dialog.evaluate((d) => d.scrollWidth <= d.clientWidth + 1))
        .toBe(true);
      await expect(dialog.getByLabel("Topic", { exact: true })).toHaveValue(
        "t3-inflation",
      );
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();
    }
  });
});

test("students cannot open shared-card administration", async ({ page }) => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a student account",
  );
  await signIn(page);
  await page.goto("/admin/content/flashcards");
  await expect(page).toHaveURL(/\/student$/);
});
