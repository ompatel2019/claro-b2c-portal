import { expect, test, type Page } from "@playwright/test";
import { signInAdmin } from "./helpers";
import { sydneyDay } from "../src/lib/admin";
import { dateLabel } from "../src/lib/practice";
import type { Range } from "../src/app/admin/spend/data";

const kpis = [
  "Today",
  "This month",
  "All time",
  "Avg cost per marked written answer",
];
async function expectWindow(page: Page, range: Range = "month") {
  const today = sydneyDay(new Date());
  const from =
    typeof range === "object"
      ? range.from
      : range === "30"
        ? new Date(Date.parse(today) - 29 * 86_400_000)
            .toISOString()
            .slice(0, 10)
        : `${today.slice(0, 7)}-01`;
  const to = typeof range === "object" ? range.to : today;
  const dates =
    range === "all"
      ? `(All time|\\d{1,2} \\w{3,4} \\d{4} to ${dateLabel(today)})`
      : `${dateLabel(from)} to ${dateLabel(to)}`;
  await expect(
    page
      .locator(
        `p[data-range="${typeof range === "object" ? "custom" : range}"]`,
      )
      .filter({
        hasText: new RegExp(
          `^${dates} \\(Sydney, ${to === today ? "through now" : "inclusive"}\\) · \\d+ calls(?: · Those dates aren't valid, showing this month)?$`,
        ),
      }),
  ).toBeVisible({ timeout: 30000 });
}
async function chooseRange(page: Page, label: string, range?: Range) {
  const select = page.getByRole("combobox", { name: "Date range" });
  await expect(async () => {
    await select.click();
    await page
      .getByRole("option", { name: label, exact: true })
      .click({ timeout: 2000 });
    await expect(select).toHaveText(label);
  }).toPass({ timeout: 20000 });
  if (range !== undefined) await expectWindow(page, range);
}
async function ready(page: Page, range: Range = "month") {
  await expect(
    page.getByRole("heading", { level: 1, name: "AI spend", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-slot="card"] > dl')).toHaveCount(4);
  await expectWindow(page, range);
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
    expect(values[3]).toMatch(
      /^(<\$0\.0001|\$0\.\d{4}|\$\d+\.\d{2}|No marked written answers)$/,
    );
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
      const subtotals = page.getByRole("table", {
        name: "By task",
        exact: true,
      });
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
    ] as const) {
      await chooseRange(page, label, value);
      await expect(page).toHaveURL(new RegExp(`[?&]range=${value}(&|$)`));
      await expect(select).toHaveText(label);
    }
    await chooseRange(page, "Custom");
    const fromInput = page.getByLabel("From", { exact: true });
    const toInput = page.getByLabel("To", { exact: true });
    const today = sydneyDay(new Date());
    await expect(fromInput).toHaveAttribute("min", "2020-01-01");
    await expect(fromInput).toHaveAttribute("max", today);
    await expect(toInput).toHaveAttribute("max", today);
    const tomorrow = new Date(Date.parse(today) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const [from, to] of [
      ["2019-12-31", today],
      [today, tomorrow],
      [today, "2020-01-01"],
    ]) {
      await fromInput.fill(from);
      await toInput.fill(to);
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(page).toHaveURL(/range=all$/);
      expect(
        await fromInput.evaluate((input: HTMLInputElement) =>
          input.closest("form")!.checkValidity(),
        ),
      ).toBe(false);
    }
    await fromInput.fill("2026-10-01");
    await page.getByLabel("To", { exact: true }).fill("2026-10-02");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page).toHaveURL(/range=custom&from=2026-10-01&to=2026-10-02$/);
    await expectWindow(page, { from: "2026-10-01", to: "2026-10-02" });
    await expect(select).toHaveText("Custom");
    await expect(page.getByLabel("From", { exact: true })).toHaveValue(
      "2026-10-01",
    );
    await expect(page.getByLabel("To", { exact: true })).toHaveValue(
      "2026-10-02",
    );
    await chooseRange(page, "This month", "month");
    await expect(page).toHaveURL(/\/admin\/spend$/);
    // Simulate a stale client accepting dates the server rejects. The month key
    // must change even though the previous resolved range was also month.
    await chooseRange(page, "Custom");
    await fromInput.fill("2019-12-31");
    await toInput.fill(today);
    await fromInput.evaluate((input) => input.removeAttribute("min"));
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await ready(page);
    await expect(select).toHaveText("This month");
    await expect(fromInput).toHaveCount(0);
    await expect(page.locator("p[data-range]")).toContainText(
      "Those dates aren't valid, showing this month",
    );
    for (const query of [
      "from=0001-01-01&to=2026-10-09",
      "from=9999-01-01&to=9999-01-02",
      "range=invalid",
      "range=custom",
      "from=bad&to=2026-10-09",
      "from=2026-10-09&to=2026-10-01",
      "from=2026-02-30&to=2026-10-09",
    ]) {
      await page.goto(`/admin/spend?${query}`);
      await ready(page);
      await expect(select).toHaveText("This month");
      if (query !== "range=invalid")
        await expect(page.locator("p[data-range]")).toContainText(
          "Those dates aren't valid, showing this month",
        );
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
        await ready(
          page,
          query === "?range=30"
            ? "30"
            : query === "?range=all"
              ? "all"
              : query.startsWith("?range=custom")
                ? { from: "2026-10-01", to: "2026-10-09" }
                : "month",
        );
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
        if (width === 1280) {
          const models = page.getByRole("table", {
            name: "By model",
            exact: true,
          });
          if (await models.count())
            for (const name of ["Input", "Cached", "Output tokens"])
              await expect(
                models.getByRole("columnheader", { name, exact: true }),
              ).toBeVisible();
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
          expect(
            await table.evaluate((node) => {
              const card = node
                .closest('[data-slot="card"]')!
                .getBoundingClientRect();
              const bounds = node.getBoundingClientRect();
              const content = node
                .querySelector("table")!
                .getBoundingClientRect();
              return (
                bounds.left > card.left &&
                bounds.right < card.right &&
                content.right <= bounds.right + 1
              );
            }),
          ).toBe(true);
        }
        for (const item of await page
          .getByRole("list", { name: "Models" })
          .getByRole("listitem")
          .all()) {
          expect(
            await item.evaluate((node) => {
              const bounds = node.getBoundingClientRect();
              const list = node.parentElement!.getBoundingClientRect();
              return (
                bounds.left >= list.left &&
                bounds.right <= list.right + 1 &&
                node.scrollWidth <= node.clientWidth + 1
              );
            }),
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
        path: `/workspace/claro/sweeps/claro-ml-spend-page-${width}.png`,
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
