import { describe, expect, it } from "vitest";
import type { Task } from "../../src/shared/schema";
import { groupCompletedTasks, groupTasks, todayTasks } from "../../src/shared/grouping";
import { groupHeader, progress, taskLabel } from "../../src/shared/labels";

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? "t1", childId: "c1", childName: "李律研", title: "任务", body: "",
    type: "homework", subject: "语文", dueDate: "2026-11-08", startDate: "2026-11-07",
    completed: false, checked: false, images: [], attachments: [], createdBy: null,
    createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
    ...over,
  };
}

describe("todayTasks", () => {
  it("keeps overdue and in-horizon tasks, drops future and completed", () => {
    const tasks = [
      task({ id: "overdue", dueDate: "2026-11-06" }),
      task({ id: "today", dueDate: "2026-11-07" }),
      task({ id: "horizon", dueDate: "2026-11-09" }),
      task({ id: "future", dueDate: "2026-11-10", startDate: "2026-11-10" }),
      task({ id: "done", dueDate: "2026-11-07", completed: true }),
      task({ id: "starts-later", dueDate: "2026-11-08", startDate: "2026-11-09" }),
    ];
    expect(todayTasks(tasks, "2026-11-07", "2026-11-09").map((t) => t.id))
      .toEqual(["overdue", "today", "horizon"]);
  });

  it("keeps started tasks even when their due date is beyond the horizon", () => {
    const tasks = [
      task({ id: "started", dueDate: "2026-11-20", startDate: "2026-11-07" }),
      task({ id: "not-started", dueDate: "2026-11-20", startDate: "2026-11-10" }),
      task({ id: "no-start", dueDate: "2026-11-20", startDate: null }),
    ];
    expect(todayTasks(tasks, "2026-11-07", "2026-11-07").map((t) => t.id))
      .toEqual(["started"]);
  });
});

describe("groupTasks", () => {
  it("groups by start date, falling back to due date when start is null", () => {
    const groups = groupTasks([
      task({ id: "a", startDate: "2026-11-08", dueDate: "2026-11-09" }),
      task({ id: "b", startDate: "2026-11-08", dueDate: "2026-11-08" }),
      task({ id: "c", startDate: null, dueDate: "2026-11-07" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-11-07", "2026-11-08"]);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("groups completed tasks by due date descending", () => {
    const groups = groupCompletedTasks([
      task({ id: "old", dueDate: "2026-11-06", completed: true }),
      task({ id: "new", dueDate: "2026-11-08", completed: true }),
      task({ id: "same", dueDate: "2026-11-08", completed: true }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-11-08", "2026-11-06"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["new", "same"]);
  });
});

describe("labels and progress", () => {
  it("labels due dates and completion", () => {
    expect(taskLabel(task({ dueDate: "2026-11-07" }), "2026-11-07")).toEqual({ text: "今天截止 · 11-07", tone: "today" });
    expect(taskLabel(task({ dueDate: "2026-11-06" }), "2026-11-07")).toEqual({ text: "昨天截止 · 11-06", tone: "overdue" });
    expect(taskLabel(task({ dueDate: "2026-11-09" }), "2026-11-07")).toEqual({ text: "后天截止 · 11-09", tone: "neutral" });
    expect(groupHeader({ key: "2026-11-07", tasks: [task({ completed: true })] }, "2026-11-07")).toBe("今天 · 11-07 · 已全部完成");
    expect(progress([task({ completed: true }), task({ id: "t2" })], "2026-11-07")).toEqual({ total: 2, done: 1, percent: 50 });
  });
});
