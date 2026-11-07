import { describe, expect, it } from "vitest";
import { addDays, todayInShanghai } from "../../src/shared/dates";
import { computeHorizon } from "../../src/shared/horizon";

describe("dates", () => {
  it("uses Asia/Shanghai for today", () => {
    expect(todayInShanghai(new Date("2026-11-06T16:30:00Z"))).toBe("2026-11-07");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-11-07", 3)).toBe("2026-11-10");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("horizon", () => {
  it("extends Friday to Monday", () => {
    expect(computeHorizon("2026-11-06")).toBe("2026-11-09");
  });

  it("extends Saturday and Sunday to Monday", () => {
    expect(computeHorizon("2026-11-07")).toBe("2026-11-09");
    expect(computeHorizon("2026-11-08")).toBe("2026-11-09");
  });

  it("keeps weekdays at today", () => {
    expect(computeHorizon("2026-11-09")).toBe("2026-11-09");
  });

  it("extends holiday eve and holiday days to the last holiday day", () => {
    expect(computeHorizon("2026-12-31")).toBe("2027-01-03");
    expect(computeHorizon("2027-01-01")).toBe("2027-01-03");
    expect(computeHorizon("2027-01-03")).toBe("2027-01-03");
    expect(computeHorizon("2027-02-04")).toBe("2027-02-13");
  });
});
