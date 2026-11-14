import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

async function waitBody(page: Page, title: string, check: (body: string) => boolean) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/state");
        const data = (await response.json()) as { tasks?: { title: string; body: string }[] };
        const task = data.tasks?.find((item) => item.title === title);
        return check(task?.body ?? "");
      },
      { timeout: 20_000, intervals: [200, 400] },
    )
    .toBe(true);
}

test("a tick made while saving never flashes the old progress", async ({ page }) => {
  const nickname = `小连勾${Date.now()}`;
  const title = `连勾${Date.now()}`;
  const today = shanghaiToday();
  const body = ["- [ ] 甲", "- [ ] 乙", "- [ ] 丙", "- [ ] 丁"].join("\n");

  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    { kind: "task", data: { child: nickname, title, body, type: "homework", subject: "chinese", dueDate: today, startDate: today } },
  ]);

  // 让每次 PATCH 慢 500ms，制造“保存进行中又被编辑”的窗口
  await page.route("**/api/tasks/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await page.goto("/tasks");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const boxes = page.locator('li > input[type="checkbox"]');
  await expect(boxes).toHaveCount(4);

  // 记录页面上的进度文本变化序列
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __prog: string[] }).__prog = log;
    const timer = setInterval(() => {
      const value = document.querySelector(".progress")?.textContent?.trim() ?? "";
      if (log[log.length - 1] !== value) log.push(value);
    }, 40);
    (window as unknown as { __progStop: () => void }).__progStop = () => clearInterval(timer);
  });

  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.getByText("清单 2/4")).toBeVisible();

  // 2 秒防抖到点，请求发出（被延迟 500ms），此时再勾第三个
  await page.waitForTimeout(2100);
  await boxes.nth(2).check();
  await expect(page.getByText("清单 3/4")).toBeVisible();

  await waitBody(page, title, (value) => (value.match(/- \[x\]/g) ?? []).length === 3);
  await expect(page.getByText(/已保存/)).toBeVisible();

  const seq = await page.evaluate(() => {
    (window as unknown as { __progStop: () => void }).__progStop();
    return (window as unknown as { __prog: string[] }).__prog;
  });

  const firstThree = seq.indexOf("清单 3/4");
  const lastTwo = seq.lastIndexOf("清单 2/4");
  expect(firstThree).toBeGreaterThan(-1);
  // 3/4 出现之后不允许再回退成 2/4
  expect(lastTwo).toBeLessThan(firstThree);
});
