import { expect, test } from "@playwright/test";
import { signIn, signInAdmin } from "./helpers";

// Read-only: no fixtures, marking, or AI calls.
test.describe("Admin students list", () => {
  test.skip(
    !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.STUDENT_EMAIL,
    "Requires admin and student accounts",
  );
  test.setTimeout(120000);

  test("filters, sorts, pages, selects and exports current filters", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2560, height: 1000 });
    await signInAdmin(page);
    await page.goto("/admin/students");
    await expect(
      page.getByRole("heading", { name: "Students", level: 1 }),
    ).toBeVisible({ timeout: 60000 });
    const table = page.getByRole("table", { name: "Students" });
    for (const header of [
      "Name",
      "Email",
      "Year",
      "School",
      "Joined",
      "Last active",
      "Sessions 7d",
      "Sessions total",
      "Questions answered",
      "Avg % (30 days)",
      "Streak",
      "Open disputes",
      "AI spend (all time)",
      "Blocked",
    ])
      await expect(
        table.getByRole("button", { name: header, exact: true }),
      ).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "Last active" }),
    ).toHaveAttribute("aria-sort", "descending");
    expect(await table.getByRole("row").count()).toBeLessThanOrEqual(51);
    // Exercise real paging where the install has multiple pages; otherwise assert the disabled state.
    const next = page.getByRole("button", { name: "Next", exact: true });
    if (await next.isEnabled()) {
      await expect(async () => {
        if (new URL(page.url()).searchParams.get("page") !== "2")
          await next.click();
        await expect(page).toHaveURL(/[?&]page=2/);
      }).toPass();
      await expect(page.getByText(/^Page 2 of/)).toBeVisible();
      expect(await table.getByRole("row").count()).toBeLessThanOrEqual(51);
    } else await expect(next).toBeDisabled();
    const email = process.env.STUDENT_EMAIL!;
    await expect(async () => {
      await page.getByLabel("Search", { exact: true }).fill(email);
      await page.getByLabel("Search", { exact: true }).press("Enter");
      await expect(table.getByRole("row")).toHaveCount(2);
      await expect(page).not.toHaveURL(/[?&]page=2/);
    }).toPass();
    await expect(async () => {
      if (new URL(page.url()).searchParams.get("sort") !== "name")
        await table.getByRole("button", { name: "Name", exact: true }).click();
      await expect(
        table.getByRole("columnheader", { name: "Name" }),
      ).toHaveAttribute("aria-sort", "ascending");
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Year", { exact: true }).selectOption("11");
      await expect(page).toHaveURL(/[?&]year=11/);
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Year", { exact: true }).selectOption("");
      await expect(table.getByRole("row")).toHaveCount(2);
    }).toPass();
    await expect(async () => {
      if (new URL(page.url()).searchParams.get("disputes") !== "1") {
        await page.getByLabel("Has open disputes").uncheck();
        await page.getByLabel("Has open disputes").check();
      }
      await expect(page).toHaveURL(/[?&]disputes=1/);
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Activity", { exact: true }).selectOption("never");
      await expect(page).toHaveURL(/[?&]activity=never/);
    }).toPass();
    const query = new URL(page.url()).search;
    const filtered = await page.request.get(`/admin/students/export${query}`);
    expect(filtered.ok()).toBe(true);
    expect(filtered.headers()["content-type"]).toContain("text/csv");
    expect((await filtered.text()).split("\r\n").length - 1).toBe(
      Math.max(0, (await table.getByRole("row").count()) - 1),
    );
    await expect(async () => {
      await page.getByRole("link", { name: /^Clear \(/ }).click();
      await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Has open disputes")).not.toBeChecked();
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Search", { exact: true }).fill(email);
      await page.getByLabel("Search", { exact: true }).press("Enter");
      await expect(table.getByRole("row")).toHaveCount(2);
    }).toPass();
    await expect(async () => {
      await page
        .getByRole("checkbox", { name: "Select all rows on this page" })
        .check();
      await expect(page.getByRole("status")).toContainText("1 selected");
    }).toPass();
    await expect(async () => {
      await page.getByRole("button", { name: "More actions" }).click();
      await expect(
        page.getByRole("menuitem", { name: "Export CSV" }),
      ).toBeVisible();
    }).toPass();
    const href = await page
      .getByRole("menuitem", { name: "Export CSV" })
      .getAttribute("href");
    const exported = await page.request.get(href!);
    const lines = (await exported.text()).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(email);
    await page.keyboard.press("Escape");
    await table.getByRole("row").nth(1).getByRole("cell").nth(3).click();
    await expect(page).toHaveURL(/\/admin\/students\/[0-9a-f-]{36}$/);
  });

  test("1280px fits the directory with the sidebar visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 850 });
    await signInAdmin(page);
    await page.goto("/admin/students");
    await expect(
      page.locator('[data-slot="sidebar"][data-state="expanded"]'),
    ).toBeVisible();
    const table = page.getByRole("table", { name: "Students" });
    await expect(table).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "Email", exact: true }),
    ).toBeVisible();
    await expect(
      table.getByRole("columnheader", {
        name: "School",
        exact: true,
        includeHidden: true,
      }),
    ).toBeHidden();
    await expect
      .poll(() =>
        table.evaluate((el) => {
          const container = el.closest('[data-slot="table-container"]')!;
          return container.scrollWidth <= container.clientWidth;
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    const details = table.locator("details").first();
    await details.locator("summary").click();
    await expect(details.getByText("School", { exact: true })).toBeVisible();
    await expect(
      details.getByText("Sessions total", { exact: true }),
    ).toBeVisible();
    await expect(
      details.getByText("AI spend (all time)", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        table.evaluate((el) => {
          const container = el.closest('[data-slot="table-container"]')!;
          return container.scrollWidth <= container.clientWidth;
        }),
      )
      .toBe(true);
  });

  test("fits mobile widths and keeps detail keyboard accessible", async ({
    page,
  }) => {
    await signInAdmin(page);
    for (const width of [360, 400]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(
        `/admin/students?q=${encodeURIComponent(process.env.STUDENT_EMAIL!)}`,
      );
      const table = page.getByRole("table", { name: "Students" });
      await expect(table).toBeVisible();
      await expect(
        table.getByRole("columnheader", { name: "Email", includeHidden: true }),
      ).toBeHidden();
      await expect(async () => {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }).toPass();
      const details = table.locator("details").first();
      await details.locator("summary").click();
      await expect(
        details.getByText(process.env.STUDENT_EMAIL!, { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          table.evaluate((el) => {
            const container = el.closest('[data-slot="table-container"]')!;
            return container.scrollWidth <= container.clientWidth;
          }),
        )
        .toBe(true);
    }
    await page
      .getByRole("table", { name: "Students" })
      .getByRole("link")
      .focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/students\/[0-9a-f-]{36}$/);
  });
});

test("students cannot read the directory or CSV", async ({ page }) => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a student account",
  );
  await signIn(page);
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/student$/);
  const response = await page.request.get("/admin/students/export", {
    maxRedirects: 0,
  });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.headers()["content-type"] ?? "").not.toContain("text/csv");
});

test("signed-out visitors cannot export students", async ({ request }) => {
  const response = await request.get("/admin/students/export", {
    maxRedirects: 0,
  });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.headers()["content-type"] ?? "").not.toContain("text/csv");
});
