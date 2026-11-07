import type { Behavior, Child, Task, TaskImage } from "../shared/schema";
import type { Env } from "./env";

export type Row = Record<string, unknown>;

export function parseImages(value: unknown): TaskImage[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { url: string; title?: unknown } => Boolean(item) && typeof item === "object" && typeof (item as { url?: unknown }).url === "string")
      .map((item) => ({ url: item.url, title: typeof item.title === "string" ? item.title : null }));
  } catch {
    return [];
  }
}

export function childFromRow(row: Row): Child {
  return {
    id: String(row.id),
    nickname: String(row.nickname),
    birthday: row.birthday == null ? null : String(row.birthday),
    grade: row.grade == null ? null : String(row.grade),
    school: row.school == null ? null : String(row.school),
    className: row.class_name == null ? null : String(row.class_name),
    headTeacher: row.head_teacher == null ? null : String(row.head_teacher),
    note: row.note == null ? null : String(row.note),
  };
}

export function taskFromRow(row: Row): Task {
  return {
    id: String(row.id),
    childId: row.child_id == null ? null : String(row.child_id),
    childName: String(row.child_name),
    title: String(row.title),
    body: String(row.body ?? ""),
    type: row.type as Task["type"],
    subject: row.subject == null ? null : (row.subject as Task["subject"]),
    dueDate: String(row.due_date),
    startDate: row.start_date == null ? null : String(row.start_date),
    completed: Number(row.completed) === 1,
    checked: Number(row.checked) === 1,
    images: parseImages(row.images),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function behaviorFromRow(row: Row): Behavior {
  return {
    id: String(row.id),
    childId: row.child_id == null ? null : String(row.child_id),
    childName: String(row.child_name),
    title: String(row.title),
    body: String(row.body ?? ""),
    occurredOn: String(row.occurred_on),
    dimension: row.dimension == null ? null : (row.dimension as Behavior["dimension"]),
    tone: row.tone == null ? null : (row.tone as Behavior["tone"]),
    source: row.source == null ? null : (row.source as Behavior["source"]),
    images: parseImages(row.images),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function readChild(env: Env, id: string): Promise<Child | null> {
  const row = await env.DB.prepare("SELECT * FROM children WHERE id = ?").bind(id).first<Row>();
  return row ? childFromRow(row) : null;
}

export async function readTask(env: Env, id: string): Promise<Task | null> {
  const row = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Row>();
  return row ? taskFromRow(row) : null;
}

export async function readBehavior(env: Env, id: string): Promise<Behavior | null> {
  const row = await env.DB.prepare("SELECT * FROM behaviors WHERE id = ?").bind(id).first<Row>();
  return row ? behaviorFromRow(row) : null;
}
