import { expect, test } from "@playwright/test";
import { adminClient, signIn, signInAdmin, studentId } from "./helpers";

// Read-only: never saves feedback, changes bans, opens reviews, or calls marking/AI.
test.describe("Admin student detail", () => {
  test.skip(
    !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.STUDENT_EMAIL ||
      !adminClient(),
    "Requires admin and student accounts and the service key",
  );
  test.setTimeout(120000);
  test("header, tabs, URL filters, confirmation and read-only report", async ({
    page,
  }) => {
    const id = await studentId();
    await signInAdmin(page);
    await page.goto(`/admin/students/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 60000,
    });
    await expect(
      page.getByText(process.env.STUDENT_EMAIL!, { exact: false }),
    ).toBeVisible();
    for (const label of [
      "Questions this week",
      "Average mark",
      "Streak",
      "Flashcards due",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(async () => {
      if (!(await page.getByRole("menuitem").isVisible()))
        await page.getByRole("button", { name: "More actions" }).click();
      await expect(page.getByRole("menuitem")).toBeVisible();
    }).toPass();
    const blocked =
      (await page.getByRole("menuitem").innerText()) === "Unblock";
    await expect(async () => {
      if (!(await page.getByRole("alertdialog").isVisible()))
        await page
          .getByRole("menuitem", {
            name: blocked ? "Unblock" : "Block sign-in",
            exact: true,
          })
          .click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
    }).toPass();
    await expect(page.getByRole("alertdialog")).toContainText(
      blocked
        ? "They will be able to sign in again."
        : "They won’t be able to sign in. No data is deleted.",
    );
    await expect(async () => {
      if (await page.getByRole("alertdialog").isVisible())
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    }).toPass();
    const tabs = page.getByRole("navigation", { name: "Student tabs" });
    for (const [label, value] of [
      ["Topics", "topics"],
      ["Reviews & disputes", "reviews"],
      ["Feedback", "feedback"],
      ["AI usage", "usage"],
      ["Sessions", "sessions"],
    ]) {
      await expect(async () => {
        if (new URL(page.url()).searchParams.get("tab") !== value)
          await tabs.getByRole("link", { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`tab=${value}`));
      }).toPass();
      if (value === "usage")
        await expect(page.getByText(/^\d+ of 200$/)).toBeVisible();
    }
    await expect(async () => {
      await page
        .getByRole("combobox", { name: "Kind", exact: true })
        .selectOption("sprint");
      await expect(page).toHaveURL(/kind=sprint/);
    }).toPass();
    await expect(async () => {
      await page.getByRole("link", { name: /^Clear/ }).click();
      await expect(page).not.toHaveURL(/kind=/);
    }).toPass();
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Australia/Sydney",
    });
    await expect(async () => {
      if (new URL(page.url()).searchParams.get("date") !== today)
        await page.locator(`[data-day="${today}"]`).click();
      await expect(page).toHaveURL(new RegExp(`date=${today}`));
    }).toPass();
    await expect(
      page.getByRole("link", { name: "Show all days" }),
    ).toBeVisible();
    const { data: finished, error } = await adminClient()!
      .from("sessions")
      .select("id,kind")
      .eq("user_id", id)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(error).toBeNull();
    if (finished) {
      await page.goto(
        `/admin/students/${id}?tab=sessions&session=${finished.id}`,
      );
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expect(
        sheet.getByRole("button", { name: /Retry|Question this mark/ }),
      ).toHaveCount(0);
      await expect(async () => {
        if (await sheet.isVisible()) await page.keyboard.press("Escape");
        await expect(page).not.toHaveURL(/session=/);
      }).toPass();
    }
    for (const width of [360, 400, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/admin/students/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      const table = page.getByRole("table", { name: "Sessions", exact: true });
      if ((await table.isVisible()) && width >= 1280)
        await expect
          .poll(() =>
            table.evaluate(
              (t) =>
                t.parentElement!.scrollWidth <= t.parentElement!.clientWidth,
            ),
          )
          .toBe(true);
      if ((await table.isVisible()) && width < 640)
        await expect(
          table.getByRole("columnheader", { name: "Time", exact: true }),
        ).toBeHidden();
    }
  });
  test("students cannot access another student's admin detail", async ({
    page,
  }) => {
    const id = await studentId();
    await signIn(page);
    await page.goto(`/admin/students/${id}`);
    await expect(page).toHaveURL(/\/student(?:\?|$)/);
    await expect(
      page.getByRole("button", { name: "More actions" }),
    ).toHaveCount(0);
  });
});
