import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  // E2E 共享同一个 D1 与同一个孩子命名空间，孤儿记录对所有孩子可见，
  // 并行 worker 会互相污染（例如 children 用例留下的任务会进入 today 统计）。
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.SPIKE_BASE_URL ?? "http://localhost:5173",
    channel: "chrome",
    headless: true,
  },
  webServer: process.env.SPIKE_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
