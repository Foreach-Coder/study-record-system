import { describe, expect, it } from "vitest";
import {
  createSession, hashStoredSecret, parseCookie, verifySession, verifyStoredSecret,
} from "../../src/worker/auth";

const PASSCODE = "test-passcode";
const HASH = "sha256$MDEyMzQ1Njc4OWFiY2RlZg==$hwYMTXyyT1+b8zhK1rfNJSxvSfpEgpDKovqD/LVrClk=";
const TOKEN_HASH = "sha256$ZmVkY2JhOTg3NjU0MzIxMA==$MmpkxPFBuFDsanou1SXTh7jKYMVi9vAAYRpLK4KoC1A=";

describe("auth crypto", () => {
  it("verifies the stored passcode hash and rejects a wrong one", async () => {
    expect(await verifyStoredSecret(PASSCODE, HASH)).toBe(true);
    expect(await verifyStoredSecret("wrong", HASH)).toBe(false);
    expect(await verifyStoredSecret("test-token", TOKEN_HASH)).toBe(true);
  });

  it("hashes with a supplied salt", async () => {
    const salt = Uint8Array.from([1, 2, 3, 4]);
    expect(await hashStoredSecret("x", salt)).toBe(await hashStoredSecret("x", salt));
    expect(await hashStoredSecret("x", salt)).not.toBe(await hashStoredSecret("y", salt));
  });

  it("round-trips and expires sessions", async () => {
    const { token, maxAge } = await createSession("secret", 1_700_000_000_000);
    expect(maxAge).toBe(2_592_000);
    expect(await verifySession("secret", token, 1_700_000_000_000)).toBe(true);
    expect(await verifySession("other", token, 1_700_000_000_000)).toBe(false);
    expect(await verifySession("secret", token, 1_700_000_000_000 + 2_592_000_000 + 1)).toBe(false);
  });

  it("parses cookies", () => {
    expect(parseCookie("a=1; __Host-sr_session=abc.def", "__Host-sr_session")).toBe("abc.def");
    expect(parseCookie(null, "x")).toBeNull();
  });
});
