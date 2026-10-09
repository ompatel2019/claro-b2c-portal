import { expect, test } from "@playwright/test";
import { adminClient, cleanupSessions, pick, signIn } from "./helpers";

test.describe("Sprint session", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  async function setUp(
    page: import("@playwright/test").Page,
    options: string[],
  ) {
    await page.goto("/student/sprint?type=mcq&sub=t3-inflation&size=5");
    await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
    for (const name of options) await page.getByRole("radio", { name }).click();
    await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
    await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
    const id = page.url().split("/").at(-1)!;
    ids.push(id);
    return id;
  }

  test("check as you go locks the answer and shows the key", async ({
    page,
  }) => {
    await setUp(page, ["After each question (check as you go)"]);
    await expect(
      page.getByText(/^Question 1 · Multiple choice · 1 mark · \d{4} HSC Q\d+/),
    ).toBeVisible();
    const check = page.getByRole("button", { name: "Check answer" });
    await expect(check).toBeDisabled();
    await pick(page, "A");
    await check.click();
    const result = page
      .getByRole("status")
      .filter({ hasText: /^(Correct|Incorrect · Answer: [ABCD])/ });
    await expect(result).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /^Option B:/ }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("navigation", { name: "Question booklet" })
        .getByRole("button", { name: /^Question 1: Answered, [01]\/1 marks$/ }),
    ).toBeVisible();
    // ⌘Enter checks the next one.
    await page.getByRole("button", { name: "Next question" }).click();
    await pick(page, "B");
    await page.keyboard.press("Control+Enter");
    await expect(
      page
        .getByRole("navigation", { name: "Question booklet" })
        .getByRole("button", { name: /^Question 2: Answered, [01]\/1 marks$/ }),
    ).toBeVisible();
  });

  test("finishes and marks automatically when time runs out", async ({
    page,
  }) => {
    const id = await setUp(page, ["Custom", "Finish and mark automatically"]);
    await pick(page, "A");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    // Leave first (leaving saves the clock), then jump it to 2 s before the 45-minute limit.
    await page.goto("/student/sprint");
    await expect(
      page.getByText(/unfinished Multiple choice sprint/),
    ).toBeVisible();
    const { error } = await adminClient()!
      .from("sessions")
      .update({ elapsed_s: 45 * 60 - 2 })
      .eq("id", id);
    expect(error).toBeNull();
    await page.goto(`/student/sprint/${id}`);
    await expect(page).toHaveURL(new RegExp(`/student/sprint/${id}/results$`), {
      timeout: 60000,
    });
  });

  test("old /practice session links redirect", async ({ page }) => {
    await page.goto(`/practice/${ids[0]}`);
    await expect(page).toHaveURL(/\/student\/sprint\/[^/]+(\/results)?$/);
  });
});
