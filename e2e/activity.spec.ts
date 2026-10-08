import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Activity heatmap", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  test("home shows a year of activity with streaks; a day links to Activity", async ({
    page,
  }) => {
    await signIn(page);
    await expect(
      page.getByText(
        /^Current streak \d+ days? · Longest \d+ days? · \d+ active days? in the last year$/,
      ),
    ).toBeVisible();
    const grid = page.getByRole("group", {
      name: "Activity over the last year",
    });
    const today = grid.locator("a[tabindex='0']");
    await expect(today).toHaveCount(1);
    expect(await grid.locator("a").count()).toBeGreaterThan(364);
    await today.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("ArrowUp");
    const day = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-day"),
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/activity\\?date=${day}$`));
  });
});
