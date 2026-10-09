import { test, expect } from "@playwright/test";
import { adminClient, signIn } from "./helpers";
test("live paper pre-start has reading time and a start confirmation", async ({
  page,
}) => {
  test.skip(!process.env.STUDENT_EMAIL, "Student credentials unavailable");
  const db = adminClient();
  test.skip(!db, "Admin client unavailable");
  const { data, error } = await db!
    .from("papers")
    .select("id")
    .eq("status", "live")
    .limit(1);
  if (error) throw error;
  test.skip(!data?.length, "No live papers; never publish test papers");
  await signIn(page);
  await page.goto(`/student/papers/${data![0].id}`);
  await expect(
    page
      .getByRole("switch", { name: "Include 5 minutes reading time" })
      .or(page.getByRole("button", { name: "Finish", exact: true }))
      .first(),
  ).toBeVisible();
  // Existing unfinished sits belong to the student; leave them untouched.
  test.skip(
    (await page.getByRole("button", { name: "Finish", exact: true }).count()) >
      0,
    "Student has an existing sit",
  );
  await expect(
    page.getByRole("switch", { name: "Include 5 minutes reading time" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Start paper" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
