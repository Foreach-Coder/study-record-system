import { describe, expect, it, vi } from "vitest";
import {
  normalizeDimension,
  normalizeSource,
  normalizeSubject,
  normalizeTone,
  normalizeType,
} from "../../src/shared/aliases";
import { addDays } from "../../src/shared/dates";
import { validateBehavior, validateChild, validateTask } from "../../src/shared/validation";

const ctx = { today: "2026-11-07", childNames: new Set(["李律研"]) };

const baseTask = {
  child: "李律研",
  title: "x",
  body: "",
  type: "todo",
  dueDate: "2026-11-08",
};

const baseBehavior = {
  child: "李律研",
  title: "x",
  body: "",
  occurredOn: "2026-11-07",
};

function taskFields(input: unknown): Record<string, string> {
  const result = validateTask(input, ctx);
  if (result.ok) throw new Error("expected validateTask to fail");
  return result.fields;
}

function behaviorFields(input: unknown): Record<string, string> {
  const result = validateBehavior(input, ctx);
  if (result.ok) throw new Error("expected validateBehavior to fail");
  return result.fields;
}

function childFields(input: unknown, today?: string): Record<string, string> {
  const result = validateChild(input, today);
  if (result.ok) throw new Error("expected validateChild to fail");
  return result.fields;
}

describe("aliases", () => {
  it("normalizes legacy type and subject labels", () => {
    expect(normalizeType("作业")).toBe("homework");
    expect(normalizeType("待办")).toBe("todo");
    expect(normalizeType("功课")).toBe("homework");
    expect(normalizeType("任务")).toBe("todo");
    expect(normalizeType("事项")).toBe("todo");
    expect(normalizeType("task")).toBe("todo");
    expect(normalizeType("homework")).toBe("homework");
    expect(normalizeType("home")).toBeNull();

    expect(normalizeSubject("道法")).toBe("道法");
    expect(normalizeSubject("道德与法治")).toBe("道法");
    expect(normalizeSubject("other")).toBe("其他");
    expect(normalizeSubject("语")).toBe("语文");
    expect(normalizeSubject("数")).toBe("数学");
    expect(normalizeSubject("英")).toBe("英语");
    expect(normalizeSubject("科")).toBe("科学");
    expect(normalizeSubject("道")).toBe("道法");
    expect(normalizeSubject("体")).toBe("体育");
    expect(normalizeSubject("美")).toBe("美术");
    expect(normalizeSubject("音")).toBe("音乐");
    expect(normalizeSubject("chinese")).toBe("语文");
    expect(normalizeSubject("math")).toBe("数学");
    expect(normalizeSubject("english")).toBe("英语");
    expect(normalizeSubject("science")).toBe("科学");
    expect(normalizeSubject("moral")).toBe("道法");
    expect(normalizeSubject("pe")).toBe("体育");
    expect(normalizeSubject("art")).toBe("美术");
    expect(normalizeSubject("music")).toBe("音乐");
    expect(normalizeSubject("语文")).toBe("语文");
  });

  it("normalizes legacy dimension, tone and source labels", () => {
    expect(normalizeDimension("学业")).toBe("学习");
    expect(normalizeDimension("课堂")).toBe("学习");
    expect(normalizeDimension("行为")).toBe("纪律");
    expect(normalizeDimension("品德")).toBe("品格");
    expect(normalizeDimension("心情")).toBe("情绪");
    expect(normalizeDimension("同学关系")).toBe("社交");
    expect(normalizeDimension("study")).toBe("学习");
    expect(normalizeDimension("other")).toBe("其他");
    expect(normalizeDimension("学习")).toBe("学习");

    expect(normalizeTone("好")).toBe("正向");
    expect(normalizeTone("表扬")).toBe("正向");
    expect(normalizeTone("优秀")).toBe("正向");
    expect(normalizeTone("问题")).toBe("需关注");
    expect(normalizeTone("注意")).toBe("需关注");
    expect(normalizeTone("一般")).toBe("中性");
    expect(normalizeTone("positive")).toBe("正向");
    expect(normalizeTone("attention")).toBe("需关注");
    expect(normalizeTone("neutral")).toBe("中性");
    expect(normalizeTone("正向")).toBe("正向");

    expect(normalizeSource("老师")).toBe("老师反馈");
    expect(normalizeSource("孩子")).toBe("孩子自述");
    expect(normalizeSource("我")).toBe("我的观察");
    expect(normalizeSource("家长观察")).toBe("我的观察");
    expect(normalizeSource("teacher")).toBe("老师反馈");
    expect(normalizeSource("child")).toBe("孩子自述");
    expect(normalizeSource("parent")).toBe("我的观察");
    expect(normalizeSource("self")).toBe("我的观察");
    expect(normalizeSource("老师反馈")).toBe("老师反馈");
  });
});

describe("validateTask", () => {
  it("accepts a valid homework", () => {
    const result = validateTask({
      child: "李律研",
      title: "熟读拼音三表",
      body: "### 读什么\n三表",
      type: "作业",
      subject: "语文",
      dueDate: "2026-11-08",
      startDate: "2026-11-07",
      images: [],
      createdBy: "爸爸",
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("homework");
      expect(result.value.subject).toBe("语文");
      expect(result.value.startDate).toBe("2026-11-07");
    }
  });

  it("stores normalized type and subject values", () => {
    const result = validateTask({ ...baseTask, type: "功课", subject: "道德与法治" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("homework");
      expect(result.value.subject).toBe("道法");
    }
  });

  it("rejects a missing title, missing subject and external images", () => {
    expect(validateTask({ child: "李律研", title: "", body: "", type: "作业", subject: "语文", dueDate: "2026-11-08" }, ctx).ok).toBe(false);
    expect(validateTask({ child: "李律研", title: "x", body: "", type: "作业", subject: "", dueDate: "2026-11-08" }, ctx).ok).toBe(false);
    expect(validateTask({ child: "李律研", title: "x", body: "", type: "作业", subject: "语文", dueDate: "2026-11-08", images: [{ url: "https://example.com/a.jpg", title: null }] }, ctx).ok).toBe(false);
  });

  it("rejects an unknown child", () => {
    expect(taskFields({ ...baseTask, child: "别人的孩子" }).childName).toBe("孩子不存在");
  });

  it("falls back to childName when child is empty", () => {
    const result = validateTask({ ...baseTask, child: "", childName: "李律研" }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.childName).toBe("李律研");
  });

  it("rejects a startDate after the dueDate", () => {
    expect(taskFields({ ...baseTask, startDate: "2026-11-09" }).startDate).toBe("开始日不能晚于截止日");
  });

  it("does not cross-check dates that are missing or malformed", () => {
    const missingDue = taskFields({ ...baseTask, dueDate: undefined, startDate: "2026-11-07" });
    expect(missingDue.dueDate).toBe("截止日必填");
    expect(missingDue.startDate).toBeUndefined();

    const malformedStart = taskFields({ ...baseTask, startDate: "abc" });
    expect(malformedStart.startDate).toBe("开始日格式必须是 YYYY-MM-DD");
  });

  it("accepts the allowed date boundaries", () => {
    expect(validateTask({ ...baseTask, dueDate: "2020-01-01" }, ctx).ok).toBe(true);
    expect(validateTask({ ...baseTask, dueDate: addDays(ctx.today, 400) }, ctx).ok).toBe(true);
    expect(taskFields({ ...baseTask, dueDate: "2019-12-31" }).dueDate).toBe("截止日超出允许范围");
    expect(taskFields({ ...baseTask, dueDate: addDays(ctx.today, 401) }).dueDate).toBe("截止日超出允许范围");
  });

  it("rejects a title or body over its limit", () => {
    expect(taskFields({ ...baseTask, title: "a".repeat(201) }).title).toBe("标题最多 200 字");
    expect(taskFields({ ...baseTask, body: "a".repeat(50_001) }).body).toBe("正文最多 50000 字");
    expect(taskFields({ ...baseTask, createdBy: "a".repeat(51) }).createdBy).toBe("创建人最多 50 字");

    expect(validateTask({ ...baseTask, title: "a".repeat(200), body: "a".repeat(50_000), createdBy: "a".repeat(50) }, ctx).ok).toBe(true);
  });

  it("rejects wrong-typed fields instead of coercing them", () => {
    expect(taskFields({ ...baseTask, body: 12345 }).body).toBe("正文必须是字符串");
    expect(taskFields({ ...baseTask, completed: "true" }).completed).toBe("完成必须是布尔值");
    expect(taskFields({ ...baseTask, checked: "true" }).checked).toBe("勾选必须是布尔值");
    expect(taskFields({ ...baseTask, title: 42 }).title).toBe("标题必须是字符串");
    expect(taskFields({ ...baseTask, createdBy: 42 }).createdBy).toBe("创建人必须是字符串");
  });

  it("rejects images that are not an array or over the limit", () => {
    const twentyOne = Array.from({ length: 21 }, (_, index) => ({ url: `/media/${index}.jpg`, title: null }));
    expect(taskFields({ ...baseTask, images: twentyOne }).images).toBe("最多 20 张图片");
    expect(taskFields({ ...baseTask, images: {} }).images).toBe("图片必须是数组");
  });

  it("normalizes an empty image title to null", () => {
    const result = validateTask({ ...baseTask, images: [{ url: "/media/a.jpg", title: "" }] }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.images).toEqual([{ url: "/media/a.jpg", title: null }]);
  });

  it("forces checked to completed", () => {
    const result = validateTask({
      child: "李律研", title: "x", body: "", type: "todo", dueDate: "2026-11-08",
      completed: false, checked: true,
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.completed).toBe(true);
      expect(result.value.checked).toBe(true);
    }
  });

  it("keeps completed tasks unchecked and preserves completed without checked", () => {
    const unchecked = validateTask({ ...baseTask, completed: true, checked: false }, ctx);
    expect(unchecked.ok).toBe(true);
    if (unchecked.ok) {
      expect(unchecked.value.completed).toBe(true);
      expect(unchecked.value.checked).toBe(false);
    }

    const neither = validateTask({ ...baseTask, completed: false, checked: false }, ctx);
    expect(neither.ok).toBe(true);
    if (neither.ok) {
      expect(neither.value.completed).toBe(false);
      expect(neither.value.checked).toBe(false);
    }
  });
});

describe("validateBehavior", () => {
  it("accepts a valid behavior and normalizes aliases", () => {
    const result = validateBehavior({
      child: "李律研",
      title: "课堂发言",
      body: "",
      occurredOn: "2026-11-07",
      dimension: "课堂",
      tone: "表扬",
      source: "老师",
    }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dimension).toBe("学习");
      expect(result.value.tone).toBe("正向");
      expect(result.value.source).toBe("老师反馈");
    }
  });

  it("rejects a future occurredOn", () => {
    expect(behaviorFields({ ...baseBehavior, occurredOn: "2026-11-08" }).occurredOn).toBe("日期不得晚于今天");
  });

  it("distinguishes missing, malformed and out-of-range dates", () => {
    expect(behaviorFields({ ...baseBehavior, occurredOn: undefined }).occurredOn).toBe("日期必填");
    expect(behaviorFields({ ...baseBehavior, occurredOn: "2026/11/07" }).occurredOn).toBe("日期格式必须是 YYYY-MM-DD");
    expect(behaviorFields({ ...baseBehavior, occurredOn: "2019-12-31" }).occurredOn).toBe("日期超出允许范围");
    expect(validateBehavior({ ...baseBehavior }, ctx).ok).toBe(true);
  });

  it("rejects a behavior body over 50000 characters", () => {
    expect(behaviorFields({ ...baseBehavior, body: "a".repeat(50_001) }).body).toBe("正文最多 50000 字");
    expect(behaviorFields({ ...baseBehavior, body: 12345 }).body).toBe("正文必须是字符串");
    expect(validateBehavior({ ...baseBehavior, body: "a".repeat(50_000) }, ctx).ok).toBe(true);
  });

  it("rejects a title over its limit and an unknown child", () => {
    expect(behaviorFields({ ...baseBehavior, title: "a".repeat(201) }).title).toBe("标题最多 200 字");
    expect(behaviorFields({ ...baseBehavior, child: "别人的孩子" }).childName).toBe("孩子不存在");
  });
});

describe("validateChild", () => {
  it("accepts a valid child", () => {
    const result = validateChild({
      nickname: "李律研",
      birthday: "2014-05-01",
      grade: "五年级",
      school: "松山湖中心小学",
      className: "五（12）班",
      headTeacher: "王老师",
      note: "安静",
    }, "2026-11-07");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.birthday).toBe("2014-05-01");
      expect(result.value.note).toBe("安静");
    }
  });

  it("rejects a missing or over-long nickname", () => {
    expect(childFields({ nickname: "" }).nickname).toBe("昵称必填");
    expect(childFields({ nickname: "a".repeat(201) }).nickname).toBe("昵称最多 200 字");
  });

  it("enforces the birthday range", () => {
    expect(validateChild({ nickname: "李律研", birthday: "2005-01-01" }, "2026-11-07").ok).toBe(true);
    expect(validateChild({ nickname: "李律研", birthday: "2026-11-07" }, "2026-11-07").ok).toBe(true);
    expect(childFields({ nickname: "李律研", birthday: "2004-12-31" }, "2026-11-07").birthday).toBe("生日超出允许范围");
    expect(childFields({ nickname: "李律研", birthday: "2026-11-08" }, "2026-11-07").birthday).toBe("生日超出允许范围");
    expect(childFields({ nickname: "李律研", birthday: "abc" }, "2026-11-07").birthday).toBe("生日格式必须是 YYYY-MM-DD");
  });

  it("rejects optional fields over their limits", () => {
    expect(childFields({ nickname: "x", grade: "a".repeat(51) }).grade).toBe("年级最多 50 字");
    expect(childFields({ nickname: "x", school: "a".repeat(101) }).school).toBe("学校最多 100 字");
    expect(childFields({ nickname: "x", className: "a".repeat(51) }).className).toBe("班级最多 50 字");
    expect(childFields({ nickname: "x", headTeacher: "a".repeat(51) }).headTeacher).toBe("班主任最多 50 字");
    expect(childFields({ nickname: "x", note: "a".repeat(2_001) }).note).toBe("备注最多 2000 字");
  });

  it("treats absent optional fields as null", () => {
    const result = validateChild({ nickname: "x", grade: "", school: null }, "2026-11-07");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.birthday).toBeNull();
      expect(result.value.grade).toBeNull();
      expect(result.value.school).toBeNull();
    }
  });

  it("uses Asia/Shanghai for the default today", () => {
    vi.useFakeTimers();
    try {
      // 2026-11-07T16:30Z is already 2026-11-08 00:30 in Shanghai.
      vi.setSystemTime(new Date("2026-11-07T16:30:00Z"));
      expect(validateChild({ nickname: "李律研", birthday: "2026-11-08" }).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
