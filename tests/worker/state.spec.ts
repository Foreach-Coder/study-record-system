import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { todayInShanghai } from "../../src/shared/dates";

type TestEnv = typeof env & { TEST_MIGRATIONS: { name: string; queries: string[] }[] };
const BASE = "http://example.com";
const AUTH = { authorization: "Bearer test-token" };

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO children (id, nickname, created_at, updated_at) VALUES ('c1', '李律研', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')"),
    env.DB.prepare("INSERT INTO tasks (id, child_id, child_name, title, body, type, due_date, created_at, updated_at) VALUES ('t3', 'c1', '李律研', '同时间', '', 'todo', '2026-11-07', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')"),
    env.DB.prepare("INSERT INTO tasks (id, child_id, child_name, title, body, type, due_date, created_at, updated_at) VALUES ('t2', 'c1', '李律研', '后', '', 'todo', '2026-11-09', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')"),
    env.DB.prepare("INSERT INTO tasks (id, child_id, child_name, title, body, type, due_date, created_at, updated_at) VALUES ('t1', 'c1', '李律研', '先', '', 'todo', '2026-11-07', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')"),
    env.DB.prepare("INSERT INTO behaviors (id, child_id, child_name, title, body, occurred_on, created_at, updated_at) VALUES ('b2', 'c1', '李律研', '同时间', '', '2026-11-06', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')"),
    env.DB.prepare("INSERT INTO behaviors (id, child_id, child_name, title, body, occurred_on, created_at, updated_at) VALUES ('b1', 'c1', '李律研', '表现', '', '2026-11-06', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')"),
  ]);
});

describe("state", () => {
  it("returns ordered state with deterministic tiebreakers", async () => {
    const response = await SELF.fetch(`${BASE}/api/state`, { headers: AUTH });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      schemaVersion: number;
      today: string;
      serverTime: string;
      syncCutoffAt: string | null;
      children: { nickname: string }[];
      tasks: { id: string }[];
      behaviors: { id: string }[];
    };
    expect(body.schemaVersion).toBe(1);
    expect(body.today).toBe(todayInShanghai());
    expect(body.syncCutoffAt).toBeNull();
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
    expect(body.children.map((child) => child.nickname)).toEqual(["李律研"]);
    expect(body.tasks.map((task) => task.id)).toEqual(["t1", "t3", "t2"]);
    expect(body.behaviors.map((behavior) => behavior.id)).toEqual(["b2", "b1"]);
  });

  it("requires auth", async () => {
    const response = await SELF.fetch(`${BASE}/api/state`);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("records the latest synced message time and never moves backwards", async () => {
    const unauthorized = await SELF.fetch(`${BASE}/api/sync-status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cutoffAt: "2026-11-09T17:41:42+08:00" }),
    });
    expect(unauthorized.status).toBe(401);

    const invalid = await SELF.fetch(`${BASE}/api/sync-status`, {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ cutoffAt: "not-a-time" }),
    });
    expect(invalid.status).toBe(422);

    const first = await SELF.fetch(`${BASE}/api/sync-status`, {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ cutoffAt: "2026-11-09T17:41:42+08:00" }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, syncCutoffAt: "2026-11-09T09:41:42.000Z" });

    const older = await SELF.fetch(`${BASE}/api/sync-status`, {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ cutoffAt: "2026-11-09T08:00:00+08:00" }),
    });
    expect(await older.json()).toMatchObject({ syncCutoffAt: "2026-11-09T09:41:42.000Z" });

    const state = await SELF.fetch(`${BASE}/api/state`, { headers: AUTH });
    expect(await state.json()).toMatchObject({ syncCutoffAt: "2026-11-09T09:41:42.000Z" });
  });
});
