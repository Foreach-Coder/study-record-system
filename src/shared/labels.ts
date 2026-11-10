import type { Task } from "./schema";
import type { TaskGroup } from "./grouping";
import { computeHorizon } from "./horizon";
import { relativeDay } from "./relative";

export type TaskLabelTone = "overdue" | "today" | "neutral";

export interface TaskLabel {
  text: string;
  tone: TaskLabelTone;
}

export function taskLabel(task: Task, today: string): TaskLabel | null {
  if (!task.startDate) return null;
  const due = relativeDay(task.dueDate, today);
  if (!task.completed && task.dueDate < today) {
    return { text: `${due}截止`, tone: "overdue" };
  }
  if (task.dueDate === today) return { text: `${due}截止`, tone: "today" };
  return { text: `${due}截止`, tone: "neutral" };
}

export function groupHeader(group: TaskGroup, today: string): string {
  const allDone = group.tasks.length > 0 && group.tasks.every((task) => task.completed);
  const date = group.key === "unscheduled" ? "未安排开始日" : relativeDay(group.key, today);
  return allDone ? `${date} · 已全部完成` : date;
}

export function progress(
  tasks: Task[],
  today: string,
  horizon: string = computeHorizon(today),
): { total: number; done: number; percent: number } {
  const eligible = tasks.filter(
    (task) => task.dueDate <= horizon && (!task.startDate || task.startDate <= today),
  );
  const total = eligible.length;
  const done = eligible.filter((task) => task.completed).length;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
