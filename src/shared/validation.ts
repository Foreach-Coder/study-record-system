import {
  normalizeDimension,
  normalizeSource,
  normalizeSubject,
  normalizeTone,
  normalizeType,
} from "./aliases";
import { addDays, parseDate } from "./dates";
import type { Dimension, Source, Subject, TaskImage, TaskType, Tone } from "./schema";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: Record<string, string> };

export interface ValidationContext {
  today: string;
  childNames: Set<string>;
}

export interface TaskDraft {
  childName: string;
  title: string;
  body: string;
  type: TaskType;
  subject: Subject | null;
  dueDate: string;
  startDate: string | null;
  completed: boolean;
  checked: boolean;
  images: TaskImage[];
  createdBy: string | null;
}

export interface BehaviorDraft {
  childName: string;
  title: string;
  body: string;
  occurredOn: string;
  dimension: Dimension | null;
  tone: Tone | null;
  source: Source | null;
  images: TaskImage[];
  createdBy: string | null;
}

export interface ChildDraft {
  nickname: string;
  birthday: string | null;
  grade: string | null;
  school: string | null;
  className: string | null;
  headTeacher: string | null;
  note: string | null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > max ? null : text;
}

function optionalStr(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  return str(value, max);
}

function fieldError(fields: Record<string, string>, key: string, message: string): false {
  fields[key] = message;
  return false;
}

function validRange(date: string, min: string, max: string): boolean {
  return parseDate(date) && date >= min && date <= max;
}

function normalizeImages(
  value: unknown,
): { ok: true; images: TaskImage[] } | { ok: false; message: string } {
  if (value == null) return { ok: true, images: [] };
  if (!Array.isArray(value) || value.length > 20) {
    return { ok: false, message: "最多 20 张图片" };
  }
  const images: TaskImage[] = [];
  for (const item of value) {
    const row = obj(item);
    const url = typeof item === "string" ? item : row?.url;
    if (typeof url !== "string" || !url.startsWith("/media/")) {
      return { ok: false, message: "图片必须是本地 /media/ 路径" };
    }
    images.push({ url, title: row && typeof row.title === "string" ? row.title : null });
  }
  return { ok: true, images };
}

export function validateTask(input: unknown, ctx: ValidationContext): ValidationResult<TaskDraft> {
  const data = obj(input);
  const fields: Record<string, string> = {};
  if (!data) return { ok: false, fields: { _: "请求体必须是对象" } };

  const childName = str(data.child ?? data.childName, 200);
  const title = str(data.title, 200);
  const bodyText = str(data.body, 50_000);
  const body = bodyText ?? "";
  const type = normalizeType(data.type);
  const subject = normalizeSubject(data.subject);
  const dueDate = typeof data.dueDate === "string" ? data.dueDate : "";
  const startDate = data.startDate == null || data.startDate === "" ? null : String(data.startDate);
  const maxDate = addDays(ctx.today, 400);

  if (!childName || !ctx.childNames.has(childName)) fieldError(fields, "childName", "孩子不存在");
  if (!title) fieldError(fields, "title", "标题必填");
  if (!type) fieldError(fields, "type", "类型必须是作业/待办");
  if (type === "homework" && !subject) fieldError(fields, "subject", "作业必须选科目");
  if (!validRange(dueDate, "2020-01-01", maxDate)) fieldError(fields, "dueDate", "截止日超出允许范围");
  if (startDate && !validRange(startDate, "2020-01-01", maxDate)) {
    fieldError(fields, "startDate", "开始日超出允许范围");
  }
  if (startDate && startDate > dueDate) fieldError(fields, "startDate", "开始日不能晚于截止日");
  if (bodyText === null && typeof data.body === "string" && data.body.trim().length > 50_000) {
    fieldError(fields, "body", "正文最多 50000 字");
  }

  const imageResult = normalizeImages(data.images);
  if (!imageResult.ok) fieldError(fields, "images", imageResult.message);

  const createdBy = optionalStr(data.createdBy, 50);
  let completed = data.completed === true;
  let checked = data.checked === true;
  if (checked) completed = true;
  if (!completed) checked = false;
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      childName: childName!,
      title: title!,
      body,
      type: type!,
      subject,
      dueDate,
      startDate,
      completed,
      checked,
      images: imageResult.ok ? imageResult.images : [],
      createdBy,
    },
  };
}

export function validateBehavior(
  input: unknown,
  ctx: ValidationContext,
): ValidationResult<BehaviorDraft> {
  const data = obj(input);
  const fields: Record<string, string> = {};
  if (!data) return { ok: false, fields: { _: "请求体必须是对象" } };

  const childName = str(data.child ?? data.childName, 200);
  const title = str(data.title, 200);
  const body = str(data.body, 50_000) ?? "";
  const occurredOn = typeof data.occurredOn === "string" ? data.occurredOn : "";
  if (!childName || !ctx.childNames.has(childName)) fieldError(fields, "childName", "孩子不存在");
  if (!title) fieldError(fields, "title", "标题必填");
  if (!validRange(occurredOn, "2020-01-01", ctx.today)) {
    fieldError(fields, "occurredOn", "日期不得晚于今天");
  }
  const imageResult = normalizeImages(data.images);
  if (!imageResult.ok) fieldError(fields, "images", imageResult.message);
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      childName: childName!,
      title: title!,
      body,
      occurredOn,
      dimension: normalizeDimension(data.dimension),
      tone: normalizeTone(data.tone),
      source: normalizeSource(data.source),
      images: imageResult.ok ? imageResult.images : [],
      createdBy: optionalStr(data.createdBy, 50),
    },
  };
}

export function validateChild(
  input: unknown,
  today = new Date().toISOString().slice(0, 10),
): ValidationResult<ChildDraft> {
  const data = obj(input);
  const fields: Record<string, string> = {};
  if (!data) return { ok: false, fields: { _: "请求体必须是对象" } };

  const nickname = str(data.nickname, 200);
  const birthday = data.birthday == null || data.birthday === "" ? null : String(data.birthday);
  if (!nickname) fieldError(fields, "nickname", "昵称必填");
  if (birthday && !validRange(birthday, "2005-01-01", today)) {
    fieldError(fields, "birthday", "生日超出允许范围");
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      nickname: nickname!,
      birthday,
      grade: optionalStr(data.grade, 50),
      school: optionalStr(data.school, 100),
      className: optionalStr(data.className, 50),
      headTeacher: optionalStr(data.headTeacher, 50),
      note: optionalStr(data.note, 2_000),
    },
  };
}
