import { expect, test } from "@playwright/test";
import { login, seedChild, shanghaiToday } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXYzhhY/MfAAVQAkD74OUeAAAAAElFTkSuQmCC",
  "base64",
);

test("creates a task with an uploaded image", async ({ page }) => {
  const nickname = `小录入${Date.now()}`;

  await login(page);
  await seedChild(page, nickname);
  await page.reload();
  await page.getByLabel("孩子").selectOption({ label: nickname });
  await page.getByRole("button", { name: "新增记录" }).click();
  await page.getByLabel("标题").fill("数学口算");
  await page.getByLabel("科目").selectOption("数学");
  await page.getByLabel("截止日").fill(shanghaiToday());
  await page.getByLabel("图片").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "已选图片" })).toBeVisible();
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("button", { name: /数学口算/ })).toBeVisible();
  await page.getByRole("button", { name: /数学口算/ }).click();
  await expect(page.getByRole("heading", { name: "数学口算" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "查看图片" })).not.toBeVisible();
});
