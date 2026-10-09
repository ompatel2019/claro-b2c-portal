import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Mock papers", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");

  test("shows the empty state or the live papers table without creating papers", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/student/papers");
    await expect(
      page.getByRole("heading", { name: "Mock papers", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Source/ })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Status/ })).toBeVisible();
    const empty = page.getByText("Mock papers are on their way.", {
      exact: true,
    });
    const table = page.getByRole("table", { name: "Mock papers" });
    await expect(empty.or(table)).toBeVisible();
    if (await empty.isVisible()) {
      await expect(
        page.getByText(
          "Topic Sprints cover the same questions in the meantime.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Start sprint", exact: true }),
      ).toHaveAttribute("href", "/student/sprint");
    } else {
      for (const name of [
        "Paper",
        "Year",
        "Time",
        "Marks",
        "Status",
        "Action",
      ]) {
        await expect(
          table.getByRole("columnheader", { name, exact: true }),
        ).toBeVisible();
      }
      await expect(table.getByRole("row").nth(1)).toBeVisible();
      for (const width of [360, 400]) {
        await page.setViewportSize({ width, height: 800 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        const container = table.locator("..");
        expect(
          await container.evaluate(
            (element) => getComputedStyle(element).overflowX,
          ),
        ).toBe("auto");
      }
    }
    await page.getByRole("combobox", { name: /^Source/ }).selectOption("hsc");
    await expect(page).toHaveURL(/source=hsc/);
    await page
      .getByRole("combobox", { name: /^Status/ })
      .selectOption("finished");
    await expect(page).toHaveURL(/status=finished/);
    await expect(
      page.getByRole("link", { name: "Clear (2)", exact: true }),
    ).toBeVisible();
  });
});
