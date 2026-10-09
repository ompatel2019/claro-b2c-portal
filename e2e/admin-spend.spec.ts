import { expect, test, type Page } from "@playwright/test";
import { signInAdmin } from "./helpers";

const kpis = [
  "Today",
  "This month",
  "All time",
  "Avg cost per marked written answer",
];
async function chooseRange(page: Page, label: string) {
  const select = page.getByRole("combobox", { name: "Date range" });
  await expect(async () => {
    await select.click();
    await page
      .getByRole("option", { name: label, exact: true })
      .click({ timeout: 2000 });
    await expect(select).toHaveText(label);
  }).toPass({ timeout: 20000 });
}
async function ready(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: "AI spend", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-slot="card"] > dl')).toHaveCount(4);
}

test.describe("admin spend", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Needs an admin account",
  );
  test.setTimeout(180000);

  test("KPIs, markers, chart, tables and limits", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/spend");
    await ready(page);
    await expect(page).not.toHaveURL(/range=/);
    await expect(page.getByRole("combobox", { name: "Date range" })).toHaveText(
      "This month",
    );
    await expect(
      page.getByText(
        /^\d{1,2} \w{3,4} \d{4} to \d{1,2} \w{3,4} \d{4} \(Sydney, through now\) · \d+ calls$/,
      ),
    ).toBeVisible();
    for (const label of kpis)
      await expect(
        page
          .locator('[data-slot="card"] > dl')
          .getByText(label, { exact: true }),
      ).toBeVisible();
    const values = await page
      .locator('[data-slot="card"] > dl > dd:first-of-type')
      .allTextContents();
    expect(values[0]).toMatch(/^\$\d+\.\d{2}$/);
    expect(values[1]).toMatch(/^\$\d+\.\d{2}$/);
    expect(values[2]).toMatch(/^\$\d+\.\d{2} of \$100$/);
    expect(values[3]).toMatch(/^(\$\d+\.\d{2}|No marked written answers)$/);
    for (const text of [
      "80% · Evals blocked",
      "90% · All AI stops",
      "100% · Cap",
    ])
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Spend against cap" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("img", {
          name: /^Spend per day, Sydney dates, stacked by model$/,
        })
        .or(page.getByText("No spend in this range", { exact: true })),
    ).toBeVisible();
    if (await page.getByRole("img", { name: /^Spend per day/ }).count())
      await expect(page.getByRole("list", { name: "Models" })).toBeVisible();
    for (const [table, empty] of [
      ["By model", "No model spend yet"],
      ["By task", "No task spend yet"],
      ["Top students, 30 days", "No student spend in the last 30 days"],
    ]) {
      await expect(
        page
          .getByRole("table", { name: table, exact: true })
          .or(page.getByText(empty, { exact: true })),
      ).toBeVisible();
    }
    if (
      await page.getByRole("table", { name: "By task", exact: true }).count()
    ) {
      const subtotals = page.getByRole("table", { name: "Task subtotals" });
      await expect(
        subtotals.getByText("Marking only", { exact: true }),
      ).toBeVisible();
      await expect(
        subtotals.getByText("Admin and evals", { exact: true }),
      ).toBeVisible();
    }
    const rates = page
      .getByRole("heading", { name: "Rate limits", exact: true })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    for (const text of [
      "20/min and 200/hour",
      "Admins exempt",
      "20/day per student (Sydney)",
      "1 open per answer, 3 open per student",
      "Students over 150 calls in the last hour",
    ])
      await expect(rates.getByText(text, { exact: true })).toBeVisible();
    await expect(
      rates
        .getByRole("list", { name: "Students over 150 calls" })
        .or(rates.getByText("None right now", { exact: true })),
    ).toBeVisible();
    expect(await page.locator("#main").innerText()).not.toContain("@");
    await expect(
      page
        .getByRole("navigation", { name: "Admin navigation" })
        .getByRole("link", { name: "AI spend", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("range URL state including custom dates and invalid defaults", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin/spend");
    await ready(page);
    const select = page.getByRole("combobox", { name: "Date range" });
    for (const [label, value] of [
      ["Last 30 days", "30"],
      ["All time", "all"],
    ]) {
      await chooseRange(page, label);
      await expect(page).toHaveURL(new RegExp(`[?&]range=${value}(&|$)`));
      await expect(select).toHaveText(label);
    }
    await chooseRange(page, "Custom");
    await page.getByLabel("From", { exact: true }).fill("2026-10-01");
    await page.getByLabel("To", { exact: true }).fill("2026-10-09");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page).toHaveURL(/range=custom&from=2026-10-01&to=2026-10-09$/);
    await expect(select).toHaveText("Custom");
    await expect(page.getByLabel("From", { exact: true })).toHaveValue(
      "2026-10-01",
    );
    await expect(page.getByLabel("To", { exact: true })).toHaveValue(
      "2026-10-09",
    );
    await chooseRange(page, "This month");
    await expect(page).toHaveURL(/\/admin\/spend$/);
    for (const query of [
      "range=invalid",
      "range=custom",
      "from=bad&to=2026-10-09",
      "from=2026-10-09&to=2026-10-01",
      "from=2026-02-30&to=2026-10-09",
    ]) {
      await page.goto(`/admin/spend?${query}`);
      await ready(page);
      await expect(select).toHaveText("This month");
    }
  });

  for (const width of [1280, 400])
    test(`no horizontal page overflow at ${width}px for every range`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await signInAdmin(page);
      for (const query of [
        "",
        "?range=30",
        "?range=all",
        "?range=custom&from=2026-10-01&to=2026-10-09",
        "?range=invalid",
      ]) {
        await page.goto(`/admin/spend${query}`);
        await ready(page);
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.scrollingElement!.scrollWidth <= window.innerWidth + 1,
            ),
          )
          .toBe(true);
        for (const label of kpis) {
          const card = page
            .locator('[data-slot="card"] > dl')
            .getByText(label, { exact: true });
          await card.scrollIntoViewIfNeeded();
          await expect(card).toBeVisible();
        }
        // Hidden columns and wrapped labels should keep every table inside its card.
        for (const table of await page
          .locator('#main [data-slot="table-container"]')
          .all()) {
          expect(
            await table.evaluate(
              (node) => node.scrollWidth <= node.clientWidth + 1,
            ),
          ).toBe(true);
        }
      }
    });

  test("masked spend screenshots", async ({ page }) => {
    test.skip(process.env.SWEEP !== "1", "Screenshots only when SWEEP=1");
    await signInAdmin(page);
    for (const width of [1280, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/spend");
      await ready(page);
      await page.screenshot({
        path: `/workspace/claro/sweeps/claro-ml-spend-${width}.png`,
        fullPage: true,
        mask: [
          page
            .getByRole("table", { name: "Top students, 30 days", exact: true })
            .locator("tbody tr td:first-child"),
          page
            .getByRole("list", { name: "Students over 150 calls" })
            .locator("a"),
        ],
      });
    }
  });
});
