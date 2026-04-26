import { test, expect } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:8888";

test("home page loads", async ({ page }) => {
  await page.goto(BASE);
  await expect(page).toHaveTitle(/Uploaded App Demo/i);
  await expect(page.getByRole("heading", { name: "Uploaded App Demo" })).toBeVisible();
});

test("health endpoint returns ok", async ({ request }) => {
  const res = await request.get(`${BASE}/health`);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.name).toBe("uploaded-app-demo");
});