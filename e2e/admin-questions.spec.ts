import { expect, test } from "@playwright/test";
import { adminClient, signInAdmin } from "./helpers";

// Every row this spec creates carries the run tag; afterAll deletes only those.
const tag = `e2e${Date.now().toString(36)}`;
const id = `${tag}-q1`;
const twin = `${tag}-q2`;

// Independent of the write/cleanup suite and requires no service key or fixtures.
test("all question tabs and search load without the error boundary", async ({
  page,
}) => {
  test.skip(!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD);
  test.setTimeout(240000);
  await signInAdmin(page);
  for (const query of [
    "?status=live",
    "?status=draft",
    "?status=review",
    "?status=retired",
    "?q=inflation",
  ]) {
    await test.step(query, async () => {
      await page.goto(`/admin/content/questions${query}`);
      await expect(
        page.getByRole("heading", { name: "Questions", exact: true }),
      ).toBeVisible({ timeout: 60000 });
      const content =
        query === "?status=review"
          ? page
              .locator('[aria-label^="Review "]')
              .first()
              .or(
                page.getByText("Nothing to review", {
                  exact: true,
                }),
              )
          : page
              .getByRole("table", { name: "Questions" })
              .or(
                page.getByText(
                  /^No (live questions|draft questions|retired questions|questions match)$/,
                ),
              );
      await expect(content).toBeVisible({ timeout: 60000 });
      await expect(page.getByText(/Couldn['’]t load this/)).toHaveCount(0);
    });
  }
});

test.describe("Admin questions", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !adminClient(),
    "Requires an admin account and the service key",
  );
  test.describe.configure({ mode: "serial" });
  test.setTimeout(150000);
  test.afterAll(async () => {
    const db = adminClient();
    if (!db) return;
    await db
      .from("questions")
      .update({ duplicate_of: null })
      .in("id", [id, twin]);
    const { error } = await db.from("questions").delete().in("id", [id, twin]);
    expect(error).toBeNull();
  });

  test("creates a draft in the editor with inline validation and ⌘S", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin/content/questions/new");
    await expect(
      page.getByRole("heading", { name: "New question" }),
    ).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByText("Not saved yet · ⌘S")).toBeVisible();
    await expect(page.getByText("Add at least one band.")).toHaveCount(0);
    // Saving an empty form lists what is missing; nothing is written.
    await expect(async () => {
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("alert").first()).toContainText(
        "Choose a subtopic.",
      );
    }).toPass();
    await expect(async () => {
      await page
        .getByLabel("Source label", { exact: true })
        .fill(`2026 Q1(b) ${tag}`);
      await expect(page.getByLabel("ID", { exact: true })).toHaveValue(
        "2026-q1b",
      );
    }).toPass();
    await page.getByLabel("ID", { exact: true }).fill(id);
    await expect(async () => {
      await page.getByRole("combobox", { name: "Topic", exact: true }).click();
      await page.getByRole("option", { name: /Inflation/ }).click();
      await expect(
        page.getByRole("combobox", { name: "Topic", exact: true }),
      ).toContainText("Inflation");
    }).toPass();
    await page
      .getByLabel("Stem")
      .fill(`${tag} Explain one cause of inflation.`);
    await page.getByLabel("Marks").fill("2");
    await page.getByRole("button", { name: "Add band" }).click();
    await page.getByLabel("Band 1 descriptor").fill("Explains a cause");
    await page.getByLabel("Band 1 min").fill("1");
    await page.getByLabel("Band 1 max").fill("2");
    await page.getByLabel("Sample answer").fill("Demand-pull inflation.");
    // Publishing is blocked by nothing now, but we keep it a draft (never visible to students).
    await page.keyboard.press("ControlOrMeta+s");
    await expect(
      page.getByText("Saved", { exact: true }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/content/questions/${id}$`));
    await expect(page.getByLabel("ID", { exact: true })).toHaveAttribute(
      "readonly",
      "",
    );
    const { data } = await adminClient()!
      .from("questions")
      .select("status,origin,criteria,marks,topic_id")
      .eq("id", id)
      .single();
    expect(data).toMatchObject({
      status: "draft",
      origin: "claro",
      marks: 2,
      topic_id: "t3-inflation",
    });
    // The preview shows the stem and the criteria table.
    await expect(
      page.getByText(`${tag} Explain one cause of inflation.`).first(),
    ).toBeVisible();
    await expect(page.getByText("Marking guidelines")).toBeVisible();
  });

  test("lists drafts with search, sorting and the import review flow", async ({
    page,
  }) => {
    // A near-identical draft lands in Import review with its closest match.
    const { error } = await adminClient()!
      .from("questions")
      .insert({
        id: twin,
        type: "short",
        topic_id: "t3-inflation",
        marks: 2,
        stem: `${tag} Explain one cause of rising inflation.`,
        criteria: [{ min: 1, max: 2, descriptor: "Explains a cause" }],
        sample_answer: "Demand-pull inflation.",
        source: `${tag} Q1(c)`,
        year: 2026,
        origin: "claro",
        status: "draft",
      });
    expect(error).toBeNull();
    await signInAdmin(page);
    await page.goto(`/admin/content/questions?status=draft&q=${tag}`);
    const table = page.getByRole("table", { name: "Questions" });
    await expect(table.getByRole("row")).toHaveCount(3, { timeout: 60000 });
    await expect(async () => {
      const params = new URL(page.url()).searchParams;
      if (params.get("sort") !== "id" || params.get("dir") !== "asc")
        await table.getByRole("button", { name: "ID", exact: true }).click();
      await expect(page).toHaveURL(/sort=id&dir=asc/);
    }).toPass();
    await expect(table.getByRole("row").nth(1)).toContainText(id);
    // Bulk bar appears with a selection; Set verb applies to the rows.
    await expect(async () => {
      const select = table.getByRole("checkbox", {
        name: "Select all rows on this page",
      });
      await select.uncheck();
      await select.check();
      await expect(page.getByText("2 selected")).toBeVisible();
    }).toPass();
    await page.getByRole("button", { name: "Set verb" }).click();
    await expect(async () => {
      await page
        .getByRole("dialog")
        .getByRole("combobox", { name: "Verb", exact: true })
        .click();
      await page.getByRole("option", { name: "Explain", exact: true }).click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("combobox", { name: "Verb", exact: true }),
      ).toContainText("Explain");
    }).toPass();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Set verb" })
      .click();
    await expect(page.getByText("2 updated")).toBeVisible();
    await expect(table.getByRole("row").nth(1)).toContainText("Explain");
    // Import review shows the pair side by side; merging retires the draft.
    await page.goto(`/admin/content/questions?status=review&q=${tag}`);
    const card = page.getByLabel(`Review ${twin}`, { exact: true });
    await expect(card.getByText(/\d+% similar/)).toBeVisible({
      timeout: 60000,
    });
    await card.getByRole("button", { name: "Merge into existing" }).click();
    await expect(page.getByText(/^Merged into /)).toBeVisible();
    const { data } = await adminClient()!
      .from("questions")
      .select("status,duplicate_of")
      .eq("id", twin)
      .single();
    expect(data).toEqual({ status: "retired", duplicate_of: id });
    // The merged draft shows its banner in the editor.
    await page.goto(`/admin/content/questions/${twin}`);
    await expect(page.getByText(`Duplicate of ${id}`)).toBeVisible();
  });
});

test("question pages fit narrow screens and Test mark stays read-only", async ({
  page,
}) => {
  test.skip(!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD);
  await signInAdmin(page);
  let aiRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/admin/test-mark")) aiRequests++;
  });
  for (const width of [360, 400, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/content/questions/new");
    await expect(
      page.getByRole("heading", { name: "New question" }),
    ).toBeVisible();
    await expect(async () => {
      await page.getByRole("tab", { name: "Test mark", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Run test mark" }),
      ).toBeDisabled();
    }).toPass();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const topic = page.getByRole("combobox", { name: "Topic", exact: true });
    await topic.click();
    const longOption = page.getByRole("option", {
      name: /Case study: globalisation/,
    });
    await expect(longOption).toBeVisible();
    expect(
      await longOption.evaluate(
        (option) => option.scrollWidth <= option.clientWidth,
      ),
    ).toBe(true);
    const popup = page.getByRole("listbox");
    expect(
      await popup.evaluate((list) => {
        const bounds = list.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= window.innerWidth;
      }),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(topic).toBeFocused();
  }
  await expect(async () => {
    await page
      .getByLabel("Source label", { exact: true })
      .fill("e2e readonly source");
    await expect(page.getByLabel("ID", { exact: true })).toHaveValue(
      "e2e-readonly-source",
    );
  }).toPass();
  await page
    .getByRole("link", { name: "Back to questions", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("alertdialog", { name: "Leave without saving?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Source label", { exact: true })).toHaveValue(
    "e2e readonly source",
  );
  await page
    .getByRole("link", { name: "Back to questions", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Leave without saving", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/content\/questions$/);
  expect(aiRequests).toBe(0);
});

test("the questions list fits beside the sidebar at 1280px", async ({
  page,
}) => {
  test.skip(!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAdmin(page);
  await page.goto("/admin/content/questions");
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible();
  await expect
    .poll(() =>
      table.evaluate(
        (t) => t.parentElement!.scrollWidth <= t.parentElement!.clientWidth,
      ),
    )
    .toBe(true);
});
