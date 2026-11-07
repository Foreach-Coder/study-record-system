import { requireWrite } from "../auth";
import type { Env } from "../env";
import { ApiProblem, json } from "../errors";
import { assertSchema, auditStatement, findDuplicate, isUniqueViolation } from "../gates";
import { readJson } from "../http";
import { todayInShanghai } from "../../shared/dates";
import { validateBehavior, validateTask } from "../../shared/validation";

type Kind = "task" | "behavior";
type Bucket = "tasks" | "behaviors";

interface Prepared {
  kind: Kind;
  id: string;
  childId: string;
  childName: string;
  values: Record<string, unknown>;
}

function obj(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiProblem(422, "validation", `${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function bucketOf(kind: Kind): Bucket {
  return kind === "task" ? "tasks" : "behaviors";
}

async function resolveChild(env: Env, data: Record<string, unknown>): Promise<{ id: string; nickname: string }> {
  const childId = typeof data.childId === "string" && data.childId.trim() !== "" ? data.childId.trim() : null;
  const suppliedName = typeof data.child === "string" && data.child.trim() !== ""
    ? data.child.trim()
    : typeof data.childName === "string" && data.childName.trim() !== ""
      ? data.childName.trim()
      : null;
  const row = childId
    ? await env.DB.prepare("SELECT id, nickname FROM children WHERE id = ?").bind(childId).first<{ id: string; nickname: string }>()
    : suppliedName
      ? await env.DB.prepare("SELECT id, nickname FROM children WHERE nickname = ?").bind(suppliedName).first<{ id: string; nickname: string }>()
      : null;
  if (!row) throw new ApiProblem(422, "validation", "孩子不存在", { childName: "请选择孩子" });
  if (childId && suppliedName && row.nickname !== suppliedName) {
    throw new ApiProblem(422, "validation", "孩子信息不一致", { childName: "孩子信息不一致" });
  }
  return row;
}

function itemKey(kind: Kind, values: Record<string, unknown>): string {
  return JSON.stringify([kind, values.childName, values.title, kind === "task" ? values.dueDate : values.occurredOn]);
}

async function findExisting(env: Env, kind: Kind, values: Record<string, unknown>): Promise<string | null> {
  return kind === "task"
    ? findDuplicate(env, "tasks", "child_name = ? AND title = ? AND due_date = ?", [values.childName, values.title, values.dueDate])
    : findDuplicate(env, "behaviors", "child_name = ? AND occurred_on = ? AND title = ?", [values.childName, values.occurredOn, values.title]);
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
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  await env.DB.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).run().catch(() => undefined);
}

async function cleanup(env: Env, prepared: Prepared[]): Promise<void> {
  await Promise.all([
    deleteByIds(env, "tasks", prepared.filter((item) => item.kind === "task").map((item) => item.id)),
    deleteByIds(env, "behaviors", prepared.filter((item) => item.kind === "behavior").map((item) => item.id)),
  ]);
}

async function countIds(env: Env, table: Bucket, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function importItems(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const body = await readJson(request);

  if (body.mode !== "dry-run" && body.mode !== "apply") {
    throw new ApiProblem(422, "validation", "mode 不合法", { mode: "mode 必须是 dry-run 或 apply" });
  }
  const mode = body.mode;
  const onDuplicate = body.onDuplicate === "skip" ? "skip" : "error";
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 1000) {
    throw new ApiProblem(422, "validation", "items 数量必须在 1..1000", { items: "items 数量必须在 1..1000" });
  }

  const today = todayInShanghai();
  const now = new Date().toISOString();
  const prepared: Prepared[] = [];
  const skipped: Record<Bucket, number> = { tasks: 0, behaviors: 0 };
  const seen = new Map<string, number>();
  const invalid: Record<string, string> = {};
  const duplicates: Record<string, string> = {};

  for (let index = 0; index < items.length; index += 1) {
    const item = obj(items[index], `items[${index}]`);
    const kind = item.kind;
    if (kind !== "task" && kind !== "behavior") {
      invalid[`items[${index}].kind`] = "kind 必须是 task 或 behavior";
      continue;
    }
    const data = obj(item.data, `items[${index}].data`);
    try {
      const child = await resolveChild(env, data);
      const result = kind === "task"
        ? validateTask({ ...data, child: child.nickname }, { today, childNames: new Set([child.nickname]) })
        : validateBehavior({ ...data, child: child.nickname }, { today, childNames: new Set([child.nickname]) });
      if (!result.ok) {
        for (const [key, message] of Object.entries(result.fields)) invalid[`items[${index}].${key}`] = message;
        continue;
      }
      const legacyId = typeof data.legacyId === "string" && data.legacyId.trim() !== "" ? data.legacyId : null;
      const values: Record<string, unknown> = { ...result.value, childName: child.nickname, createdAt: now, legacyId };
      const key = itemKey(kind, values);
      const first = seen.get(key);
      if (first !== undefined) {
        if (onDuplicate === "skip") {
          skipped[bucketOf(kind)] += 1;
        } else {
          duplicates[`items[${index}]`] = `与 items[${first}] 重复`;
        }
        continue;
      }
      const existing = await findExisting(env, kind, values);
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
  statements.push(auditStatement(env, {
    actor: auth.mode === "bearer" ? "cli" : "web",
    action: "import",
    table: "tasks",
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

  const taskIds = prepared.filter((item) => item.kind === "task").map((item) => item.id);
  const behaviorIds = prepared.filter((item) => item.kind === "behavior").map((item) => item.id);
  const [taskCount, behaviorCount] = await Promise.all([
    countIds(env, "tasks", taskIds),
    countIds(env, "behaviors", behaviorIds),
  ]);
  const verification = { tasks: taskCount, behaviors: behaviorCount };
  if (verification.tasks !== counts.tasks || verification.behaviors !== counts.behaviors) {
    await cleanup(env, prepared);
    throw new ApiProblem(500, "verification_failed", "导入后行数不符", undefined, { expected: counts, actual: verification });
  }
  return json({ ok: true, mode, verification, skipped });
}
