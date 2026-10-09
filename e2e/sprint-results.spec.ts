import { expect, test } from "@playwright/test";
import { cleanupSessions, finish, pick, signIn } from "./helpers";

test.describe("Sprint results", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });

  test("header, KPIs, question strip with J / K, table and same setup again", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/student/sprint?type=mcq&sub=t3-inflation&size=5");
    await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
    await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
    await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
    ids.push(page.url().split("/").at(-1)!);
    for (let i = 0; i < 5; i++) {
      await pick(page, "A");
      if (i < 4)
        await page.getByRole("button", { name: "Next question" }).click();
    }
    await finish(page);

    await expect(
      page.getByRole("heading", {
        name: /^Multiple choice sprint · Inflation$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^\w{3} \d+ \w{3}, \d+:\d{2} [ap]m · \d+:\d{2}( of \d+:\d{2}| over time)?$/,
      ),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ \/ 5 · \d+%$/)).toBeVisible();
    await expect(page.getByText(/^[0-5] \/ 5$/)).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(
      page.getByText("Overall feedback", { exact: true }),
    ).toBeVisible();

    const strip = page.getByRole("navigation", { name: "Questions" });
    const chips = strip.getByRole("button");
    await expect(chips).toHaveCount(5);
    const current = strip.locator('[aria-current="true"]');
    const label = (await current.getAttribute("aria-label"))!;
    const n = Number(label.match(/^Question (\d+)/)![1]);
    // Opens on the first question below full marks (or Q1 when all are right).
    const below = await chips.evaluateAll((els) =>
      els.findIndex((e) =>
        / 0 \/ 1 marks/.test(e.getAttribute("aria-label") ?? ""),
      ),
    );
    expect(n).toBe(below === -1 ? 1 : below + 1);
    await expect(page.getByText("Your answer", { exact: true })).toBeVisible();

    // The key listener attaches on hydration: press until the selection moves (once).
    const next = n < 5 ? n + 1 : n - 1;
    const selected = strip.locator('[aria-current="true"]');
    await expect(async () => {
      if (
        (await selected.getAttribute("aria-label"))!.startsWith(
          `Question ${n},`,
        )
      )
        await page.keyboard.press(n < 5 ? "k" : "j");
      await expect(selected).toHaveAttribute(
        "aria-label",
        new RegExp(`^Question ${next},`),
        { timeout: 1000 },
      );
    }).toPass({ timeout: 20000 });
    await expect(
      page.getByText(new RegExp(`^Question ${next}$`)),
    ).toBeVisible();

    await page.getByRole("button", { name: "Table view" }).click();
    await expect(page.getByRole("row")).toHaveCount(6);
    await expect(
      page.getByRole("columnheader", { name: "Status" }),
    ).toBeVisible();

    const mistakes = page.getByRole("link", {
      name: /^Practise mistakes \(\d\)$/,
    });
    if (below !== -1)
      await expect(mistakes).toHaveAttribute("href", /history=mistakes/);
    else await expect(mistakes).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Back to activity" }),
    ).toHaveAttribute("href", "/activity");

    await page.getByRole("button", { name: "Same setup again" }).click();
    await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
    ids.push(page.url().split("/").at(-1)!);
    await expect(page.getByText(/^Q 1 of 5$/)).toBeVisible();
  });
});
