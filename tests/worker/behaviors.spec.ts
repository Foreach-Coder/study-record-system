import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInShanghai } from "../../src/shared/dates";

type TestEnv = typeof env & { TEST_MIGRATIONS: { name: string; queries: string[] }[] };
const BASE = "http://example.com";
const HEADERS = { authorization: "Bearer test-token", "content-type": "application/json", origin: BASE };
const TODAY = todayInShanghai();
const TOMORROW = addDays(TODAY, 1);

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
  await env.DB.prepare("INSERT INTO children (id, nickname, created_at, updated_at) VALUES ('c1', '李律研', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')").run();
});

type BehaviorBody = { id: string } & Record<string, unknown>;

async function create(over: Record<string, unknown> = {}) {
  const response = await SELF.fetch(`${BASE}/api/behaviors`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ childId: "c1", title: "主动帮同学", body: "**很好**", occurredOn: TODAY, dimension: "品格", tone: "正向", source: "老师反馈", ...over }),
  });
  return { response, body: await response.json() as BehaviorBody };
}

describe("behaviors", () => {
  it("creates and deduplicates", async () => {
    const first = await create();
    expect(first.response.status).toBe(201);
    expect(first.body).toMatchObject({
      title: "主动帮同学",
      occurredOn: TODAY,
      childName: "李律研",
      dimension: "品格",
      tone: "正向",
      source: "老师反馈",
    });
    expect((await create()).response.status).toBe(409);
  });

  it("rejects a future date", async () => {
    const { response, body } = await create({ occurredOn: TOMORROW, title: "未来" });
    expect(response.status).toBe(422);
    expect((body.error as { fields: Record<string, string> }).fields).toMatchObject({ occurredOn: "日期不得晚于今天" });
  });

  it("updates and deletes", async () => {
    const { body } = await create({ title: "可修改" });
    const updated = await SELF.fetch(`${BASE}/api/behaviors/${body.id}`, {
      method: "PATCH", headers: HEADERS, body: JSON.stringify({ title: "已修改", tone: "中性" }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ title: "已修改", tone: "中性", occurredOn: TODAY });
    expect((await SELF.fetch(`${BASE}/api/behaviors/${body.id}`, { method: "DELETE", headers: HEADERS })).status).toBe(204);
    expect((await SELF.fetch(`${BASE}/api/behaviors/${body.id}`, { method: "DELETE", headers: HEADERS })).status).toBe(404);
  });
});
