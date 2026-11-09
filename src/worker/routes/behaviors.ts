import { requireWrite } from "../auth";
import { readBehavior } from "../db";
import type { Env } from "../env";
import { ApiProblem, json } from "../errors";
import { assertSchema, auditStatement, executeWrite, findDuplicate } from "../gates";
import { readJson } from "../http";
import { todayInShanghai } from "../../shared/dates";
import type { Behavior } from "../../shared/schema";
import { validateBehavior } from "../../shared/validation";

async function resolveChild(env: Env, body: Record<string, unknown>): Promise<{ id: string; nickname: string }> {
  const childId = typeof body.childId === "string" && body.childId.trim() !== "" ? body.childId.trim() : null;
  const suppliedName = typeof body.child === "string" && body.child.trim() !== ""
    ? body.child.trim()
    : typeof body.childName === "string" && body.childName.trim() !== ""
      ? body.childName.trim()
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

function idFrom(request: Request): string {
  return new URL(request.url).pathname.split("/").pop() ?? "";
}

function draftFromRow(row: Behavior) {
  return {
    child: row.childName,
    title: row.title,
    body: row.body,
    occurredOn: row.occurredOn,
    dimension: row.dimension,
    tone: row.tone,
    source: row.source,
    images: row.images,
    attachments: row.attachments,
    createdBy: row.createdBy,
  };
}

function audit(auth: { mode: string }, action: string, id: string, detail?: unknown) {
  return {
    actor: auth.mode === "bearer" ? "cli" : "web",
    action,
    table: "behaviors" as const,
    recordId: id,
    requestId: crypto.randomUUID(),
    detail,
  };
}

export async function createBehavior(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const body = await readJson(request);
  const child = await resolveChild(env, body);
  const result = validateBehavior({ ...body, child: child.nickname }, { today: todayInShanghai(), childNames: new Set([child.nickname]) });
  if (!result.ok) throw new ApiProblem(422, "validation", "表现不合法", result.fields);
  const duplicate = await findDuplicate(env, "behaviors", "child_name = ? AND occurred_on = ? AND title = ?", [child.nickname, result.value.occurredOn, result.value.title]);
  if (duplicate) throw new ApiProblem(409, "duplicate", "同样的表现已存在", undefined, { existingId: duplicate });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return json(await executeWrite(env, {
    table: "behaviors",
    id,
    statements: [env.DB.prepare(
      "INSERT INTO behaviors (id, child_id, child_name, title, body, occurred_on, dimension, tone, source, images, attachments, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, child.id, child.nickname, result.value.title, result.value.body, result.value.occurredOn, result.value.dimension, result.value.tone, result.value.source, JSON.stringify(result.value.images), JSON.stringify(result.value.attachments), result.value.createdBy, now, now)],
    read: () => readBehavior(env, id),
    expected: {
      childName: child.nickname,
      title: result.value.title,
      body: result.value.body,
      occurredOn: result.value.occurredOn,
      dimension: result.value.dimension,
      tone: result.value.tone,
      source: result.value.source,
      images: result.value.images,
      attachments: result.value.attachments,
      createdBy: result.value.createdBy,
    },
    audit: audit(auth, "create", id),
  }), 201);
}

export async function updateBehavior(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const id = idFrom(request);
  const existing = await readBehavior(env, id);
  if (!existing) throw new ApiProblem(404, "not_found", "表现不存在");
  const body = await readJson(request);
  const referencesChild = Boolean(body.childId || body.child || body.childName);
  const child = referencesChild ? await resolveChild(env, body) : { id: existing.childId, nickname: existing.childName };
  const merged = { ...draftFromRow(existing), ...body, child: child.nickname, childName: child.nickname };
  const result = validateBehavior(merged, { today: todayInShanghai(), childNames: new Set([child.nickname]) });
  if (!result.ok) throw new ApiProblem(422, "validation", "表现不合法", result.fields);
  const duplicate = await findDuplicate(env, "behaviors", "child_name = ? AND occurred_on = ? AND title = ?", [child.nickname, result.value.occurredOn, result.value.title], id);
  if (duplicate) throw new ApiProblem(409, "duplicate", "同样的表现已存在", undefined, { existingId: duplicate });
  const now = new Date().toISOString();
  return json(await executeWrite(env, {
    table: "behaviors",
    id,
    statements: [env.DB.prepare(
      "UPDATE behaviors SET child_id = ?, child_name = ?, title = ?, body = ?, occurred_on = ?, dimension = ?, tone = ?, source = ?, images = ?, attachments = ?, created_by = ?, updated_at = ? WHERE id = ?",
    ).bind(child.id, child.nickname, result.value.title, result.value.body, result.value.occurredOn, result.value.dimension, result.value.tone, result.value.source, JSON.stringify(result.value.images), JSON.stringify(result.value.attachments), result.value.createdBy, now, id)],
    read: () => readBehavior(env, id),
    expected: {
      childName: child.nickname,
      title: result.value.title,
      body: result.value.body,
      occurredOn: result.value.occurredOn,
      dimension: result.value.dimension,
      tone: result.value.tone,
      source: result.value.source,
      images: result.value.images,
      attachments: result.value.attachments,
      createdBy: result.value.createdBy,
    },
    audit: audit(auth, "update", id),
  }));
}

export async function deleteBehavior(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const id = idFrom(request);
  if (!(await readBehavior(env, id))) throw new ApiProblem(404, "not_found", "表现不存在");
  await assertSchema(env);
  try {
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM behaviors WHERE id = ?").bind(id),
      auditStatement(env, audit(auth, "delete", id)),
    ]);
    if (results.some((result) => (result as { success?: boolean }).success === false)) {
      throw new ApiProblem(500, "write_failed", "删除未生效");
    }
  } catch (error) {
    if (error instanceof ApiProblem) throw error;
    throw new ApiProblem(500, "write_failed", "删除未生效", undefined, { reason: String(error) });
  }
  if (await readBehavior(env, id)) throw new ApiProblem(500, "write_failed", "删除未生效");
  return new Response(null, { status: 204 });
}
