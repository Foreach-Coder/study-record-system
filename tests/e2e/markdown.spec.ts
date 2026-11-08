import { expect, test } from "@playwright/test";
import { login, seedChild, seedImport, shanghaiToday } from "./helpers";

test("renders sanitized markdown and strips unsafe attributes", async ({ page }) => {
  const nickname = `小正文${Date.now()}`;
  const today = shanghaiToday();

  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await seedImport(page, [
    {
      kind: "task",
      data: {
        child: nickname,
        title: "正文测试",
        body: [
          "## 小标题",
          "**加粗**",
          '<span style="color:red">内联样式</span>',
          '<img srcset="/x.png 1x" src="/media/x.png">',
          "<script>alert(1)</script>",
        ].join("\n"),
        type: "todo",
        dueDate: today,
        startDate: today,
      },
    },
  ]);
  await page.goto("/tasks");

  await page.getByRole("button", { name: /正文测试/ }).click();
  await expect(page.getByRole("heading", { name: "小标题" })).toBeVisible();
  await expect(page.getByText("加粗")).toBeVisible();
  await expect(page.getByText("内联样式")).toBeVisible();
  await expect(page.locator(".markdown [style]")).toHaveCount(0);
  await expect(page.locator(".markdown [srcset]")).toHaveCount(0);
  await expect(page.locator(".markdown script")).toHaveCount(0);
});
