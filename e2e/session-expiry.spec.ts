import { test, expect } from "@playwright/test";
import { signIn, start, cleanupSessions, adminClient } from "./helpers";
test.describe("Session expiry mid-sprint", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a real student account",
  );
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test("finish after expiry keeps answers and returns after sign in", async ({
    page,
    context,
  }) => {
    await signIn(page);
    const id = await start(page, "Multiple choice", ids);
    for (const [i, option] of ["A", "B"].entries()) {
      const saved = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          r.url().includes("/rest/v1/attempts") &&
          r.ok(),
        { timeout: 30000 },
      );
      await page
        .getByRole("radio", { name: new RegExp(`^Option ${option}:`) })
        .check();
      await saved;
      await page.getByRole("button", { name: "Next question" }).click();
      await expect(page.getByText(`Question ${i + 2} of`)).toBeVisible();
    }
    const db = adminClient();
    expect(db).toBeTruthy();
    const { data: before } = await db!
      .from("attempts")
      .select("position,choice_index")
      .eq("session_id", id)
      .order("position");
    expect(before?.slice(0, 2).map((r) => r.choice_index)).toEqual([0, 1]);
    await page.route("**/auth/v1/token**", (route) =>
      route.fulfill({ status: 400, json: { error: "invalid_grant" } }),
    );
    await context.clearCookies();
    await page
      .getByRole("button", { name: "Submit sprint", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Confirm submit", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "answers are already saved" }),
    ).toBeVisible();
    await page.unroute("**/auth/v1/token**");
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
    await page.getByRole("link", { name: "Sign in again" }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await page.getByLabel("Email").fill(process.env.STUDENT_EMAIL!);
    await page.getByLabel("Password").fill(process.env.STUDENT_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/practice/${id}$`));
    await expect(page.getByText(/Question 3 of/)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Question navigator" });
    await expect(
      nav.getByRole("button", { name: "Question 1: Answered" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Question 2: Answered" }),
    ).toBeVisible();
    // Re-check the database after re-auth: answers must still be there.
    const { data: after } = await db!
      .from("attempts")
      .select("position,choice_index")
      .eq("session_id", id)
      .order("position");
    expect(after?.slice(0, 2).map((r) => r.choice_index)).toEqual([0, 1]);
  });
});
