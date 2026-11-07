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
  "功课": "homework",
  homework: "homework",
  "待办": "todo",
  "任务": "todo",
  "事项": "todo",
  task: "todo",
  todo: "todo",
};

const SUBJECT_ALIASES: Record<string, Subject> = {
  "道德与法治": "道法",
  "道法": "道法",
  "道": "道法",
  "语": "语文",
  "数": "数学",
  "英": "英语",
  "科": "科学",
  "体": "体育",
  "美": "美术",
  "音": "音乐",
  "其他": "其他",
  other: "其他",
  chinese: "语文",
  math: "数学",
  english: "英语",
  science: "科学",
  moral: "道法",
  pe: "体育",
  art: "美术",
  music: "音乐",
};
for (const subject of SUBJECTS) SUBJECT_ALIASES[subject] = subject;

const DIMENSION_ALIASES: Record<string, Dimension> = {
  "学业": "学习",
  "课堂": "学习",
  "行为": "纪律",
  "品德": "品格",
  "心情": "情绪",
  "同学关系": "社交",
  "其他": "其他",
  other: "其他",
  study: "学习",
  discipline: "纪律",
  character: "品格",
  emotion: "情绪",
  social: "社交",
};
for (const dimension of DIMENSIONS) DIMENSION_ALIASES[dimension] = dimension;

const TONE_ALIASES: Record<string, Tone> = {
  "好": "正向",
  "表扬": "正向",
  "优秀": "正向",
  "问题": "需关注",
  "注意": "需关注",
  "一般": "中性",
  positive: "正向",
  attention: "需关注",
  neutral: "中性",
};
for (const tone of TONES) TONE_ALIASES[tone] = tone;

const SOURCE_ALIASES: Record<string, Source> = {
  "老师": "老师反馈",
  "孩子": "孩子自述",
  "我": "我的观察",
  "家长观察": "我的观察",
  teacher: "老师反馈",
  child: "孩子自述",
  parent: "我的观察",
  self: "我的观察",
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
