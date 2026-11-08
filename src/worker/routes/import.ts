import { requireWrite } from "../auth";
import type { Env } from "../env";
import { ApiProblem, json } from "../errors";
import { assertSchema, auditStatement, isUniqueViolation } from "../gates";
import { readJson } from "../http";
import { todayInShanghai } from "../../shared/dates";
import { validateBehavior, validateTask } from "../../shared/validation";

type Kind = "task" | "behavior";
type Bucket = "tasks" | "behaviors";

// D1 每个查询最多 100 个绑定参数；1000 项 = 一批 1001 条语句，回读按 100 分块。
const MAX_ITEMS = 1000;
const ID_CHUNK = 100;

interface Prepared {
  kind: Kind;
  id: string;
  childId: string;
  childName: string;
  values: Record<string, unknown>;
}

interface ChildRow {
  id: string;
  nickname: string;
}

function obj(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiProblem(422, "validation", `${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function bucketOf(kind: Kind): Bucket {
  return kind === "task" ? "tasks" : "behaviors";
}

function rowKey(kind: Kind, values: Record<string, unknown>): string {
  return JSON.stringify([kind, values.childName, values.title, kind === "task" ? values.dueDate : values.occurredOn]);
}

function chunks<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += ID_CHUNK) out.push(values.slice(index, index + ID_CHUNK));
  return out;
}

async function loadChildren(env: Env): Promise<{ byId: Map<string, ChildRow>; byNickname: Map<string, ChildRow> }> {
  const result = await env.DB.prepare("SELECT id, nickname FROM children").all<ChildRow>();
  const byId = new Map<string, ChildRow>();
  const byNickname = new Map<string, ChildRow>();
  for (const row of result.results ?? []) {
    byId.set(row.id, row);
    byNickname.set(row.nickname, row);
  }
  return { byId, byNickname };
}

async function loadExistingKeys(env: Env): Promise<Map<string, string>> {
  const [taskRows, behaviorRows] = await Promise.all([
    env.DB.prepare("SELECT id, child_name, title, due_date FROM tasks").all<{ id: string; child_name: string; title: string; due_date: string }>(),
    env.DB.prepare("SELECT id, child_name, occurred_on, title FROM behaviors").all<{ id: string; child_name: string; occurred_on: string; title: string }>(),
  ]);
  const keys = new Map<string, string>();
  for (const row of taskRows.results ?? []) {
    keys.set(rowKey("task", { childName: row.child_name, title: row.title, dueDate: row.due_date }), row.id);
  }
  for (const row of behaviorRows.results ?? []) {
    keys.set(rowKey("behavior", { childName: row.child_name, title: row.title, occurredOn: row.occurred_on }), row.id);
  }
  return keys;
}

function resolveChild(
  data: Record<string, unknown>,
  byId: Map<string, ChildRow>,
  byNickname: Map<string, ChildRow>,
): ChildRow {
  const childId = text(data.childId);
  const childValue = text(data.child);
  const childNameValue = text(data.childName);
  if (childValue && childNameValue && childValue !== childNameValue) {
    throw new ApiProblem(422, "validation", "孩子信息不一致", { childName: "孩子信息不一致" });
  }
  const suppliedName = childValue ?? childNameValue;
  const row = childId ? byId.get(childId) : suppliedName ? byNickname.get(suppliedName) : undefined;
  if (!row) throw new ApiProblem(422, "validation", "孩子不存在", { childName: "请选择孩子" });
  if (childId && suppliedName && row.nickname !== suppliedName) {
    throw new ApiProblem(422, "validation", "孩子信息不一致", { childName: "孩子信息不一致" });
  }
  return row;
}

function taskInsert(env: Env, item: Prepared): D1PreparedStatement {
  const v = item.values;
  return env.DB.prepare(
    "INSERT INTO tasks (id, child_id, child_name, title, body, type, subject, due_date, start_date, completed, checked, images, created_by, created_at, updated_at, legacy_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    item.id,
    item.childId,
    item.childName,
    v.title,
    v.body,
    v.type,
    v.subject,
    v.dueDate,
    v.startDate,
    v.completed ? 1 : 0,
    v.checked ? 1 : 0,
    JSON.stringify(v.images ?? []),
    v.createdBy,
    v.createdAt,
    v.createdAt,
    v.legacyId,
  );
}

function behaviorInsert(env: Env, item: Prepared): D1PreparedStatement {
  const v = item.values;
  return env.DB.prepare(
    "INSERT INTO behaviors (id, child_id, child_name, title, body, occurred_on, dimension, tone, source, images, created_by, created_at, updated_at, legacy_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    item.id,
    item.childId,
    item.childName,
    v.title,
    v.body,
    v.occurredOn,
    v.dimension,
    v.tone,
    v.source,
    JSON.stringify(v.images ?? []),
    v.createdBy,
    v.createdAt,
    v.createdAt,
    v.legacyId,
  );
}

async function deleteByIds(env: Env, table: Bucket, ids: string[]): Promise<void> {
  for (const chunk of chunks(ids)) {
    const placeholders = chunk.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...chunk).run().catch(() => undefined);
  }
}

async function cleanup(env: Env, prepared: Prepared[]): Promise<void> {
  await Promise.all([
    deleteByIds(env, "tasks", prepared.filter((item) => item.kind === "task").map((item) => item.id)),
    deleteByIds(env, "behaviors", prepared.filter((item) => item.kind === "behavior").map((item) => item.id)),
  ]);
}

type VerifyRow = Record<string, unknown>;

async function selectRows(env: Env, table: Bucket, ids: string[]): Promise<Map<string, VerifyRow>> {
  const columns =
    table === "tasks"
      ? "id, child_name, title, body, type, subject, due_date, start_date, completed, checked, images, created_by"
      : "id, child_name, title, body, occurred_on, dimension, tone, source, images, created_by";
  const rows = new Map<string, VerifyRow>();
  for (const chunk of chunks(ids)) {
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.DB.prepare(`SELECT ${columns} FROM ${table} WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all<VerifyRow>();
    for (const row of result.results ?? []) rows.set(String(row.id), row);
  }
  return rows;
}

function sameField(actual: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) return actual === null || actual === undefined;
  if (typeof expected === "boolean") return Boolean(actual) === expected;
  if (typeof expected === "number") return Number(actual) === expected;
  return String(actual ?? "") === String(expected);
}

function sameImages(actual: unknown, expected: unknown): boolean {
  try {
    return JSON.stringify(JSON.parse(String(actual ?? "[]"))) === JSON.stringify(expected ?? []);
  } catch {
    return false;
  }
}

function verifyRow(kind: Kind, row: VerifyRow | undefined, item: Prepared): void {
  if (!row) throw new ApiProblem(500, "verification_failed", "导入后回读缺少记录", undefined, { id: item.id });
  const v = item.values;
  if (!sameField(row.child_name, item.childName)) throw new ApiProblem(500, "verification_failed", "导入后孩子不符", undefined, { id: item.id });
  const fields: [string, unknown][] =
    kind === "task"
      ? [
          ["title", v.title],
          ["body", v.body],
          ["type", v.type],
          ["subject", v.subject],
          ["due_date", v.dueDate],
          ["start_date", v.startDate],
          ["completed", v.completed],
          ["checked", v.checked],
          ["created_by", v.createdBy],
        ]
      : [
          ["title", v.title],
          ["body", v.body],
          ["occurred_on", v.occurredOn],
          ["dimension", v.dimension],
          ["tone", v.tone],
          ["source", v.source],
          ["created_by", v.createdBy],
        ];
  for (const [column, expected] of fields) {
    if (!sameField(row[column], expected)) {
      throw new ApiProblem(500, "verification_failed", "导入后字段不符", undefined, { id: item.id, column });
    }
  }
  if (!sameImages(row.images, v.images ?? [])) {
    throw new ApiProblem(500, "verification_failed", "导入后图片不符", undefined, { id: item.id, column: "images" });
  }
}

async function verify(env: Env, prepared: Prepared[]): Promise<Record<Bucket, number>> {
  const taskIds = prepared.filter((item) => item.kind === "task").map((item) => item.id);
  const behaviorIds = prepared.filter((item) => item.kind === "behavior").map((item) => item.id);
  const [taskRows, behaviorRows] = await Promise.all([
    selectRows(env, "tasks", taskIds),
    selectRows(env, "behaviors", behaviorIds),
  ]);
  const expected = {
    tasks: prepared.filter((item) => item.kind === "task").length,
    behaviors: prepared.filter((item) => item.kind === "behavior").length,
  };
  const actual = { tasks: taskRows.size, behaviors: behaviorRows.size };
  for (const item of prepared) {
    try {
      verifyRow(item.kind, item.kind === "task" ? taskRows.get(item.id) : behaviorRows.get(item.id), item);
    } catch (error) {
      if (error instanceof ApiProblem) {
        throw new ApiProblem(500, error.code, error.message, error.fields, {
          ...(error.extra ?? {}),
          expected,
          actual,
        });
      }
      throw error;
    }
  }
  return actual;
}

export async function importItems(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const body = await readJson(request);

  if (body.mode !== "dry-run" && body.mode !== "apply") {
    throw new ApiProblem(422, "validation", "mode 不合法", { mode: "mode 必须是 dry-run 或 apply" });
  }
  const mode = body.mode;
  const onDuplicate = body.onDuplicate === undefined ? "error" : body.onDuplicate;
  if (onDuplicate !== "error" && onDuplicate !== "skip") {
    throw new ApiProblem(422, "validation", "onDuplicate 不合法", { onDuplicate: "onDuplicate 必须是 error 或 skip" });
  }
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    throw new ApiProblem(422, "validation", `items 数量必须在 1..${MAX_ITEMS}`, { items: `items 数量必须在 1..${MAX_ITEMS}` });
  }

  const today = todayInShanghai();
  const now = new Date().toISOString();
  const prepared: Prepared[] = [];
  const skipped: Record<Bucket, number> = { tasks: 0, behaviors: 0 };
  const seen = new Map<string, number>();
  const invalid: Record<string, string> = {};
  const duplicates: Record<string, string> = {};

  const [{ byId, byNickname }, existingKeys] = await Promise.all([loadChildren(env), loadExistingKeys(env)]);

  for (let index = 0; index < items.length; index += 1) {
    const item = obj(items[index], `items[${index}]`);
    const kind = item.kind;
    if (kind !== "task" && kind !== "behavior") {
      invalid[`items[${index}].kind`] = "kind 必须是 task 或 behavior";
      continue;
    }
    const data = obj(item.data, `items[${index}].data`);
    try {
      const child = resolveChild(data, byId, byNickname);
      const result = kind === "task"
        ? validateTask({ ...data, child: child.nickname }, { today, childNames: new Set([child.nickname]) })
        : validateBehavior({ ...data, child: child.nickname }, { today, childNames: new Set([child.nickname]) });
      if (!result.ok) {
        for (const [key, message] of Object.entries(result.fields)) invalid[`items[${index}].${key}`] = message;
        continue;
      }
      const legacyId = text(data.legacyId);
      const values: Record<string, unknown> = { ...result.value, childName: child.nickname, createdAt: now, legacyId };
      const key = rowKey(kind, values);
      const first = seen.get(key);
      if (first !== undefined) {
        if (onDuplicate === "skip") {
          skipped[bucketOf(kind)] += 1;
        } else {
          duplicates[`items[${index}]`] = `与 items[${first}] 重复`;
        }
        continue;
      }
      const existing = existingKeys.get(key);
      if (existing) {
        if (onDuplicate === "skip") {
          skipped[bucketOf(kind)] += 1;
        } else {
          duplicates[`items[${index}]`] = `重复记录 ${existing}`;
        }
        continue;
      }
      seen.set(key, index);
      prepared.push({ kind, id: crypto.randomUUID(), childId: child.id, childName: child.nickname, values });
    } catch (error) {
      if (error instanceof ApiProblem && error.fields) {
        for (const [key, message] of Object.entries(error.fields)) invalid[`items[${index}].${key}`] = message;
      } else {
        invalid[`items[${index}]`] = error instanceof Error ? error.message : "校验失败";
      }
    }
  }

  if (Object.keys(invalid).length > 0) {
    throw new ApiProblem(422, "validation", "导入数据不合法", invalid);
  }
  if (Object.keys(duplicates).length > 0) {
    throw new ApiProblem(409, "duplicate", "导入数据存在重复记录", duplicates);
  }

  const counts: Record<Bucket, number> = {
    tasks: prepared.filter((item) => item.kind === "task").length,
    behaviors: prepared.filter((item) => item.kind === "behavior").length,
  };

  if (mode === "dry-run") {
    return json({ ok: true, mode, wouldWrite: counts, skipped, verification: { tasks: 0, behaviors: 0 } });
  }

  await assertSchema(env);
  const statements = prepared.map((item) => (item.kind === "task" ? taskInsert(env, item) : behaviorInsert(env, item)));
  const auditTable: Bucket = counts.tasks === 0 && counts.behaviors > 0 ? "behaviors" : "tasks";
  statements.push(auditStatement(env, {
    actor: auth.mode === "bearer" ? "cli" : "web",
    action: "import",
    table: auditTable,
    recordId: null,
    requestId: crypto.randomUUID(),
    detail: counts,
  }));

  try {
    const results = await env.DB.batch(statements);
    if (results.some((result) => (result as { success?: boolean }).success === false)) throw new Error("batch-failed");
  } catch (error) {
    await cleanup(env, prepared);
    if (error instanceof ApiProblem) throw error;
    if (isUniqueViolation(error)) throw new ApiProblem(409, "duplicate", "导入数据存在重复记录");
    throw new ApiProblem(500, "write_failed", "导入写入失败", undefined, { reason: String(error) });
  }

  let verification: Record<Bucket, number>;
  try {
    verification = await verify(env, prepared);
  } catch (error) {
    await cleanup(env, prepared);
    if (error instanceof ApiProblem) throw error;
    throw new ApiProblem(500, "verification_failed", "导入后无法回读核验", undefined, { reason: String(error) });
  }
  if (verification.tasks !== counts.tasks || verification.behaviors !== counts.behaviors) {
    await cleanup(env, prepared);
    throw new ApiProblem(500, "verification_failed", "导入后行数不符", undefined, { expected: counts, actual: verification });
  }
  return json({ ok: true, mode, verification, skipped });
}
