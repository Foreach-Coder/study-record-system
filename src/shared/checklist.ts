/**
 * Markdown 清单（GFM task list）的解析与改写。
 *
 * 约定：清单的勾选状态只存在正文里（`- [ ]` / `- [x]`），没有第二份状态，
 * 所以页面显示和正文永远一致。勾选 = 改那一行，然后把整段正文 PATCH 回去。
 */

export interface ChecklistItem {
  /** 顺序号，与渲染出的 li.task-list-item 一一对应 */
  index: number;
  /** 正文行号，0 起 */
  line: number;
  checked: boolean;
  text: string;
}

const ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;

function lines(body: string): string[] {
  return (body ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function insideCodeFence(body: string): boolean[] {
  const flags: boolean[] = [];
  let fenced = false;
  for (const line of lines(body)) {
    if (FENCE.test(line)) {
      flags.push(true);
      fenced = !fenced;
      continue;
    }
    flags.push(fenced);
  }
  return flags;
}

export function parseChecklist(body: string): ChecklistItem[] {
  const fenced = insideCodeFence(body);
  const items: ChecklistItem[] = [];
  lines(body).forEach((line, index) => {
    if (fenced[index]) return;
    const match = ITEM.exec(line);
    if (!match) return;
    items.push({
      index: items.length,
      line: index,
      checked: match[3].toLowerCase() === "x",
      text: match[4].trim(),
    });
  });
  return items;
}

/** 翻转第 index 项的勾选状态，返回新正文；定位失败返回 null。 */
export function toggleChecklistItem(body: string, index: number): string | null {
  const item = parseChecklist(body)[index];
  if (!item) return null;
  const rows = lines(body);
  const line = rows[item.line];
  if (line === undefined) return null;
  rows[item.line] = line.replace(
    /^(\s*(?:[-*+]|\d{1,3}[.)])\s+)\[([ xX])\]/,
    (_, head: string, mark: string) => `${head}[${mark.toLowerCase() === "x" ? " " : "x"}]`,
  );
  return rows.join("\n");
}

export function checklistProgress(body: string): { done: number; total: number } {
  const items = parseChecklist(body);
  return { done: items.filter((item) => item.checked).length, total: items.length };
}

function convertible(bullet: string): boolean {
  const text = bullet.trim();
  if (text === "") return false;
  // 纯图片行、纯链接行不是待勾的动作
  if (text.startsWith("!")) return false;
  if (/^\[[^\]]*\]\([^)]*\)$/.test(text)) return false;
  return true;
}

/** 可转成清单的普通列表项数量（已含 `[ ]` 的不计）。 */
export function convertibleBullets(body: string): number {
  const fenced = insideCodeFence(body);
  return lines(body).filter((line, index) => {
    if (fenced[index] || ITEM.test(line)) return false;
    const match = BULLET.exec(line);
    return match ? convertible(match[3]) : false;
  }).length;
}

/** 把普通 `- ` 列表项改写成 `- [ ]`，其余行原样保留。 */
export function convertBulletsToChecklist(body: string): string {
  const fenced = insideCodeFence(body);
  const rows = lines(body);
  rows.forEach((line, index) => {
    if (fenced[index] || ITEM.test(line)) return;
    const match = BULLET.exec(line);
    if (!match || !convertible(match[3])) return;
    rows[index] = `${match[1]}${match[2] === "-" || match[2] === "*" || match[2] === "+" ? "-" : match[2]} [ ] ${match[3]}`;
  });
  return rows.join("\n");
}
