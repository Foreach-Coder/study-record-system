import { describe, expect, it } from "vitest";
import { normalizeSubject, normalizeType } from "../../src/shared/aliases";
import { validateBehavior, validateTask } from "../../src/shared/validation";

const ctx = { today: "2026-11-07", childNames: new Set(["李律研"]) };

describe("aliases", () => {
  it("normalizes legacy labels", () => {
    expect(normalizeType("作业")).toBe("homework");
    expect(normalizeType("待办")).toBe("todo");
    expect(normalizeSubject("道法")).toBe("道法");
    expect(normalizeSubject("道德与法治")).toBe("道法");
    expect(normalizeSubject("other")).toBe("其他");
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

  it("rejects missing title, missing subject, future behavior and external images", () => {
    expect(validateTask({ child: "李律研", title: "", body: "", type: "作业", subject: "语文", dueDate: "2026-11-08" }, ctx).ok).toBe(false);
    expect(validateTask({ child: "李律研", title: "x", body: "", type: "作业", subject: "", dueDate: "2026-11-08" }, ctx).ok).toBe(false);
    expect(validateTask({ child: "李律研", title: "x", body: "", type: "作业", subject: "语文", dueDate: "2026-11-08", images: [{ url: "https://example.com/a.jpg", title: null }] }, ctx).ok).toBe(false);
    expect(validateBehavior({ child: "李律研", title: "x", body: "", occurredOn: "2026-11-08" }, ctx).ok).toBe(false);
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
});
