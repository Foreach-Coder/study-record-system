import type { Task } from "./schema";

export interface TaskGroup {
  key: string;
  tasks: Task[];
}

function groupKey(task: Task): string {
  return task.startDate ?? task.dueDate ?? "unscheduled";
}

export function todayTasks(tasks: Task[], today: string, horizon: string, includeCompleted = false): Task[] {
  return tasks.filter((task) => {
    if (!includeCompleted && task.completed) return false;
    if (task.dueDate < today) return true;
    // 已开始的任务一直留在今天页，即使截止日还在视野之外；
    // 这样“今天开始、下周截止”的作业/待办不会消失。
    if (task.startDate && task.startDate <= today) return true;
    if (task.dueDate > horizon) return false;
    return !task.startDate || task.startDate <= today;
  });
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    const aKey = groupKey(a);
    const bKey = groupKey(b);
    if (aKey !== bKey) {
      if (aKey === "unscheduled") return 1;
      if (bKey === "unscheduled") return -1;
      return aKey.localeCompare(bKey);
    }

    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);

    const byTitle = a.title.localeCompare(b.title, "zh-CN");
    if (byTitle !== 0) return byTitle;

    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

export function groupTasks(tasks: Task[], includeCompleted = false): TaskGroup[] {
  const groups: TaskGroup[] = [];
  for (const task of sortTasks(tasks)) {
    if (task.completed && !includeCompleted) continue;
    const key = groupKey(task);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.tasks.push(task);
    else groups.push({ key, tasks: [task] });
  }
  return groups;
}

export function groupCompletedTasks(tasks: Task[]): TaskGroup[] {
  const sorted = [...tasks].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return b.dueDate.localeCompare(a.dueDate);
    const byTitle = a.title.localeCompare(b.title, "zh-CN");
    if (byTitle !== 0) return byTitle;
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
  const groups: TaskGroup[] = [];
  for (const task of sorted) {
    const key = task.dueDate;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.tasks.push(task);
    else groups.push({ key, tasks: [task] });
  }
  return groups;
}
