import { expect, test } from "@playwright/test";

test("shows the shell, tabs and child switcher", async ({ page }) => {
  const seeded = await page.request.post("/api/children", {
    headers: { authorization: `Bearer ${process.env.E2E_TOKEN ?? "test-token"}` },
    data: { nickname: "小力" },
  });
  expect([201, 409]).toContain(seeded.status());

  await page.goto("/login");
  await page.getByLabel("家庭口令").fill(process.env.E2E_PASSCODE ?? "test-passcode");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/today");
  await expect(page.getByRole("heading", { name: "今天" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL((url) => url.pathname === "/today");
  await expect(page.getByRole("heading", { name: "今天" })).toBeVisible();

  await expect(page.getByRole("link", { name: "作业" })).toBeVisible();
  await expect(page.getByRole("link", { name: "表现" })).toBeVisible();
  await expect(page.getByLabel("孩子")).toBeVisible();
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/login");

  await page.goto("/today");
  await expect(page).toHaveURL((url) => url.pathname === "/login");
});
