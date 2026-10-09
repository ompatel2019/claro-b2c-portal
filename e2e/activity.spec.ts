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

  test("at 400px the legend clears the floating feedback button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await signIn(page);
    const more = page.getByText("More", { exact: true });
    // Worst case: the legend sits on the bottom edge, next to the button.
    await more.evaluate((el) => el.scrollIntoView({ block: "end" }));
    const a = (await more.boundingBox())!;
    const b = (await page
      .getByRole("button", { name: "Feedback", exact: true })
      .boundingBox())!;
    const overlap =
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    expect(overlap).toBe(false);
  });
});
