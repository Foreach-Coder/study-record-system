import { expect, test, type Page } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

const BODY = ["### 读一读", "- 朗读课文", "- 默写生字"].join("\n");

async function waitBody(page: Page, title: string, check: (body: string) => boolean) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/state");
        const data = (await response.json()) as { tasks?: { title: string; body: string }[] };
        const task = data.tasks?.find((item) => item.title === title);
        return check(task?.body ?? "");
      },
      { timeout: 20_000, intervals: [500, 1000] },
    )
    .toBe(true);
}

test("ticks a checklist item and keeps it after reload", async ({ page }) => {
  const nickname = `小清单${Date.now()}`;
  const title = `可勾清单${Date.now()}`;
  const today = shanghaiToday();
  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [{ kind: "task", data: { child: nickname, title, body: BODY, type: "homework", subject: "chinese", dueDate: today, startDate: today } }]);

  await page.goto("/tasks");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: "读一读" })).toBeVisible();

  // 普通列表先转成可勾清单
  await page.locator('summary[aria-label="更多操作"]').click();
  await page.getByRole("button", { name: "转成可勾清单" }).click();
  await expect(page.getByText("清单 0/2")).toBeVisible();

  // 勾第一项：界面立刻变，5 秒后自动保存
  const first = page.locator('li > input[type="checkbox"]').first();
  await first.check();
  await expect(page.getByText("清单 1/2")).toBeVisible();
  await expect(page.getByText("正在编辑…")).toBeVisible();
  await waitBody(page, title, (body) => body.includes("- [x] 朗读课文"));
  await expect(page.getByText(/已保存/)).toBeVisible();

  // 刷新后仍然勾着
  await page.reload();
  await expect(page.getByText("清单 1/2")).toBeVisible();
  await expect(page.locator('li > input[type="checkbox"]').first()).toBeChecked();

  // 取消勾选
  await page.locator('li > input[type="checkbox"]').first().uncheck();
  await expect(page.getByText("清单 0/2")).toBeVisible();
  await waitBody(page, title, (body) => body.includes("- [ ] 朗读课文"));
});

test("rapid ticks are all kept", async ({ page }) => {
  const nickname = `小连勾${Date.now()}`;
  const title = `连勾${Date.now()}`;
  const today = shanghaiToday();
  const body = ["- [ ] 一", "- [ ] 二", "- [ ] 三", "- [ ] 四"].join("\n");
  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [{ kind: "task", data: { child: nickname, title, body, type: "homework", subject: "chinese", dueDate: today, startDate: today } }]);

  await page.goto("/tasks");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const boxes = page.locator('li > input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await boxes.nth(2).check();
  await expect(page.getByText("清单 3/4")).toBeVisible();
  await waitBody(page, title, (value) => (value.match(/- \[x\]/g) ?? []).length === 3);

  await page.reload();
  await expect(page.getByText("清单 3/4")).toBeVisible();
  await expect(page.locator('li > input[type="checkbox"]').nth(0)).toBeChecked();
  await expect(page.locator('li > input[type="checkbox"]').nth(1)).toBeChecked();
  await expect(page.locator('li > input[type="checkbox"]').nth(2)).toBeChecked();
});


test("a new tick restarts the 2s auto-save timer", async ({ page }) => {
  const nickname = `小计时${Date.now()}`;
  const title = `计时${Date.now()}`;
  const today = shanghaiToday();
  const body = ["- [ ] 甲", "- [ ] 乙"].join("\n");
  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [{ kind: "task", data: { child: nickname, title, body, type: "homework", subject: "chinese", dueDate: today, startDate: today } }]);

  await page.goto("/tasks");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const boxes = page.locator('li > input[type="checkbox"]');
  const saved = (value: string) => (value.match(/- \[x\]/g) ?? []).length;

  await boxes.nth(0).check();
  await page.waitForTimeout(1200);
  await boxes.nth(1).check();
  await page.waitForTimeout(1000);

  // 第二次勾选把 2 秒计时重新开始，所以第一勾后 2.2 秒仍未落库
  const response = await page.request.get("/api/state");
  const data = (await response.json()) as { tasks?: { title: string; body: string }[] };
  const current = data.tasks?.find((item) => item.title === title);
  expect(saved(current?.body ?? "")).toBe(0);

  await waitBody(page, title, (value) => saved(value) === 2);
  await expect(page.getByText(/已保存/)).toBeVisible();
});