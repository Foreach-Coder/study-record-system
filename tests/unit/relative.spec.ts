import { describe, expect, it } from "vitest";
import { relativeDay, relativeDateTime, relativeDayWithDate, shanghaiDay } from "../../src/shared/relative";

describe("relative dates", () => {
  it("labels today, yesterday, the day before and other past days", () => {
    expect(relativeDay("2026-11-10", "2026-11-10")).toBe("今天");
    expect(relativeDay("2026-11-09", "2026-11-10")).toBe("昨天");
    expect(relativeDay("2026-11-08", "2026-11-10")).toBe("前天");
    expect(relativeDay("2026-11-07", "2026-11-10")).toBe("3 天前");
  });

  it("labels tomorrow, the day after and other future days", () => {
    expect(relativeDay("2026-11-11", "2026-11-10")).toBe("明天");
    expect(relativeDay("2026-11-12", "2026-11-10")).toBe("后天");
    expect(relativeDay("2026-11-13", "2026-11-10")).toBe("3 天后");
  });

  it("keeps invalid date strings unchanged", () => {
    expect(relativeDay("2026/11/10", "2026-11-10")).toBe("2026/11/10");
  });

  it("formats a Shanghai timestamp relative to today", () => {
    expect(relativeDateTime("2026-11-09T19:09:01+08:00", "2026-11-10")).toBe("昨天 19:09");
    expect(relativeDateTime("2026-11-10T09:05:00+08:00", "2026-11-10")).toBe("今天 09:05");
  });

  it("keeps the real date next to the relative label", () => {
    expect(relativeDayWithDate("2026-11-06", "2026-11-10")).toBe("4 天前 · 11-06");
    expect(shanghaiDay("2026-11-09T19:09:01+08:00")).toBe("2026-11-09");
  });
});
