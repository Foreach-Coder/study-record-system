import { expect, type Page } from "@playwright/test";

const TOKEN = process.env.E2E_TOKEN ?? "test-token";
export const PASSCODE = process.env.E2E_PASSCODE ?? "test-passcode";

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("家庭口令").fill(PASSCODE);
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

export async function seedChild(page: Page, nickname: string): Promise<void> {
  const response = await page.request.post("/api/children", {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: { nickname },
  });
  expect([201, 409]).toContain(response.status());
}

export async function seedImport(page: Page, items: unknown[]): Promise<void> {
  const response = await page.request.post("/api/import", {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: { mode: "apply", onDuplicate: "skip", items },
  });
  expect(response.ok()).toBeTruthy();
}

export function shanghaiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
