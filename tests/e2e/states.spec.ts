import { expect, test, type Page } from "@playwright/test";
import { login, seedChild } from "./helpers";

async function cleanupChild(page: Page, nickname: string) {
  const headers = { authorization: `Bearer ${process.env.E2E_TOKEN ?? "test-token"}` };
  const response = await page.request.get("/api/state", { headers });
  if (!response.ok()) return;
  const state = (await response.json()) as { children: Array<{ id: string; nickname: string }> };
  const child = state.children.find((item) => item.nickname === nickname);
  if (child) await page.request.delete(`/api/children/${child.id}`, { headers });
}

test("shows empty state and fits a phone", async ({ page }) => {
  const nickname = `小空白${Date.now()}`;
  try {
    await login(page);
    await seedChild(page, nickname);
    await page.reload();
    await page.getByLabel("孩子").selectOption({ label: nickname });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks");

    await expect(page.getByText("还没有记录。")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await cleanupChild(page, nickname);
  }
});

test("shows loading, then a retryable error", async ({ page }) => {
  const nickname = `小失败${Date.now()}`;
  try {
    await login(page);
    await seedChild(page, nickname);
    await page.reload();
    await page.getByLabel("孩子").selectOption({ label: nickname });

    let fail = true;
    await page.route("**/api/state", async (route) => {
      if (!fail) {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "internal", message: "加载失败" } }),
      });
    });

    await page.goto("/tasks");
    await expect(page.getByText("加载中…")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("加载失败");
    fail = false;
    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByText("还没有记录。")).toBeVisible();
  } finally {
    await cleanupChild(page, nickname);
  }
});
