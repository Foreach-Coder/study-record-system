import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

type TestEnv = typeof env & { TEST_MIGRATIONS: { name: string; queries: string[] }[] };
const BASE = "http://example.com";
const AUTH = { authorization: "Bearer test-token" };

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
});

async function createChild(nickname: string) {
  const response = await SELF.fetch(`${BASE}/api/children`, {
    method: "POST",
    headers: { ...AUTH, "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ nickname, grade: "二年级" }),
  });
  return { response, body: await response.json() as { id: string; nickname: string } };
}

describe("children", () => {
  it("creates a child and rejects a duplicate nickname", async () => {
    const first = await createChild("小A");
    expect(first.response.status).toBe(201);
    expect(first.body.nickname).toBe("小A");
    expect((await createChild("小A")).response.status).toBe(409);
  });

  it("renames a child and cascades the name snapshot", async () => {
    const { body } = await createChild("小B");
    await env.DB.prepare(
      "INSERT INTO tasks (id, child_id, child_name, title, body, type, due_date, created_at, updated_at) VALUES ('t1', ?, '小B', '旧任务', '', 'todo', '2026-11-08', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')",
    ).bind(body.id).run();
    const response = await SELF.fetch(`${BASE}/api/children/${body.id}`, {
      method: "PATCH",
      headers: { ...AUTH, "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ nickname: "小B2" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json() as { nickname: string }).nickname).toBe("小B2");
    const task = await env.DB.prepare("SELECT child_id, child_name FROM tasks WHERE id = 't1'").first<{ child_id: string; child_name: string }>();
    expect(task).toEqual({ child_id: body.id, child_name: "小B2" });
  });

  it("deletes a child into orphan records", async () => {
    const { body } = await createChild("小C");
    await env.DB.prepare(
      "INSERT INTO behaviors (id, child_id, child_name, title, body, occurred_on, created_at, updated_at) VALUES ('b1', ?, '小C', '表现', '', '2026-11-07', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')",
    ).bind(body.id).run();
    const response = await SELF.fetch(`${BASE}/api/children/${body.id}`, {
      method: "DELETE",
      headers: { ...AUTH, origin: BASE },
    });
    expect(response.status).toBe(204);
    const behavior = await env.DB.prepare("SELECT child_id, child_name FROM behaviors WHERE id = 'b1'").first<{ child_id: string | null; child_name: string }>();
    expect(behavior).toEqual({ child_id: null, child_name: "小C" });
  });
});
