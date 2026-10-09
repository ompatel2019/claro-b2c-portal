import { expect, test } from "@playwright/test";
import {
  cleanupSessions,
  expectNoOverlap,
  expectStackedBelow,
  signIn,
} from "./helpers";

test.describe("Topic Sprint setup", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("400px controls clear feedback and the sticky summary at page end", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto("/student/sprint?type=mcq&sub=t4-fiscal&size=5");
    const start = page.getByRole("button", { name: /^Start (sprint|with)/ });
    const bar = page.locator("form").filter({ has: start });
    await expect(bar.getByText(/^\d+ questions match/)).toBeVisible();
    await expect(
      page.locator('button.fixed[aria-label="Feedback"]'),
    ).toBeHidden();
    await expect(
      page
        .locator("header")
        .getByRole("button", { name: "Feedback", exact: true }),
    ).toBeVisible();

    const summary = bar.locator("p").first();
    await expect(summary).toContainText("Economic Policies and Management");
    await expect
      .poll(() =>
        Promise.all([bar.boundingBox(), summary.boundingBox()]).then(
          ([outer, inner]) => outer!.width - inner!.width,
        ),
      )
      .toBeLessThanOrEqual(48);
    await expectStackedBelow(
      summary,
      bar.getByRole("button", { name: "Reset", exact: true }),
    );
    await expectStackedBelow(summary, start);
    const chip = page.getByRole("button", {
      name: /^National and global context for environmental management ·/,
    });
    await expect(chip).toHaveCount(1);
    await expect
      .poll(() =>
        chip.evaluate(
          (element) =>
            document.documentElement.clientWidth -
            element.getBoundingClientRect().right,
        ),
      )
      .toBeGreaterThanOrEqual(0);

    // A shared account can have someone else's unfinished sprint. Leave it alone.
    const resume = page.getByRole("link", { name: "Continue", exact: true });
    if (await resume.count()) {
      const text = page.getByText(/^You have an unfinished/);
      await expectStackedBelow(text, resume);
    }

    const topic = page.getByRole("button", {
      name: /^Economic Policies and Management/,
    });
    await topic.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(topic).toBeInViewport({ ratio: 1 });
    await expectNoOverlap(bar, topic);
    await page.getByRole("button", { name: "More filters" }).click();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const last = page.locator("label").filter({
      has: page.getByRole("radio", {
        name: "After each question (check as you go)",
      }),
    });
    await expect(last).toBeInViewport({ ratio: 1 });
    await expectNoOverlap(bar, last);
    await expect(start).toBeInViewport({ ratio: 1 });
  });

  test("filters update the live pool and summary; topics cap at two", async ({
    page,
  }) => {
    await page.goto("/student/sprint");
    const bar = page.locator("form").filter({ hasText: "questions match" });
    await expect(
      bar.getByText(/^\d+ questions match · \d+ new$/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Short answer", exact: true })
      .click();
    await expect(page.getByRole("textbox", { name: "Marks" })).toHaveValue(
      "30",
    );
    await page.getByRole("button", { name: /^Economic Issues/ }).click();
    const subs = page.getByRole("group", { name: "Economic Issues subtopics" });
    await subs.getByRole("button", { name: /^Inflation · \d+$/ }).click();
    // The year span follows the published content (HSC and A1 practice), so it is not pinned.
    await expect(bar).toContainText(
      /30 marks · 45 min · Economic Issues \(Inflation\) · \d{4}–\d{4} · Prefer new/,
    );
    // Inflation alone has fewer than 30 short-answer marks: the shortfall is explicit.
    await expect(
      page.getByRole("alert").filter({ hasText: /^Only \d+ marks match/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Start with \d+ marks$/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^The Global Economy/ }).click();
    await page.getByRole("button", { name: /^Economic Policies/ }).click();
    await expect(
      page.getByText("Up to 2 topics. Deselect one first."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Economic Policies/ }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "More filters" }).click();
    await page.getByRole("button", { name: "Last 5 years" }).click();
    await expect(page.getByText("1 filter on")).toBeVisible();
    await page.getByRole("radio", { name: /^Relaxed/ }).click();
    await expect(page.getByText("≈ 68 min")).toBeVisible();
    await page.getByRole("switch").last().click();
    await expect(bar).toContainText("Untimed");
    // The setup is remembered.
    await page.reload();
    await expect(bar).toContainText("Untimed");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(bar).toContainText(
      "20 questions · 20 marks · 20 min · Whole course",
    );
  });

  test("Source chips are HSC papers and Practice, and their counts add up", async ({
    page,
  }) => {
    await page.goto("/student/sprint?type=mcq");
    const match = page.getByText(/^\d+ questions match/).first();
    const count = async () =>
      Number((await match.textContent())!.match(/^(\d+)/)![1]);
    await expect(match).toBeVisible();
    await page.getByRole("button", { name: "More filters" }).click();
    const source = page.getByRole("group", { name: "Source" });
    await expect(
      source.getByRole("button", { name: "HSC papers" }),
    ).toBeVisible();
    await expect(
      source.getByRole("button", { name: "Practice" }),
    ).toBeVisible();
    await expect(page.getByText("Trial papers")).toHaveCount(0);
    const both = await count();
    await source.getByRole("button", { name: "Practice" }).click();
    await expect.poll(count).toBeLessThan(both);
    const hsc = await count();
    await source.getByRole("button", { name: "Practice" }).click();
    await source.getByRole("button", { name: "HSC papers" }).click();
    // Practice only: the pool moves away from the HSC-only count before it is read.
    await expect.poll(count).not.toBe(hsc);
    const practice = await count();
    expect(hsc + practice).toBe(both);
    await page.getByRole("button", { name: "Reset" }).click();
  });

  test("a prefilled link starts a sized, timed sprint in exam order", async ({
    page,
  }) => {
    await page.goto("/student/sprint?type=mcq&sub=t3-inflation&size=5");
    await expect(page.getByText("Prefilled from a link.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Questions" })).toHaveValue(
      "5",
    );
    await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
    ids.push(page.url().split("/").at(-1)!);
    await expect(page.getByText("Q 1 of 5")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Time remaining 4:5\d$/ }),
    ).toBeVisible();
    // The setup page offers to continue an unfinished sprint. Other runs share
    // the account, so the banner may point at a different one: resume ours by id.
    await page.goto("/student/sprint");
    await expect(page.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      /\/student\/sprint\/[^/]+$/,
    );
    await page.goto(`/student/sprint/${ids.at(-1)}`);
    await expect(page.getByText("Q 1 of 5")).toBeVisible();
  });

  test("no matches offers one-click fixes with counts", async ({ page }) => {
    await page.goto(
      "/student/sprint?type=extended&sub=t3-external-stability&history=flagged",
    );
    await expect(page.getByText("No questions match")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Start/ })).toBeDisabled();
    await page
      .getByRole("button", { name: /^Include seen questions \(\+\d+\)$/ })
      .click();
    await expect(page.getByText("No questions match")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /^Any/ })).toBeChecked();
  });

  test("the old /practice link redirects to the setup page", async ({
    page,
  }) => {
    await page.goto("/practice?topics=t3");
    await expect(page).toHaveURL(/\/student\/sprint\?topics=t3$/);
    await expect(
      page.getByRole("button", { name: /^Economic Issues/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
