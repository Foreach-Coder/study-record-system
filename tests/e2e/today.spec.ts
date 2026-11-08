import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

test("today shows progress and grouped tasks", async ({ page }) => {
  const nickname = `小今天${Date.now()}`;
  const today = shanghaiToday();

  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    { kind: "task", data: { child: nickname, title: "数学口算", body: "一页", type: "作业", subject: "数学", dueDate: today, startDate: today } },
    { kind: "task", data: { child: nickname, title: "补交美术", body: "", type: "todo", dueDate: today, startDate: today } },
    { kind: "task", data: { child: nickname, title: "已完成朗读", body: "", type: "todo", dueDate: today, startDate: today, completed: true } },
    { kind: "behavior", data: { child: nickname, title: "主动帮同学", body: "**很好**", occurredOn: today, dimension: "品格", tone: "正向" } },
  ]);
  await page.reload();

  await expect(page.getByRole("heading", { name: "今天", level: 1 })).toBeVisible();
  await expect(page.getByLabel("今日进度").getByText("1 / 3")).toBeVisible();
  await expect(page.getByLabel("今日进度").getByText("33%")).toBeVisible();
  await expect(page.getByRole("button", { name: /数学口算/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /已完成朗读/ })).toHaveCount(0);
  await expect(page.getByText("主动帮同学")).toBeVisible();

  await page.getByRole("button", { name: /数学口算/ }).click();
  await expect(page).toHaveURL((url) => url.pathname.startsWith("/tasks/"));
});
