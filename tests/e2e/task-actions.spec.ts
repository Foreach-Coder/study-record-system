import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

test("completes and deletes a task", async ({ page }) => {
  const nickname = `小操作${Date.now()}`;
  const today = shanghaiToday();
  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    { kind: "task", data: { child: nickname, title: "可勾选", body: "", type: "todo", dueDate: today, startDate: today } },
  ]);
  await page.goto("/tasks");
  await page.getByRole("button", { name: /可勾选/ }).click();
  await page.getByRole("button", { name: "完成" }).click();
  await expect(page.getByText("已完成")).toBeVisible();
  await page.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText("可勾选")).toHaveCount(0);
});
