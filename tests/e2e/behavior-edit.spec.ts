import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

test("edits a behavior from its detail page", async ({ page }) => {
  const nickname = `小表现${Date.now()}`;
  const today = shanghaiToday();

  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    {
      kind: "behavior",
      data: {
        child: nickname,
        title: "主动帮同学",
        body: "## 经过\n很好",
        occurredOn: today,
        dimension: "品格",
        tone: "正向",
        source: "老师反馈",
      },
    },
  ]);
  await page.goto("/behaviors");
  await page.getByRole("button", { name: /主动帮同学/ }).click();
  await expect(page.getByRole("heading", { name: "主动帮同学" })).toBeVisible();

  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByRole("heading", { name: "编辑在校表现" })).toBeVisible();
  await page.getByLabel("标题").fill("主动帮同学（已更新）");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByRole("heading", { name: "主动帮同学（已更新）" })).toBeVisible();
});
