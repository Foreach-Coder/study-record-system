import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

type TestEnv = typeof env & { TEST_MIGRATIONS: { name: string; queries: string[] }[] };
const BASE = "http://example.com";
const HEADERS = { authorization: "Bearer test-token", "content-type": "application/json", origin: BASE };

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
  await env.DB.prepare("INSERT INTO children (id, nickname, created_at, updated_at) VALUES ('c1', '李律研', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')").run();
});

async function create(over: Record<string, unknown> = {}) {
  const response = await SELF.fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      childId: "c1", title: "熟读拼音", body: "### 读什么\n三表", type: "作业", subject: "语文",
      dueDate: "2026-11-08", images: [], ...over,
    }),
  });
  return { response, body: await response.json() as { id: string; startDate: string; completed: boolean } };
}

describe("tasks", () => {
  it("creates a task, defaults startDate to today, and deduplicates", async () => {
    const first = await create();
    expect(first.response.status).toBe(201);
    expect(first.body.startDate).toBe("2026-11-07");
    expect((await create()).response.status).toBe(409);
    expect((await create({ dueDate: "2026-11-09" })).response.status).toBe(201);
  });

  it("updates completion and reads it back", async () => {
    const { body } = await create({ title: "更新测试" });
    const response = await SELF.fetch(`${BASE}/api/tasks/${body.id}`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify({ checked: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ completed: true, checked: true });
  });

  it("deletes a task", async () => {
    const { body } = await create({ title: "删除测试" });
    const response = await SELF.fetch(`${BASE}/api/tasks/${body.id}`, { method: "DELETE", headers: HEADERS });
    expect(response.status).toBe(204);
    expect((await SELF.fetch(`${BASE}/api/tasks/${body.id}`, { method: "PATCH", headers: HEADERS, body: "{}" })).status).toBe(404);
  });

  it("rejects a homework without a subject", async () => {
    expect((await create({ subject: "", title: "无科目" })).response.status).toBe(422);
  });
});
