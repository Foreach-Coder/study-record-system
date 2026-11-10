import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("shows a loading indicator during network requests", async ({ page }) => {
  await login(page);
  const refreshButton = page.getByRole("button", { name: "刷新" });
  await expect(refreshButton).toBeEnabled();

  await page.route("**/api/state", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });

  const response = page.waitForResponse(
    (item) => item.url().endsWith("/api/state") && item.request().method() === "GET",
  );
  await refreshButton.click();

  await expect(page.getByText("加载中…", { exact: true })).toBeVisible();
  await response;
  await expect(page.getByText("加载中…", { exact: true })).toBeHidden();
});
