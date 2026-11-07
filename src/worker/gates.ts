import { SCHEMA_VERSION } from "../shared/schema";
import type { Env } from "./env";
import { ApiProblem } from "./errors";

export interface AuditEntry {
  actor: string;
  action: string;
  table: string | null;
  recordId: string | null;
  requestId: string;
  detail?: unknown;
}

export function auditStatement(env: Env, entry: AuditEntry): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT INTO audit_log (id, at, actor, action, table_name, record_id, request_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    crypto.randomUUID(),
    new Date().toISOString(),
    entry.actor,
    entry.action,
    entry.table,
    entry.recordId,
    entry.requestId,
    JSON.stringify(entry.detail ?? {}),
  );
}

export async function assertSchema(env: Env): Promise<void> {
  const row = await env.DB.prepare("SELECT version FROM schema_meta WHERE id = 1").first<{ version: number }>();
  const version = row?.version ?? 0;
  if (version !== SCHEMA_VERSION) {
    throw new ApiProblem(409, "schema_mismatch", "数据库结构版本不匹配", undefined, { expected: SCHEMA_VERSION, actual: version });
  }
}

export async function findDuplicate(
  env: Env,
  table: "tasks" | "behaviors",
  where: string,
  values: unknown[],
  excludeId?: string,
): Promise<string | null> {
  const suffix = excludeId ? " AND id != ?" : "";
  const row = await env.DB.prepare(`SELECT id FROM ${table} WHERE ${where}${suffix} LIMIT 1`)
    .bind(...values, ...(excludeId ? [excludeId] : []))
    .first<{ id: string }>();
  return row?.id ?? null;
}

export function isUniqueViolation(error: unknown): boolean {
  return /unique\s+constraint\s+failed|constraint\s+failed:\s*unique/i.test(String(error));
}

export interface WriteSpec<T> {
  table: "children" | "tasks" | "behaviors";
  id: string;
  statements: D1PreparedStatement[];
  read: () => Promise<T | null>;
  expected: Record<string, unknown>;
  audit: AuditEntry;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function executeWrite<T extends object>(env: Env, spec: WriteSpec<T>): Promise<T> {
  await assertSchema(env);
  try {
    const results = await env.DB.batch([...spec.statements, auditStatement(env, spec.audit)]);
    if (results.some((result) => (result as { success?: boolean }).success === false)) throw new Error("batch-failed");
    const actual = await spec.read();
    if (!actual) throw new Error("readback-missing");
    const record = actual as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(spec.expected)) {
      if (!same(record[key], value)) throw new Error(`readback-mismatch:${key}`);
    }
    return actual;
  } catch (error) {
    // 补偿只适用于新建：更新/删除操作的目标行可能已经存在，错误时删除它会毁掉原记录。
    if (spec.audit.action === "create") {
      await env.DB.prepare(`DELETE FROM ${spec.table} WHERE id = ?`).bind(spec.id).run().catch(() => undefined);
    }
    if (error instanceof ApiProblem) throw error;
    if (isUniqueViolation(error)) throw new ApiProblem(409, "duplicate", "记录已存在");
    throw new ApiProblem(500, "write_failed", "写入未通过回读校验", undefined, { reason: String(error) });
  }
}
