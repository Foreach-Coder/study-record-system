import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

test("lists tasks, filters, and opens a detail", async ({ page }) => {
  const nickname = `小作业${Date.now()}`;
  const today = shanghaiToday();

  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    { kind: "task", data: { child: nickname, title: "数学口算", body: "## 要求\n一页", type: "作业", subject: "数学", dueDate: today, startDate: today } },
    { kind: "task", data: { child: nickname, title: "带跳绳", body: "", type: "todo", dueDate: today, startDate: today } },
  ]);
  await page.goto("/tasks");

  await expect(page.getByRole("heading", { name: "作业与待办" })).toBeVisible();
  await expect(page.getByRole("button", { name: /数学口算/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /带跳绳/ })).toBeVisible();

  await page.getByRole("button", { name: "作业" }).click();
  await expect(page.getByRole("button", { name: /数学口算/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /带跳绳/ })).toHaveCount(0);

  await page.getByRole("button", { name: "待办" }).click();
  await expect(page.getByRole("button", { name: /数学口算/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /带跳绳/ })).toBeVisible();

  await page.getByRole("button", { name: "全部类型" }).click();
  await expect(page.getByRole("button", { name: /数学口算/ })).toBeVisible();

  await page.getByRole("button", { name: /^已完成/ }).click();
  await expect(page.getByRole("button", { name: /数学口算/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^待做/ }).click();
  await expect(page.getByRole("button", { name: /数学口算/ })).toBeVisible();

  await page.getByRole("button", { name: /数学口算/ }).click();
  await expect(page).toHaveURL(/\/tasks\/.+/);
  await expect(page.getByRole("heading", { name: "数学口算" })).toBeVisible();
  await expect(page.getByText("数学", { exact: true })).toBeVisible();
  await expect(page.getByText(`${today} 开始`)).toBeVisible();
  await expect(page.getByText(`${today} 截止`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "要求" })).toBeVisible();

  await page.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByRole("heading", { name: "编辑作业或待办" })).toBeVisible();
  await page.getByLabel("标题").fill("数学口算（改）");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "数学口算（改）" })).toBeVisible();
});
