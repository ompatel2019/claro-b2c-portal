import { expect, test } from "@playwright/test";

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page).toHaveTitle("Sign in · Claro");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByLabel("Name")).toBeVisible();
});

test("sign up validates input before calling Supabase", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Test");
  await page.getByLabel("Email").fill("student@example.com");
  await page.getByLabel("Password").fill("short");
  await page
    .getByLabel("Password")
    .evaluate((el: HTMLInputElement) => el.removeAttribute("minlength"));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Password must be at least 8 characters."),
  ).toBeVisible();
});

test("student routes stay protected when signed out", async ({ page }) => {
  for (const route of [
    "/practice",
    "/activity",
    "/profile",
    "/practice/00000000-0000-0000-0000-000000000000/results",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});
