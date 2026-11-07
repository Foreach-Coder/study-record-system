import {
  normalizeDimension,
  normalizeSource,
  normalizeSubject,
  normalizeTone,
  normalizeType,
} from "./aliases";
import { addDays, parseDate, todayInShanghai } from "./dates";
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

const MIN_DATE = "2020-01-01";
const MIN_BIRTHDAY = "2005-01-01";
const MAX_BODY = 50_000;

interface DateRule {
  label: string;
  required: boolean;
  min: string;
  max: string;
  /** Message used instead of the range message when the date is later than `max`. */
  futureMessage?: string;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fieldError(fields: Record<string, string>, key: string, message: string): void {
  fields[key] = message;
}

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/** Resolves `child` with `childName` as the fallback; an empty `child` means "unset". */
function resolveChild(value: Record<string, unknown>): unknown {
  return isBlank(value.child) ? value.childName : value.child;
}

/** Required string with a maximum length; records a specific field error for each failure mode. */
function requiredText(
  value: unknown,
  max: number,
  fields: Record<string, string>,
  key: string,
  label: string,
  requiredMessage: string,
): string {
  if (isBlank(value)) {
    fieldError(fields, key, requiredMessage);
    return "";
  }
  if (typeof value !== "string") {
    fieldError(fields, key, `${label}必须是字符串`);
    return "";
  }
  const text = value.trim();
  if (text.length > max) {
    fieldError(fields, key, `${label}最多 ${max} 字`);
    return "";
  }
  return text;
}

/** Optional string: absent (null/undefined/"") becomes null; invalid values are rejected. */
function optionalText(
  value: unknown,
  max: number,
  fields: Record<string, string>,
  key: string,
  label: string,
): string | null {
  if (isBlank(value)) return null;
  if (typeof value !== "string") {
    fieldError(fields, key, `${label}必须是字符串`);
    return null;
  }
  const text = value.trim();
  if (text.length > max) {
    fieldError(fields, key, `${label}最多 ${max} 字`);
    return null;
  }
  return text;
}

function readBody(value: unknown, fields: Record<string, string>): string {
  if (isBlank(value)) return "";
  if (typeof value !== "string") {
    fieldError(fields, "body", "正文必须是字符串");
    return "";
  }
  const text = value.trim();
  if (text.length > MAX_BODY) {
    fieldError(fields, "body", "正文最多 50000 字");
    return "";
  }
  return text;
}

/**
 * Reads and validates one YYYY-MM-DD date. Returns the trimmed value only when it is
 * present, well formed and inside the allowed range; otherwise records a field error and
 * returns "" so downstream cross-checks never see an invalid value.
 */
function readDate(
  value: unknown,
  fields: Record<string, string>,
  key: string,
  rule: DateRule,
): string {
  if (isBlank(value)) {
    if (rule.required) fieldError(fields, key, `${rule.label}必填`);
    return "";
  }
  if (typeof value !== "string") {
    fieldError(fields, key, `${rule.label}格式必须是 YYYY-MM-DD`);
    return "";
  }
  const text = value.trim();
  if (!parseDate(text)) {
    fieldError(fields, key, `${rule.label}格式必须是 YYYY-MM-DD`);
    return "";
  }
  if (text > rule.max && rule.futureMessage) {
    fieldError(fields, key, rule.futureMessage);
    return "";
  }
  if (text < rule.min || text > rule.max) {
    fieldError(fields, key, `${rule.label}超出允许范围`);
    return "";
  }
  return text;
}

function normalizeImages(
  value: unknown,
): { ok: true; images: TaskImage[] } | { ok: false; message: string } {
  if (value == null) return { ok: true, images: [] };
  if (!Array.isArray(value)) return { ok: false, message: "图片必须是数组" };
  if (value.length > 20) return { ok: false, message: "最多 20 张图片" };
  const images: TaskImage[] = [];
  for (const item of value) {
    const row = obj(item);
    const url = typeof item === "string" ? item : row?.url;
    if (typeof url !== "string" || !url.startsWith("/media/")) {
      return { ok: false, message: "图片必须是本地 /media/ 路径" };
    }
    const title = row?.title;
    images.push({
      url,
      title: typeof title === "string" && title.trim() !== "" ? title.trim() : null,
    });
  }
  return { ok: true, images };
}

export function validateTask(input: unknown, ctx: ValidationContext): ValidationResult<TaskDraft> {
  const data = obj(input);
  const fields: Record<string, string> = {};
  if (!data) return { ok: false, fields: { _: "请求体必须是对象" } };

  const childName = requiredText(resolveChild(data), 200, fields, "childName", "孩子", "孩子不存在");
  const title = requiredText(data.title, 200, fields, "title", "标题", "标题必填");
  const body = readBody(data.body, fields);
  const type = normalizeType(data.type);
  const subject = normalizeSubject(data.subject);
  const maxDate = addDays(ctx.today, 400);
  const dueDate = readDate(data.dueDate, fields, "dueDate", {
    label: "截止日",
    required: true,
    min: MIN_DATE,
    max: maxDate,
  });
  const startDate = readDate(data.startDate, fields, "startDate", {
    label: "开始日",
    required: false,
    min: MIN_DATE,
    max: maxDate,
  });

  if (childName && !ctx.childNames.has(childName)) {
    fieldError(fields, "childName", "孩子不存在");
  }
  if (!type) fieldError(fields, "type", "类型必须是作业/待办");
  if (type === "homework" && !subject) fieldError(fields, "subject", "作业必须选科目");
  if (startDate && dueDate && startDate > dueDate) {
    fieldError(fields, "startDate", "开始日不能晚于截止日");
  }
  if (data.completed != null && typeof data.completed !== "boolean") {
    fieldError(fields, "completed", "完成必须是布尔值");
  }
  if (data.checked != null && typeof data.checked !== "boolean") {
    fieldError(fields, "checked", "勾选必须是布尔值");
  }

  const createdBy = optionalText(data.createdBy, 50, fields, "createdBy", "创建人");
  const imageResult = normalizeImages(data.images);
  if (!imageResult.ok) fieldError(fields, "images", imageResult.message);

  let completed = data.completed === true;
  let checked = data.checked === true;
  if (checked) completed = true;
  if (!completed) checked = false;

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      childName,
      title,
      body,
      type: type!,
      subject,
      dueDate,
      startDate: startDate === "" ? null : startDate,
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

  const childName = requiredText(resolveChild(data), 200, fields, "childName", "孩子", "孩子不存在");
  const title = requiredText(data.title, 200, fields, "title", "标题", "标题必填");
  const body = readBody(data.body, fields);
  const occurredOn = readDate(data.occurredOn, fields, "occurredOn", {
    label: "日期",
    required: true,
    min: MIN_DATE,
    max: ctx.today,
    futureMessage: "日期不得晚于今天",
  });

  if (childName && !ctx.childNames.has(childName)) {
    fieldError(fields, "childName", "孩子不存在");
  }

  const createdBy = optionalText(data.createdBy, 50, fields, "createdBy", "创建人");
  const imageResult = normalizeImages(data.images);
  if (!imageResult.ok) fieldError(fields, "images", imageResult.message);

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      childName,
      title,
      body,
      occurredOn,
      dimension: normalizeDimension(data.dimension),
      tone: normalizeTone(data.tone),
      source: normalizeSource(data.source),
      images: imageResult.ok ? imageResult.images : [],
      createdBy,
    },
  };
}

export function validateChild(
  input: unknown,
  today: string = todayInShanghai(),
): ValidationResult<ChildDraft> {
  const data = obj(input);
  const fields: Record<string, string> = {};
  if (!data) return { ok: false, fields: { _: "请求体必须是对象" } };

  const nickname = requiredText(data.nickname, 200, fields, "nickname", "昵称", "昵称必填");
  const birthday = readDate(data.birthday, fields, "birthday", {
    label: "生日",
    required: false,
    min: MIN_BIRTHDAY,
    max: today,
  });
  const grade = optionalText(data.grade, 50, fields, "grade", "年级");
  const school = optionalText(data.school, 100, fields, "school", "学校");
  const className = optionalText(data.className, 50, fields, "className", "班级");
  const headTeacher = optionalText(data.headTeacher, 50, fields, "headTeacher", "班主任");
  const note = optionalText(data.note, 2_000, fields, "note", "备注");

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      nickname,
      birthday: birthday === "" ? null : birthday,
      grade,
      school,
      className,
      headTeacher,
      note,
    },
  };
}
