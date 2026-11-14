import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  convertBulletsToChecklist,
  convertibleBullets,
  parseChecklist,
  toggleChecklistItem,
} from "../../src/shared/checklist";

const body = [
  "### 读一读",
  "- [ ] 朗读课文，读准字音",
  "- [x] 认读生字",
  "- 普通列表项",
  "",
  "### 练一练",
  "- [ ] 田字格默写",
].join("\n");

describe("parseChecklist", () => {
  it("只认 GFM 清单行，保持顺序", () => {
    const items = parseChecklist(body);
    expect(items.map((item) => item.text)).toEqual(["朗读课文，读准字音", "认读生字", "田字格默写"]);
    expect(items.map((item) => item.checked)).toEqual([false, true, false]);
    expect(items.map((item) => item.line)).toEqual([1, 2, 6]);
  });

  it("大写 X、星号与缩进都算清单", () => {
    const items = parseChecklist("  * [X] 缩进项\n+ [ ] 加号项");
    expect(items).toHaveLength(2);
    expect(items[0]?.checked).toBe(true);
  });

  it("代码块里的清单不参与", () => {
    const fenced = ["```", "- [ ] 示例", "```", "- [ ] 真实"].join("\n");
    expect(parseChecklist(fenced)).toHaveLength(1);
    expect(parseChecklist(fenced)[0]?.text).toBe("真实");
  });

  it("没有清单时返回空数组", () => {
    expect(parseChecklist("- 普通列表\n正文")).toEqual([]);
    expect(parseChecklist("")).toEqual([]);
  });
});

describe("toggleChecklistItem", () => {
  it("勾上再取消，正文其余部分不变", () => {
    const checked = toggleChecklistItem(body, 0);
    expect(checked).toContain("- [x] 朗读课文，读准字音");
    expect(checked?.split("\n")).toHaveLength(body.split("\n").length);
    const unchecked = toggleChecklistItem(checked ?? "", 0);
    expect(unchecked).toBe(body);
  });

  it("取消已勾选的项", () => {
    expect(toggleChecklistItem(body, 1)).toContain("- [ ] 认读生字");
  });

  it("越界返回 null", () => {
    expect(toggleChecklistItem(body, 9)).toBeNull();
  });
});

describe("checklistProgress", () => {
  it("统计已勾与总数", () => {
    expect(checklistProgress(body)).toEqual({ done: 1, total: 3 });
    expect(checklistProgress("没有清单")).toEqual({ done: 0, total: 0 });
  });
});

describe("convertBulletsToChecklist", () => {
  it("普通列表项转成空清单，跳过代码块和纯链接", () => {
    const source = ["### 读一读", "- 朗读课文", "1. 默写生字", "```", "- 代码里的", "```", "- [图片](/media/a.jpg)"].join("\n");
    const converted = convertBulletsToChecklist(source);
    expect(converted).toContain("- [ ] 朗读课文");
    expect(converted).toContain("1. [ ] 默写生字");
    expect(converted).toContain("- 代码里的");
    expect(converted).toContain("- [图片](/media/a.jpg)");
    expect(parseChecklist(converted)).toHaveLength(2);
  });

  it("已是清单的行不重复加标记", () => {
    const source = "- [x] 已完成\n- 未完成";
    expect(convertBulletsToChecklist(source)).toBe("- [x] 已完成\n- [ ] 未完成");
  });

  it("convertibleBullets 与转换结果一致", () => {
    const source = "- a\n- b\n- [ ] c\n纯文本";
    expect(convertibleBullets(source)).toBe(2);
    expect(parseChecklist(convertBulletsToChecklist(source))).toHaveLength(3);
  });
});
