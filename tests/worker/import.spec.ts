import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInShanghai } from "../../src/shared/dates";

type TestEnv = typeof env & { TEST_MIGRATIONS: { name: string; queries: string[] }[] };
const BASE = "http://example.com";
const HEADERS = { authorization: "Bearer test-token", "content-type": "application/json", origin: BASE };
const TODAY = todayInShanghai();
const DUE = addDays(TODAY, 1);
const YESTERDAY = addDays(TODAY, -1);

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
  await env.DB.prepare("INSERT INTO children (id, nickname, created_at, updated_at) VALUES ('c1', '李律研', '2026-11-07T00:00:00.000Z', '2026-11-07T00:00:00.000Z')").run();
});

function taskItem(over: Record<string, unknown> = {}) {
  return { kind: "task", data: { childId: "c1", title: "导入任务", body: "", type: "todo", dueDate: DUE, ...over } };
}

function behaviorItem(over: Record<string, unknown> = {}) {
  return { kind: "behavior", data: { childId: "c1", title: "导入表现", body: "", occurredOn: YESTERDAY, ...over } };
}

function payload(items: unknown[], over: Record<string, unknown> = {}) {
  return { mode: "apply", items, ...over };
}

async function post(body: unknown) {
  const response = await SELF.fetch(`${BASE}/api/import`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  return { response, body: await response.json() as Record<string, unknown> };
}

async function countTasks(title: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title = ?").bind(title).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("import", () => {
  it("dry-runs without writing, then applies", async () => {
    const dry = await post({ ...payload([taskItem()]), mode: "dry-run" });
    expect(dry.response.status).toBe(200);
    expect(dry.body.wouldWrite).toEqual({ tasks: 1, behaviors: 0 });
    expect(await countTasks("导入任务")).toBe(0);

    const applied = await post(payload([taskItem()]));
    expect(applied.response.status).toBe(200);
    expect(applied.body.verification).toEqual({ tasks: 1, behaviors: 0 });
    expect(await countTasks("导入任务")).toBe(1);
  });

  it("returns 409 for a duplicate and skips it when requested", async () => {
    expect((await post(payload([taskItem()]))).response.status).toBe(409);
    const skipped = await post({ ...payload([taskItem()]), onDuplicate: "skip" });
    expect(skipped.response.status).toBe(200);
    expect(skipped.body.skipped).toEqual({ tasks: 1, behaviors: 0 });
    expect(await countTasks("导入任务")).toBe(1);
  });

  it("detects duplicates inside one payload", async () => {
    const items = [taskItem({ title: "内部重复" }), taskItem({ title: "内部重复" })];
    expect((await post(payload(items))).response.status).toBe(409);
    expect(await countTasks("内部重复")).toBe(0);

    const skipped = await post({ ...payload(items), onDuplicate: "skip" });
    expect(skipped.response.status).toBe(200);
    expect(skipped.body.skipped).toEqual({ tasks: 1, behaviors: 0 });
    expect(await countTasks("内部重复")).toBe(1);
  });

  it("rejects a contradictory childId and child name", async () => {
    const result = await post(payload([taskItem({ title: "矛盾导入", child: "别人" })]));
    expect(result.response.status).toBe(422);
    const body = result.body as { error: { fields: Record<string, string> } };
    expect(body.error.fields).toMatchObject({ "items[0].childName": "孩子信息不一致" });
    expect(await countTasks("矛盾导入")).toBe(0);

    const names = await post(payload([taskItem({ title: "名字矛盾", child: "甲", childName: "乙" })]));
    expect(names.response.status).toBe(422);
    expect((names.body as { error: { fields: Record<string, string> } }).error.fields).toMatchObject({ "items[0].childName": "孩子信息不一致" });
    expect(await countTasks("名字矛盾")).toBe(0);
  });

  it("rejects an invalid mode", async () => {
    expect((await post({ mode: "upsert", items: [taskItem({ title: "坏模式" })] })).response.status).toBe(422);
    expect(await countTasks("坏模式")).toBe(0);
  });

  it("writes nothing when any item is invalid", async () => {
    const bad = payload([
      taskItem({ title: "合法" }),
      taskItem({ title: "", dueDate: DUE }),
    ]);
    expect((await post(bad)).response.status).toBe(422);
    expect(await countTasks("合法")).toBe(0);
  });

  it("applies behavior imports", async () => {
    const applied = await post(payload([behaviorItem()]));
    expect(applied.response.status).toBe(200);
    expect(applied.body.verification).toEqual({ tasks: 0, behaviors: 1 });
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM behaviors WHERE title = '导入表现'").first<{ n: number }>();
    expect(row?.n).toBe(1);
    const audit = await env.DB.prepare("SELECT table_name FROM audit_log WHERE action = 'import' AND detail LIKE '%\"behaviors\":1%' ORDER BY rowid DESC LIMIT 1").first<{ table_name: string }>();
    expect(audit?.table_name).toBe("behaviors");
  });

  it("applies 101 items through the chunked readback path", async () => {
    const items = Array.from({ length: 101 }, (_, index) => taskItem({ title: `批量-${index}` }));
    const applied = await post(payload(items));
    expect(applied.response.status).toBe(200);
    expect(applied.body.verification).toEqual({ tasks: 101, behaviors: 0 });
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title LIKE '批量-%'").first<{ n: number }>();
    expect(row?.n).toBe(101);
  });

  it("cleans up every chunk when readback verification fails", async () => {
    await env.DB.prepare("CREATE TRIGGER drop_verification_row AFTER INSERT ON tasks WHEN NEW.title = '核验批量-50' BEGIN DELETE FROM tasks WHERE id = NEW.id; END").run();
    try {
      const items = Array.from({ length: 101 }, (_, index) => taskItem({ title: `核验批量-${index}` }));
      const failed = await post(payload(items));
      expect(failed.response.status).toBe(500);
      const body = failed.body as { error: { code: string; expected?: unknown; actual?: unknown } };
      expect(body.error.code).toBe("verification_failed");
      expect(body.error.expected).toEqual({ tasks: 101, behaviors: 0 });
      expect(body.error.actual).toEqual({ tasks: 100, behaviors: 0 });
      const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title LIKE '核验批量-%'").first<{ n: number }>();
      expect(left?.n).toBe(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER drop_verification_row").run();
    }
  });

  it("rejects an invalid onDuplicate value", async () => {
    const result = await post({ ...payload([taskItem({ title: "坏重复策略" })]), onDuplicate: "merge" });
    expect(result.response.status).toBe(422);
    expect((result.body as { error: { fields: Record<string, string> } }).error.fields).toMatchObject({ onDuplicate: expect.any(String) });
    expect(await countTasks("坏重复策略")).toBe(0);
  });
});
