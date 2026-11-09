import { requireWrite } from "../auth";
import { readTask } from "../db";
import type { Env } from "../env";
import { ApiProblem, json } from "../errors";
import { assertSchema, auditStatement, executeWrite, findDuplicate } from "../gates";
import { readJson } from "../http";
import { todayInShanghai } from "../../shared/dates";
import type { Task } from "../../shared/schema";
import { validateTask } from "../../shared/validation";

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

function draftFromRow(row: Task) {
  return {
    child: row.childName,
    title: row.title,
    body: row.body,
    type: row.type,
    subject: row.subject,
    dueDate: row.dueDate,
    startDate: row.startDate,
    completed: row.completed,
    checked: row.checked,
    images: row.images,
    attachments: row.attachments,
    createdBy: row.createdBy,
  };
}

function audit(auth: { mode: string }, action: string, id: string, detail?: unknown) {
  return {
    actor: auth.mode === "bearer" ? "cli" : "web",
    action,
    table: "tasks" as const,
    recordId: id,
    requestId: crypto.randomUUID(),
    detail,
  };
}

export async function createTask(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const body = await readJson(request);
  const child = await resolveChild(env, body);
  const rawStart = body.startDate;
  const missingStart = rawStart == null || (typeof rawStart === "string" && rawStart.trim() === "");
  const requestedStart = missingStart ? todayInShanghai() : rawStart;
  const result = validateTask({ ...body, child: child.nickname, startDate: requestedStart }, { today: todayInShanghai(), childNames: new Set([child.nickname]) });
  if (!result.ok) throw new ApiProblem(422, "validation", "任务不合法", result.fields);
  const startDate = result.value.startDate ?? requestedStart;
  const duplicate = await findDuplicate(env, "tasks", "child_name = ? AND title = ? AND due_date = ?", [child.nickname, result.value.title, result.value.dueDate]);
  if (duplicate) throw new ApiProblem(409, "duplicate", "同样的任务已存在", undefined, { existingId: duplicate });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return json(await executeWrite(env, {
    table: "tasks",
    id,
    statements: [env.DB.prepare(
      "INSERT INTO tasks (id, child_id, child_name, title, body, type, subject, due_date, start_date, completed, checked, images, attachments, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, child.id, child.nickname, result.value.title, result.value.body, result.value.type, result.value.subject, result.value.dueDate, startDate, result.value.completed ? 1 : 0, result.value.checked ? 1 : 0, JSON.stringify(result.value.images), JSON.stringify(result.value.attachments), result.value.createdBy, now, now)],
    read: () => readTask(env, id),
    expected: {
      childName: child.nickname,
      title: result.value.title,
      body: result.value.body,
      type: result.value.type,
      subject: result.value.subject,
      dueDate: result.value.dueDate,
      startDate,
      completed: result.value.completed,
      checked: result.value.checked,
      images: result.value.images,
      attachments: result.value.attachments,
      createdBy: result.value.createdBy,
    },
    audit: audit(auth, "create", id),
  }), 201);
}

export async function updateTask(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const id = idFrom(request);
  const existing = await readTask(env, id);
  if (!existing) throw new ApiProblem(404, "not_found", "任务不存在");
  const body = await readJson(request);
  const referencesChild = Boolean(body.childId || body.child || body.childName);
  const child = referencesChild ? await resolveChild(env, body) : { id: existing.childId, nickname: existing.childName };
  const merged = { ...draftFromRow(existing), ...body, child: child.nickname, childName: child.nickname };
  // 取消完成必须同时取消“已检查”，否则 checked=true 会把它重新抬回 completed=true。
  if (body.completed === false) merged.checked = false;
  const result = validateTask(merged, { today: todayInShanghai(), childNames: new Set([child.nickname]) });
  if (!result.ok) throw new ApiProblem(422, "validation", "任务不合法", result.fields);
  const duplicate = await findDuplicate(env, "tasks", "child_name = ? AND title = ? AND due_date = ?", [child.nickname, result.value.title, result.value.dueDate], id);
  if (duplicate) throw new ApiProblem(409, "duplicate", "同样的任务已存在", undefined, { existingId: duplicate });
  const now = new Date().toISOString();
  const startDate = result.value.startDate;
  return json(await executeWrite(env, {
    table: "tasks",
    id,
    statements: [env.DB.prepare(
      "UPDATE tasks SET child_id = ?, child_name = ?, title = ?, body = ?, type = ?, subject = ?, due_date = ?, start_date = ?, completed = ?, checked = ?, images = ?, attachments = ?, created_by = ?, updated_at = ? WHERE id = ?",
    ).bind(child.id, child.nickname, result.value.title, result.value.body, result.value.type, result.value.subject, result.value.dueDate, startDate, result.value.completed ? 1 : 0, result.value.checked ? 1 : 0, JSON.stringify(result.value.images), JSON.stringify(result.value.attachments), result.value.createdBy, now, id)],
    read: () => readTask(env, id),
    expected: {
      childName: child.nickname,
      title: result.value.title,
      body: result.value.body,
      type: result.value.type,
      subject: result.value.subject,
      dueDate: result.value.dueDate,
      startDate,
      completed: result.value.completed,
      checked: result.value.checked,
      images: result.value.images,
      attachments: result.value.attachments,
      createdBy: result.value.createdBy,
    },
    audit: audit(auth, "update", id),
  }));
}

export async function deleteTask(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const id = idFrom(request);
  if (!(await readTask(env, id))) throw new ApiProblem(404, "not_found", "任务不存在");
  await assertSchema(env);
  try {
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id),
      auditStatement(env, audit(auth, "delete", id)),
    ]);
    if (results.some((result) => (result as { success?: boolean }).success === false)) {
      throw new ApiProblem(500, "write_failed", "删除未生效");
    }
  } catch (error) {
    if (error instanceof ApiProblem) throw error;
    throw new ApiProblem(500, "write_failed", "删除未生效", undefined, { reason: String(error) });
  }
  if (await readTask(env, id)) throw new ApiProblem(500, "write_failed", "删除未生效");
  return new Response(null, { status: 204 });
}
