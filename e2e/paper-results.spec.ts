import { test, expect } from "@playwright/test";
import { adminClient, signIn } from "./helpers";

test.describe("finished paper results", () => {
  let sit: { id: string; paper_id: string };
  let history: { id: string; paper_id: string }[];
  let requests: string[];
  test.beforeEach(async ({ page }) => {
    requests = [];
    test.skip(
      !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
      "Student credentials unavailable",
    );
    const db = adminClient();
    test.skip(!db, "Admin client unavailable");
    let studentId: string | undefined;
    for (let usersPage = 1; !studentId; usersPage++) {
      const { data, error } = await db!.auth.admin.listUsers({
        page: usersPage,
        perPage: 1000,
      });
      if (error) throw error;
      studentId = data.users.find(
        (u) =>
          u.email?.toLowerCase() === process.env.STUDENT_EMAIL?.toLowerCase(),
      )?.id;
      if (data.users.length < 1000) break;
    }
    test.skip(!studentId, "Test student unavailable");
    const { data: sits, error } = await db!
      .from("sessions")
      .select("id,paper_id,paper:papers!inner(title,status)")
      .eq("user_id", studentId!)
      .eq("kind", "paper")
      .not("finished_at", "is", null)
      .eq("paper.status", "live")
      .order("finished_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    test.skip(
      !sits?.length,
      "Test student has no finished paper sit; never create live papers or trigger AI",
    );
    sit = sits![0];
    const past = await db!
      .from("sessions")
      .select("id,paper_id")
      .eq("user_id", studentId!)
      .eq("paper_id", sit.paper_id)
      .eq("kind", "paper")
      .not("finished_at", "is", null)
      .order("started_at")
      .order("id");
    if (past.error) throw past.error;
    history = past.data ?? [];
    await page.route(
      /\/api\/(?:attempts\/[^/]+\/(?:mark|transcribe)|sessions\/[^/]+\/finish)(?:\?|$)/,
      async (route) => {
        requests.push(route.request().url());
        await route.abort();
      },
    );
    await signIn(page);
    await page.goto(`/student/papers/${sit.paper_id}/results`);
    await expect(
      page.getByRole("combobox", { name: "Switch sit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Section breakdown" }),
    ).toBeVisible();
  });
  test.afterEach(() => {
    expect(requests ?? []).toEqual([]);
  });
  test("shows results at mobile width without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole("combobox", { name: "Switch sit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Section breakdown" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test("opens MC questions", async ({ page }) => {
    const review = page
      .getByRole("button", { name: /^Review question / })
      .first();
    test.skip(!(await review.count()), "Finished sit has no MC answers");
    const number = (await review.getAttribute("aria-label"))!.replace(
      "Review question ",
      "",
    );
    await review.click();
    await expect(
      page.getByText(`Question ${number}`, { exact: true }),
    ).toBeVisible();
  });
  test("switches to an earlier finished sit", async ({ page }) => {
    test.skip(
      history.length < 2,
      "Paper has no finished sit history to switch",
    );
    const previousIndex = history.findIndex((s) => s.id !== sit.id);
    const previous = history[previousIndex];
    await page.getByRole("combobox", { name: "Switch sit" }).click();
    // Match the page’s chronological sit option order.
    const options = page.getByRole("option");
    await options.nth(previousIndex).click();
    await expect(page).toHaveURL(new RegExp(`sit=${previous.id}`));
    await expect(
      page.getByRole("table", { name: "Section breakdown" }),
    ).toBeVisible();
  });
});
