import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

function yesterday(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

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

test("delays an overdue task to today", async ({ page }) => {
  const nickname = `小顺延${Date.now()}`;
  const today = shanghaiToday();
  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    {
      kind: "task",
      data: { child: nickname, title: "昨天的作业", body: "", type: "todo", dueDate: yesterday(today), startDate: yesterday(today) },
    },
  ]);
  await page.goto("/tasks");
  await page.getByRole("button", { name: /昨天的作业/ }).click();
  const delay = page.getByRole("button", { name: "顺延到今天" });
  await expect(delay).toBeVisible();
  await delay.click();
  await expect(delay).toHaveCount(0);
  await expect(page.getByText(`${today} 截止`)).toBeVisible();
});
