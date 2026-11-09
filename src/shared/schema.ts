export const SCHEMA_VERSION = 1;

export const SUBJECTS = ["语文", "数学", "英语", "科学", "道法", "体育", "美术", "音乐", "其他"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const TASK_TYPES = ["homework", "todo"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const DIMENSIONS = ["学习", "纪律", "品格", "情绪", "社交", "其他"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const TONES = ["正向", "中性", "需关注"] as const;
export type Tone = (typeof TONES)[number];

export const SOURCES = ["老师反馈", "孩子自述", "我的观察"] as const;
export type Source = (typeof SOURCES)[number];

export interface TaskImage { url: string; title: string | null; }

export interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface Child {
  id: string;
  nickname: string;
  birthday: string | null;
  grade: string | null;
  school: string | null;
  className: string | null;
  headTeacher: string | null;
  note: string | null;
}

export interface Task {
  id: string;
  childId: string | null;
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
  attachments: Attachment[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Behavior {
  id: string;
  childId: string | null;
  childName: string;
  title: string;
  body: string;
  occurredOn: string;
  dimension: Dimension | null;
  tone: Tone | null;
  source: Source | null;
  images: TaskImage[];
  attachments: Attachment[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  schemaVersion: number;
  today: string;
  serverTime: string;
  children: Child[];
  tasks: Task[];
  behaviors: Behavior[];
}
