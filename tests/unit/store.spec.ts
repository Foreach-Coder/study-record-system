import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/web/api";
import { ensureSession, store, todayList } from "../../src/web/stores/app";
import type { AppState } from "../../src/shared/schema";

function state(overrides: Partial<AppState> = {}): AppState {
  return { schemaVersion: 1, today: "", serverTime: "", syncCutoffAt: null, children: [], tasks: [], behaviors: [], ...overrides };
}

describe("store bootstrap", () => {
  beforeEach(() => {
    store.state = null;
    store.sessionChecked = false;
    vi.restoreAllMocks();
  });

  it("returns no today list before state or without a today date", () => {
    expect(todayList()).toEqual([]);

    store.state = state({ today: "" });
    expect(todayList()).toEqual([]);
  });

  it("keeps session unchecked on failure and caches success", async () => {
    const session = vi.spyOn(api, "session").mockRejectedValueOnce(new Error("unauthorized"));

    expect(await ensureSession()).toBe(false);
    expect(store.sessionChecked).toBe(false);

    session.mockResolvedValueOnce({ ok: true, mode: "cookie" });
    expect(await ensureSession()).toBe(true);
    expect(store.sessionChecked).toBe(true);

    expect(await ensureSession()).toBe(true);
    expect(session).toHaveBeenCalledTimes(2);
  });
});
