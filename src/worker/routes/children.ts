import { assertCsrf, authenticate } from "../auth";
import { readChild } from "../db";
import type { Env } from "../env";
import { ApiProblem, json } from "../errors";
import { assertSchema, auditStatement, executeWrite, isUniqueViolation } from "../gates";
import { readJson } from "../http";
import type { Child } from "../../shared/schema";
import { validateChild, type ChildDraft } from "../../shared/validation";

async function requireWrite(request: Request, env: Env) {
  const auth = await authenticate(request, env);
  if (!auth) throw new ApiProblem(401, "unauthorized", "请先登录");
  if (auth.mode === "cookie") assertCsrf(request, env);
  return auth;
}

function idFrom(request: Request): string {
  return new URL(request.url).pathname.split("/").pop() ?? "";
}

function audit(env: Env, auth: { mode: string }, action: string, id: string) {
  return auditStatement(env, {
    actor: auth.mode === "bearer" ? "cli" : "web",
    action,
    table: "children",
    recordId: id,
    requestId: crypto.randomUUID(),
  });
}

function matches(child: Child, expected: ChildDraft): boolean {
  return child.nickname === expected.nickname
    && child.birthday === expected.birthday
    && child.grade === expected.grade
    && child.school === expected.school
    && child.className === expected.className
    && child.headTeacher === expected.headTeacher
    && child.note === expected.note;
}

export async function createChild(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const body = await readJson(request);
  const result = validateChild(body);
  if (!result.ok) throw new ApiProblem(422, "validation", "孩子资料不合法", result.fields);
  const value = result.value;
  const duplicate = await env.DB.prepare("SELECT id FROM children WHERE nickname = ?").bind(value.nickname).first<{ id: string }>();
  if (duplicate) throw new ApiProblem(409, "duplicate", "昵称已存在");
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const child = await executeWrite(env, {
    table: "children",
    id,
    statements: [
      env.DB.prepare(
        "INSERT INTO children (id, nickname, birthday, grade, school, class_name, head_teacher, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, value.nickname, value.birthday, value.grade, value.school, value.className, value.headTeacher, value.note, timestamp, timestamp),
    ],
    read: () => readChild(env, id),
    expected: {
      nickname: value.nickname,
      birthday: value.birthday,
      grade: value.grade,
      school: value.school,
      className: value.className,
      headTeacher: value.headTeacher,
      note: value.note,
    },
    audit: {
      actor: auth.mode === "bearer" ? "cli" : "web",
      action: "create",
      table: "children",
      recordId: id,
      requestId: crypto.randomUUID(),
    },
  });
  return json(child, 201);
}

export async function updateChild(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const id = idFrom(request);
  const existing = await readChild(env, id);
  if (!existing) throw new ApiProblem(404, "not_found", "孩子不存在");
  const body = await readJson(request);
  const result = validateChild({
    nickname: body.nickname ?? existing.nickname,
    birthday: body.birthday === undefined ? existing.birthday : body.birthday,
    grade: body.grade === undefined ? existing.grade : body.grade,
    school: body.school === undefined ? existing.school : body.school,
    className: body.className === undefined ? existing.className : body.className,
    headTeacher: body.headTeacher === undefined ? existing.headTeacher : body.headTeacher,
    note: body.note === undefined ? existing.note : body.note,
  });
  if (!result.ok) throw new ApiProblem(422, "validation", "孩子资料不合法", result.fields);
  const value = result.value;
  const duplicate = await env.DB.prepare("SELECT id FROM children WHERE nickname = ? AND id != ?").bind(value.nickname, id).first<{ id: string }>();
  if (duplicate) throw new ApiProblem(409, "duplicate", "昵称已存在");
  await assertSchema(env);
  const timestamp = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      "UPDATE children SET nickname = ?, birthday = ?, grade = ?, school = ?, class_name = ?, head_teacher = ?, note = ?, updated_at = ? WHERE id = ?",
    ).bind(value.nickname, value.birthday, value.grade, value.school, value.className, value.headTeacher, value.note, timestamp, id),
  ];
  if (value.nickname !== existing.nickname) {
    statements.push(
      env.DB.prepare("UPDATE tasks SET child_name = ? WHERE child_id = ?").bind(value.nickname, id),
      env.DB.prepare("UPDATE behaviors SET child_name = ? WHERE child_id = ?").bind(value.nickname, id),
    );
  }
  try {
    await env.DB.batch([...statements, audit(env, auth, "update", id)]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiProblem(409, "duplicate", "昵称已存在");
    throw new ApiProblem(500, "write_failed", "写入未通过回读校验", undefined, { reason: String(error) });
  }
  const child = await readChild(env, id);
  if (!child || !matches(child, value)) throw new ApiProblem(500, "write_failed", "写入未通过回读校验");
  return json(child);
}

export async function deleteChild(request: Request, env: Env): Promise<Response> {
  const auth = await requireWrite(request, env);
  const id = idFrom(request);
  const child = await readChild(env, id);
  if (!child) throw new ApiProblem(404, "not_found", "孩子不存在");
  await assertSchema(env);
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE tasks SET child_id = NULL WHERE child_id = ?").bind(id),
      env.DB.prepare("UPDATE behaviors SET child_id = NULL WHERE child_id = ?").bind(id),
      env.DB.prepare("DELETE FROM children WHERE id = ?").bind(id),
      audit(env, auth, "delete", id),
    ]);
  } catch (error) {
    throw new ApiProblem(500, "write_failed", "删除未生效", undefined, { reason: String(error) });
  }
  if (await readChild(env, id)) throw new ApiProblem(500, "write_failed", "删除未生效");
  return new Response(null, { status: 204 });
}
