import { expect, test } from "@playwright/test";
import { adminClient, signInAdmin } from "./helpers";

const tag = `e2e-papers-${Date.now().toString(36)}`;
let paperId: string | undefined;

test.describe("Admin papers", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !adminClient(),
    "Requires an admin account and the service key",
  );
  test.setTimeout(150000);
  test.beforeAll(async () => {
    // Tagged from the first write, even if the test fails before filling the form.
    const { data, error } = await adminClient()!
      .from("papers")
      .insert({
        title: `${tag} Trial`,
        origin: "claro",
        status: "draft",
        total_marks: 1,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    paperId = data!.id;
  });
  test.afterAll(async () => {
    if (!paperId) return;
    const { error } = await adminClient()!
      .from("papers")
      .delete()
      .eq("id", paperId)
      .eq("status", "draft")
      .like("title", `${tag}%`);
    expect(error).toBeNull();
  });

  test("builds and previews a draft without publishing or marking", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto(`/admin/content/papers/${paperId}`);
    await expect(page.getByLabel("Section 4 name")).toHaveValue("Section IV", {
      timeout: 60000,
    });
    await expect(async () => {
      await page.getByLabel("Time limit", { exact: true }).selectOption("120");
      await expect(page.getByLabel("Time limit", { exact: true })).toHaveValue(
        "120",
      );
    }).toPass();
    await expect(page.getByText("5 min", { exact: true })).toBeVisible();
    await expect(page.getByText("Not 100: check the paper.")).toBeVisible();
    await expect(
      page.getByText("Ranks need 20 first sits. Now: 0."),
    ).toBeVisible();
    await expect(async () => {
      await page
        .getByRole("button", { name: "Add questions", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: "Add questions" }),
      ).toBeVisible();
    }).toPass();
    const dialog = page.getByRole("dialog", { name: "Add questions" });
    await expect(async () => {
      await dialog.getByLabel("Type", { exact: true }).selectOption("short");
      await expect(dialog.getByLabel("Type", { exact: true })).toHaveValue(
        "short",
      );
    }).toPass();
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      dialog.getByRole("checkbox", { name: /^Pick / }).first(),
    ).toBeVisible();
    // Read only: pick two equal-mark questions from the same first bank page.
    const { data, error } = await adminClient()!
      .from("questions")
      .select("id,source,marks")
      .eq("type", "short")
      .eq("status", "live")
      .order("year", { ascending: false })
      .order("id")
      .limit(50);
    expect(error).toBeNull();
    const first = data!.find((q) =>
      data!.some((r) => r.id !== q.id && r.marks === q.marks),
    );
    expect(
      first,
      "Bank needs two live short-answer questions with equal marks",
    ).toBeTruthy();
    const second = data!.find(
      (q) => q.id !== first!.id && q.marks === first!.marks,
    )!;
    for (const q of [first!, second]) {
      await dialog
        .getByRole("checkbox", {
          name: `Pick ${q.source} (${q.id})`,
          exact: true,
        })
        .check();
    }
    await dialog
      .getByRole("button", { name: "Add 2 to section", exact: true })
      .click();
    for (const q of [first!, second]) {
      await page
        .getByRole("checkbox", {
          name: `Select ${q.source} (${q.id})`,
          exact: true,
        })
        .check();
    }
    await page.getByRole("button", { name: "Make ‘answer one of’" }).click();
    await expect(page.getByText(/^Choose 1: /)).toBeVisible();
    await page.getByRole("button", { name: "Preview as student" }).click();
    const preview = page.getByRole("dialog");
    await expect(
      preview.getByText("Question 2", { exact: true }),
    ).toBeVisible();
    await expect(
      preview.getByRole("button", { name: "Finish", exact: true }),
    ).toHaveCount(0);
    await preview
      .getByRole("button", { name: "Close preview", exact: true })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const db = adminClient()!;
    await expect(async () => {
      const { data: paper } = await db
        .from("papers")
        .select("status,time_limit_min,total_marks,section_names")
        .eq("id", paperId!)
        .single();
      expect(paper).toMatchObject({
        status: "draft",
        time_limit_min: 120,
        total_marks: first!.marks,
        section_names: ["Section I", "Section II", "Section III", "Section IV"],
      });
    }).toPass({ timeout: 30000 });
    // Opening publish confirmation and cancelling is read-only: never click its action.
    await expect(async () => {
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
    }).toPass();
    await expect(page.getByRole("alertdialog")).toContainText(
      "Publishing hides these 2 questions from Topic Sprints.",
    );
    await page.getByRole("button", { name: "Keep as is", exact: true }).click();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(async () => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }).toPass();
    await page.goto(`/admin/content/papers?q=${tag}`);
    const row = page
      .getByRole("table", { name: "Papers" })
      .getByRole("row")
      .filter({ hasText: `${tag} Trial` });
    await expect(row).toContainText("Draft");
    await expect(async () => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }).toPass();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(row).toContainText("0 / 0");
    // The table fits beside the sidebar without scrolling and keeps a readable title.
    const container = page.locator('[data-slot="table-container"]').first();
    await expect
      .poll(() => container.evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true);
    const title = await row.getByRole("link").first().boundingBox();
    expect(title!.width).toBeGreaterThan(120);
    const { data: paper } = await db
      .from("papers")
      .select("status")
      .eq("id", paperId!)
      .single();
    expect(paper?.status).toBe("draft");
  });
});
