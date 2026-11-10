import { parseDate } from "./dates";

const SHANGHAI = "Asia/Shanghai";

function dayDiff(value: string, today: string): number | null {
  if (!parseDate(value) || !parseDate(today)) return null;
  const [vy, vm, vd] = value.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const valueUtc = Date.UTC(vy, vm - 1, vd);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((valueUtc - todayUtc) / 86_400_000);
}

export function relativeDay(value: string, today: string): string {
  const diff = dayDiff(value, today);
  if (diff === null) return value;
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  if (diff === -2) return "前天";
  return diff < 0 ? `${-diff} 天前` : `${diff} 天后`;
}

export function relativeDateTime(value: string, today: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return relativeDay(value, today);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${relativeDay(day, today)} ${time}`;
}
