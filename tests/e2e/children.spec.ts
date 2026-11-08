import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

const TOKEN = "test-token";

test("adds and renames a child", async ({ page }) => {
  const nickname = `小管理${Date.now()}`;
  const renamed = `${nickname}改`;
  await login(page);
  await page.getByRole("button", { name: "管理孩子" }).click();
  const dialog = page.getByRole("dialog", { name: "管理孩子" });
  await dialog.getByLabel("新孩子昵称").fill(nickname);
  await dialog.getByRole("button", { name: "添加" }).click();
  await expect(page.getByRole("option", { name: nickname })).toBeAttached();

  page.once("dialog", (prompt) => prompt.accept(renamed));
  await dialog.locator("li", { hasText: nickname }).getByRole("button", { name: "改名" }).click();
  await expect(page.getByRole("option", { name: renamed })).toBeAttached();
  await dialog.getByRole("button", { name: "关闭" }).click();
});

test("keeps orphan tasks after deleting a child", async ({ page }) => {
  const nickname = `小孤儿${Date.now()}`;
  const title = `孤儿任务${Date.now()}`;
  const today = shanghaiToday();
  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    { kind: "task", data: { child: nickname, title, body: "", type: "todo", dueDate: today, startDate: today } },
  ]);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "管理孩子" }).click();
  const dialog = page.getByRole("dialog", { name: "管理孩子" });
  page.once("dialog", (confirm) => confirm.accept());
  await dialog.locator("li", { hasText: nickname }).getByRole("button", { name: "删除" }).click();
  await expect(dialog.locator("li", { hasText: nickname })).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭" }).click();

  const row = page.locator(".task-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.locator(".orphan")).toHaveText("孤儿");

  const response = await page.request.get("/api/state", { headers: { authorization: `Bearer ${TOKEN}` } });
  const state = (await response.json()) as { tasks: { id: string; title: string }[] };
  const orphan = state.tasks.find((item) => item.title === title);
  if (orphan) await page.request.delete(`/api/tasks/${orphan.id}`, { headers: { authorization: `Bearer ${TOKEN}` } });
});
