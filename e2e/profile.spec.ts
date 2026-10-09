import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Student profile (read only)", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Needs a student account",
  );
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/student/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: "Profile", exact: true }),
    ).toBeVisible();
  });
  test("shows all cards, exact controls and read-only email", async ({
    page,
  }) => {
    for (const name of [
      "Details",
      "Password",
      "Your feedback",
      "Marks you questioned",
      "Sessions",
    ])
      await expect(
        page.getByRole("heading", { level: 2, name, exact: true }),
      ).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      process.env.STUDENT_EMAIL!,
    );
    await expect(page.getByLabel("Full name", { exact: true })).toHaveAttribute(
      "maxlength",
      "80",
    );
    await expect(page.getByLabel(/School/)).toHaveAttribute("maxlength", "120");
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    for (const name of ["Sign out", "Sign out everywhere"])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    // Never submit details, passwords, sign-outs or feedback against the shared account.
  });
  test("password visibility toggles survive hydration without entering credentials", async ({
    page,
  }) => {
    for (const label of ["Current password", "New password", "Confirm"]) {
      const field = page.getByLabel(label, { exact: true });
      await expect(async () => {
        if ((await field.getAttribute("type")) !== "text")
          await page
            .getByRole("button", {
              name: `Show ${label.toLowerCase()}`,
              exact: true,
            })
            .click();
        await expect(field).toHaveAttribute("type", "text", { timeout: 1000 });
      }).toPass({ timeout: 20000 });
      await expect(async () => {
        if ((await field.getAttribute("type")) !== "password")
          await page
            .getByRole("button", {
              name: `Hide ${label.toLowerCase()}`,
              exact: true,
            })
            .click();
        await expect(field).toHaveAttribute("type", "password", {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      await expect(field).toHaveValue("");
    }
  });
  test("history shows empty states or tables and report anchors", async ({
    page,
  }) => {
    for (const [label, empty] of [
      ["Your feedback", "Nothing sent yet."],
      ["Marks you questioned", "No marks questioned yet."],
    ]) {
      await expect(async () => {
        const table = page.getByRole("table", { name: label });
        if (await table.count()) await expect(table).toBeVisible();
        else await expect(page.getByText(empty, { exact: true })).toBeVisible();
      }).toPass({ timeout: 20000 });
    }
    const reviews = page.getByRole("table", { name: "Marks you questioned" });
    for (const link of await reviews.getByRole("link").all())
      expect(await link.getAttribute("href")).toMatch(
        /^\/student\/(sprint|papers|activity)\/.+#q-\d+$/,
      );
    const feedback = page.getByRole("table", { name: "Your feedback" });
    if (await feedback.count()) {
      await expect(async () => {
        if (
          new URL(page.url()).searchParams.get("feedback_sort") !== "status"
        ) {
          const button = feedback.getByRole("button", {
            name: "Status",
            exact: true,
          });
          if (await button.isVisible()) await button.click();
          else
            await page
              .getByRole("combobox", { name: "Sort your feedback" })
              .selectOption("status:asc");
        }
        await expect(page).toHaveURL(/[?&]feedback_sort=status(?:&|$)/, {
          timeout: 1000,
        });
        await expect(feedback.locator("th[aria-sort]")).toHaveText("Status", {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
    }
  });
  for (const width of [360, 400])
    test(`${width}px history cards fit without scrolling and show details`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [label, empty] of [
        ["Your feedback", "Nothing sent yet."],
        ["Marks you questioned", "No marks questioned yet."],
      ]) {
        const table = page.getByRole("table", { name: label, exact: true });
        await expect(
          table.or(page.getByText(empty, { exact: true })).first(),
        ).toBeVisible();
        if (!(await table.count())) continue;
        const card = table.locator('xpath=ancestor::*[@data-slot="card"]');
        const container = card.locator('[data-slot="table-container"]');
        for (const element of [card, container])
          await expect
            .poll(() =>
              element.evaluate((node) => node.scrollWidth <= node.clientWidth),
            )
            .toBe(true);
        const rows = table.locator("tbody tr");
        expect(await rows.count()).toBeGreaterThan(0);
        for (const row of await rows.all()) {
          const cell = row.locator("td").nth(label === "Your feedback" ? 2 : 1);
          const status = (await row.locator("td").nth(3).textContent())!.trim();
          expect(status).not.toBe("");
          await expect(
            cell.getByText(`Status: ${status}`, { exact: false }),
          ).toBeVisible();
          if (label === "Your feedback") {
            const reply = (await row
              .locator("td")
              .nth(4)
              .textContent())!.trim();
            expect(reply).not.toBe("");
            await expect(
              cell.getByText(`Reply from the team: ${reply}`, { exact: true }),
            ).toBeVisible();
          } else {
            await expect(cell.getByText(/^Your note:/)).toBeVisible();
          }
        }
      }
    });
  test("profile menu uses the moved route", async ({ page }) => {
    await expect(async () => {
      const profile = page.getByRole("menuitem", {
        name: "Profile",
        exact: true,
      });
      if (!(await profile.isVisible()))
        await page.getByRole("button", { name: "Account menu" }).click();
      await expect(profile).toHaveAttribute("href", "/student/profile", {
        timeout: 1000,
      });
    }).toPass({ timeout: 20000 });
  });
  for (const width of [360, 400, 1280])
    test(`${width}px has no page-level overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect(async () => {
        const sizes = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
      }).toPass({ timeout: 20000 });
    });
  test("offline banner keeps the page available", async ({ page, context }) => {
    try {
      await expect(async () => {
        await context.setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event("offline")));
        await expect(
          page.getByText("You're offline. We'll save when you're back.", {
            exact: true,
          }),
        ).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20000 });
    } finally {
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    }
  });
});
