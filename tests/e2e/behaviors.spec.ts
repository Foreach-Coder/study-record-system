import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

test("lists behaviors, shows stats, and opens a detail", async ({ page }) => {
  const nickname = `小表现${Date.now()}`;
  const today = shanghaiToday();

  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    { kind: "behavior", data: { child: nickname, title: "主动帮同学", body: "## 经过\n很好", occurredOn: today, dimension: "品格", tone: "正向", source: "老师反馈" } },
  ]);
  await page.goto("/behaviors");

  await expect(page.getByRole("heading", { name: "在校表现" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "30 天" })).toHaveAttribute("aria-selected", "true");
  const stats = page.getByLabel("表现统计");
  await expect(stats.locator("strong").nth(0)).toHaveText("1");
  await expect(stats.locator("strong").nth(1)).toHaveText("1");
  await expect(stats.locator("strong").nth(2)).toHaveText("0");
  await expect(page.getByText("主动帮同学")).toBeVisible();

  await page.getByRole("button", { name: /主动帮同学/ }).click();
  await expect(page).toHaveURL(/\/behaviors\/.+/);
  await expect(page.getByRole("heading", { name: "主动帮同学" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "经过" })).toBeVisible();
});
