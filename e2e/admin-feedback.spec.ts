import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient, signInAdmin, studentId } from "./helpers";

// Every write touches only this run's tagged rows. No marking/AI actions are invoked.
const tag = `e2e-feedback-${randomUUID()}`;
test.describe("Admin feedback inbox", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.STUDENT_EMAIL || !adminClient(),
    "Requires test accounts and the service key",
  );
  test.setTimeout(150000);
  const ids: string[] = [];
  let screenshotPath: string | undefined;
  let uploaded = false;
  test.beforeAll(async () => {
    const db = adminClient()!;
    const user = await studentId();
    screenshotPath = `${user}/${tag}.png`;
    const { error: uploadError } = await db.storage
      .from("reports")
      .upload(
        screenshotPath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
          "base64",
        ),
        { contentType: "image/png" },
      );
    if (uploadError) throw uploadError;
    uploaded = true;
    const { data, error } = await db
      .from("feedback")
      .insert([
        {
          user_id: user,
          kind: "bug",
          message: `${tag} The timer kept running after I left.`,
          page_path: "/student/sprint",
          screenshots: [screenshotPath],
        },
        {
          user_id: user,
          kind: "feature",
          message: `${tag} Could we get dark mode?`,
          page_path: "/student",
          screenshots: [],
        },
      ])
      .select("id,kind");
    if (error) throw error;
    ids.push(
      data.find((r) => r.kind === "bug")!.id,
      data.find((r) => r.kind === "feature")!.id,
    );
  });
  test.afterAll(async () => {
    const db = adminClient();
    if (!db) return;
    const errors = [];
    if (ids.length) {
      const { error } = await db
        .from("feedback")
        .delete()
        .in("id", ids)
        .like("message", `${tag}%`);
      if (error) errors.push(error);
    }
    if (uploaded && screenshotPath) {
      const { error } = await db.storage
        .from("reports")
        .remove([screenshotPath]);
      if (error) errors.push(error);
    }
    if (errors.length)
      throw new Error(
        `Tagged feedback cleanup failed: ${errors.map((e) => e.message).join("; ")}`,
      );
  });

  test("opens a deep-linked feedback sheet when its screenshot object is missing", async ({
    page,
  }) => {
    const db = adminClient()!;
    const user = await studentId();
    const message = `${tag} Unavailable screenshot ${randomUUID()}`;
    const { data, error } = await db
      .from("feedback")
      .insert({
        user_id: user,
        kind: "bug",
        message,
        screenshots: [`${user}/${randomUUID()}-missing.png`],
      })
      .select("id")
      .single();
    if (error) throw error;
    try {
      await signInAdmin(page);
      await page.goto(`/admin/feedback?id=${data.id}`);
      const sheet = page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: /Bug from/ }),
      });
      await expect(sheet.getByText(message, { exact: true })).toBeVisible({
        timeout: 60000,
      });
      await expect(
        sheet.getByText("1 screenshot is no longer available.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("Couldn't load this", { exact: false }),
      ).toHaveCount(0);
    } finally {
      const { error: cleanupError } = await db
        .from("feedback")
        .delete()
        .eq("id", data.id)
        .eq("message", message);
      if (cleanupError) throw cleanupError;
    }
  });

  test("filters, screenshot lightbox, reply/status and bulk resolution", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto(`/admin/feedback?status=new&q=${tag}`);
    const table = page.getByRole("table", { name: "Feedback", exact: true });
    await expect(
      page.getByRole("heading", { name: "Feedback", level: 1 }),
    ).toBeVisible({ timeout: 60000 });
    await expect(table.getByRole("row")).toHaveCount(3);
    // Repeat idempotent interactions until hydrated handlers produce their URL state.
    await expect(async () => {
      await page.getByRole("button", { name: "Bug", exact: true }).click();
      await expect(page).toHaveURL(/kind=bug/);
    }).toPass({ timeout: 30000 });
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(async () => {
      await page.getByRole("checkbox", { name: "Has screenshots" }).uncheck();
      await page.getByRole("checkbox", { name: "Has screenshots" }).check();
      await expect(page).toHaveURL(/shots=1/);
    }).toPass({ timeout: 30000 });
    await expect(async () => {
      await table.getByRole("link", { name: /The timer kept running/ }).click();
      await expect(page).toHaveURL(new RegExp(`id=${ids[0]}`));
    }).toPass({ timeout: 30000 });
    const sheet = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: /Bug from/ }) });
    await expect(
      sheet.getByRole("link", { name: "Page: /student/sprint" }),
    ).toBeVisible();
    await expect(async () => {
      await sheet.getByRole("button", { name: "Screenshot 1" }).click();
      await expect(
        page.getByRole("heading", { name: "Screenshot", exact: true }),
      ).toBeVisible();
    }).toPass({ timeout: 30000 });
    await page
      .getByRole("dialog")
      .filter({
        has: page.getByRole("heading", { name: "Screenshot", exact: true }),
      })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    const reply = `${tag} Thanks, fixed in the next release.`;
    await expect(async () => {
      await sheet.getByLabel("Reply to student", { exact: true }).fill(reply);
      await sheet.getByLabel("Status", { exact: true }).selectOption("triaged");
      await sheet.getByRole("button", { name: "Save", exact: true }).click();
      const { data, error } = await adminClient()!
        .from("feedback")
        .select("status,admin_note,resolved_at")
        .eq("id", ids[0])
        .single();
      expect(error).toBeNull();
      expect(data).toEqual({
        status: "triaged",
        admin_note: reply,
        resolved_at: null,
      });
    }).toPass({ timeout: 30000 });
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/id=/);
    await page.goto(`/admin/feedback?status=triaged&q=${tag}`);
    await expect(async () => {
      const selectAll = table.getByRole("checkbox", {
        name: "Select all rows on this page",
        exact: true,
      });
      await selectAll.uncheck();
      await selectAll.check();
      await expect(
        page.getByRole("button", { name: "Resolve", exact: true }),
      ).toBeVisible();
    }).toPass({ timeout: 30000 });
    await page.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(async () => {
      const { data, error } = await adminClient()!
        .from("feedback")
        .select("status,resolved_at")
        .eq("id", ids[0])
        .single();
      expect(error).toBeNull();
      expect(data!.status).toBe("resolved");
      expect(data!.resolved_at).toBeTruthy();
    }).toPass({ timeout: 30000 });
    await page.goto(`/admin/feedback?status=resolved&q=${tag}`);
    await expect(table).toContainText("The timer kept running");
    // 360–400px: only the useful message/status columns remain, and the page fits.
    for (const width of [360, 400]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(
        table.getByRole("columnheader", { name: "Page", exact: true }),
      ).toBeHidden();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    // 1280px with the sidebar: the table fits without a horizontal scroll.
    await page.setViewportSize({ width: 1280, height: 800 });
    const container = page.locator('[data-slot="table-container"]').first();
    await expect
      .poll(() => container.evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true);
    await page.goto(`/admin/feedback?status=new&q=${tag}-missing`);
    await expect(
      page.getByText("Nothing matches", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Clear filters", exact: true }),
    ).toBeVisible();
  });
});
