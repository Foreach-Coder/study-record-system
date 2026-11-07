import {
  DIMENSIONS,
  SOURCES,
  SUBJECTS,
  TONES,
  TASK_TYPES,
  type Dimension,
  type Source,
  type Subject,
  type TaskType,
  type Tone,
} from "./schema";

const TYPE_ALIASES: Record<string, TaskType> = {
  "作业": "homework",
  homework: "homework",
  "待办": "todo",
  todo: "todo",
};

const SUBJECT_ALIASES: Record<string, Subject> = {
  "道德与法治": "道法",
  "道法": "道法",
  other: "其他",
  "其他": "其他",
};
for (const subject of SUBJECTS) SUBJECT_ALIASES[subject] = subject;

const DIMENSION_ALIASES: Record<string, Dimension> = { other: "其他" };
for (const dimension of DIMENSIONS) DIMENSION_ALIASES[dimension] = dimension;

const TONE_ALIASES: Record<string, Tone> = {
  neutral: "中性",
  positive: "正向",
  attention: "需关注",
};
for (const tone of TONES) TONE_ALIASES[tone] = tone;

const SOURCE_ALIASES: Record<string, Source> = {
  teacher: "老师反馈",
  child: "孩子自述",
  parent: "我的观察",
};
for (const source of SOURCES) SOURCE_ALIASES[source] = source;

export function normalizeType(value: unknown): TaskType | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  const alias = TYPE_ALIASES[key];
  if (alias) return alias;
  return (TASK_TYPES as readonly string[]).includes(key) ? (key as TaskType) : null;
}

export function normalizeSubject(value: unknown): Subject | null {
  if (value == null || value === "") return null;
  return typeof value === "string" ? SUBJECT_ALIASES[value.trim()] ?? null : null;
}

export function normalizeDimension(value: unknown): Dimension | null {
  if (value == null || value === "") return null;
  return typeof value === "string" ? DIMENSION_ALIASES[value.trim()] ?? null : null;
}

export function normalizeTone(value: unknown): Tone | null {
  if (value == null || value === "") return null;
  return typeof value === "string" ? TONE_ALIASES[value.trim()] ?? null : null;
}

export function normalizeSource(value: unknown): Source | null {
  if (value == null || value === "") return null;
  return typeof value === "string" ? SOURCE_ALIASES[value.trim()] ?? null : null;
}
