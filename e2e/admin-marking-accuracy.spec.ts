import { expect, test, type Page } from "@playwright/test";

async function signInAdmin(page: Page) {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(admin)?$/, { timeout: 30000 });
}
const noOverflow = (page: Page) =>
  page.evaluate(
    () => document.scrollingElement!.scrollWidth <= window.innerWidth + 1,
  );
const kpis = [
  "Check agreement",
  "Settled by second pass",
  "Sent to review",
  "Override rate",
];
/** These sections render either a heading or an EmptyState title paragraph. */
async function expectSectionOrEmpty(
  page: Page,
  heading: string,
  empty: RegExp,
) {
  await expect(
    page
      .getByRole("heading", { level: 2, name: heading, exact: true })
      .or(page.locator('[data-slot="card"] > p').filter({ hasText: empty })),
  ).toBeVisible();
}

test.describe("admin marking accuracy", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Needs an admin account",
  );
  test.setTimeout(120000);

  test("KPIs, charts, tables and the eval card render for the default 30-day range", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin/marking/accuracy");
    await expect(
      page.getByRole("heading", { level: 1, name: "Marking accuracy" }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page).not.toHaveURL(/range=/);
    await expect(page.getByRole("combobox", { name: "Date range" })).toHaveText(
      /30 days/,
    );
    await expect(
      page.getByText(
        /^\d{1,2} \w{3,4} \d{4} to \d{1,2} \w{3,4} \d{4} \(Sydney, through now\) · \d+ marked written answers · \d+ checked$/,
      ),
    ).toBeVisible();
    for (const label of kpis)
      await expect(
        page
          .locator('[data-slot="card"] > dl')
          .getByText(label, { exact: true }),
      ).toBeVisible();
    // Four KPI cards; every value is a percentage or a word, never a dash.
    const values = page.locator("dl > dd:first-of-type");
    await expect(values).toHaveCount(4);
    for (const value of await values.allTextContents())
      expect(value).toMatch(
        /^(\d+\.\d%|No (checked answers|comparable reviews) yet)$/,
      );
    // Weekly chart headings remain visible even when their content is empty.
    for (const heading of [
      "Agreement per week",
      "Disputes per 100 written answers",
    ])
      await expect(
        page.getByRole("heading", { level: 2, name: heading, exact: true }),
      ).toBeVisible();
    await expectSectionOrEmpty(
      page,
      "Check status mix",
      /^No checked answers yet$/,
    );
    await expectSectionOrEmpty(
      page,
      "By type and marks",
      /^No data by type and marks$/,
    );
    await expectSectionOrEmpty(page, "By topic", /^No data by topic$/);
    await expectSectionOrEmpty(
      page,
      "Most disagreed questions",
      /^No questions with 3 checked answers yet$/,
    );
    await expectSectionOrEmpty(
      page,
      "Latest offline eval",
      /^No full offline eval yet$/,
    );
    for (const label of [
      "By type and marks",
      "By topic",
      "Most disagreed questions",
    ]) {
      const table = page.getByRole("table", { name: label, exact: true });
      if (!(await table.count())) continue;
      const rows = await table.getByRole("row").count();
      for (const button of await table
        .getByRole("columnheader")
        .getByRole("button")
        .all()) {
        await button.click();
        await expect(button.locator("..")).toHaveAttribute(
          "aria-sort",
          "ascending",
        );
        await button.click();
        await expect(button.locator("..")).toHaveAttribute(
          "aria-sort",
          "descending",
        );
        await button.click();
        await expect(button.locator("..")).not.toHaveAttribute("aria-sort");
        await expect(table.getByRole("row")).toHaveCount(rows);
      }
    }
    const evaluation = page.getByRole("heading", {
      level: 2,
      name: "Latest offline eval",
    });
    if (await evaluation.count()) {
      const card = evaluation.locator(
        'xpath=ancestor::*[@data-slot="card"][1]',
      );
      await expect(card.getByText(/^Exact mark: \d+\.\d%/)).toBeVisible();
      await expect(
        card.getByText("Agreement (same band, ±1 on 6+)", { exact: true }),
      ).toBeVisible();
      await expect(card.getByText(/\d+ test answers$/)).toBeVisible();
      await expect(card.locator("p")).not.toBeEmpty();
      await expect(card).not.toContainText("Within ±1 mark");
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const agreement = page
      .getByRole("heading", { level: 2, name: "Agreement per week" })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    const disputes = page
      .getByRole("heading", {
        level: 2,
        name: "Disputes per 100 written answers",
      })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    await expect
      .poll(async () => {
        const a = await agreement.boundingBox();
        const d = await disputes.boundingBox();
        return a && d ? Math.abs(a.height - d.height) : Infinity;
      })
      .toBeLessThanOrEqual(1);
    await expect(
      page.getByRole("link", { name: "Open Engine" }),
    ).toHaveAttribute("href", "/admin/marking/engine");
    await expect(
      page
        .getByRole("navigation", { name: "Admin navigation" })
        .getByRole("link", { name: "Accuracy" }),
    ).toHaveAttribute("aria-current", "page");
    // Read-only aggregate page: no student emails anywhere in the main content.
    expect(await page.locator("#main").innerText()).not.toMatch(/@/);
  });

  test("the range select updates the URL and the page", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/marking/accuracy");
    const select = page.getByRole("combobox", { name: "Date range" });
    await expect(select).toHaveText(/30 days/);
    const summary = page.getByText(/\(Sydney, through now\)/);
    const before = await summary.textContent();
    // Retry the first open until the client has hydrated.
    await expect(async () => {
      await select.click();
      await page
        .getByRole("option", { name: "7 days" })
        .click({ timeout: 2000 });
      await expect(page).toHaveURL(/[?&]range=7(&|$)/, { timeout: 5000 });
    }).toPass({ timeout: 20000 });
    await expect(select).toHaveText(/7 days/);
    await expect(summary).not.toHaveText(before!);
    await select.click();
    await page.getByRole("option", { name: "90 days" }).click();
    await expect(page).toHaveURL(/[?&]range=90(&|$)/);
    await expect(select).toHaveText(/90 days/);
    await page.goto("/admin/marking/accuracy?range=7");
    await expect(select).toHaveText(/7 days/);
    await page.goto("/admin/marking/accuracy?range=14");
    await expect(select).toHaveText(/30 days/);
  });

  test("fits 390–400px phones without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAdmin(page);
    await page.goto("/admin/marking/accuracy");
    await expect(
      page.getByRole("heading", { level: 1, name: "Marking accuracy" }),
    ).toBeVisible({ timeout: 30000 });
    for (const label of kpis) {
      const card = page
        .locator('[data-slot="card"] > dl')
        .getByText(label, { exact: true });
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
    }
    await page
      .getByRole("link", { name: "Open Engine" })
      .scrollIntoViewIfNeeded();
    for (const width of [390, 400]) {
      await page.setViewportSize({ width, height: 844 });
      for (const range of [7, 30, 90]) {
        await page.goto(`/admin/marking/accuracy?range=${range}`);
        await expect(
          page.getByRole("combobox", { name: "Date range" }),
        ).toHaveText(`${range} days`);
        expect(await noOverflow(page)).toBe(true);
      }
    }
  });
});
