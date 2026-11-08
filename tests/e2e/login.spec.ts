import { expect, test } from "@playwright/test";

test("redirects to login and accepts the family passcode", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL((url) => url.pathname === "/login");

  await page.getByLabel("家庭口令").fill("wrong");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByRole("alert")).toContainText("口令不对");

  await page.getByLabel("家庭口令").fill(process.env.E2E_PASSCODE ?? "test-passcode");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page).toHaveURL(/\/today$/);
});
