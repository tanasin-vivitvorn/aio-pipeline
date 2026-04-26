import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Uploaded App Demo/i);
  await expect(page.getByRole("heading", { name: "Uploaded App Demo" })).toBeVisible();
});

test("health endpoint works", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.ok).toBe(true);
});
