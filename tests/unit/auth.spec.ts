import { describe, expect, it } from "vitest";
import {
  assertCsrf, authenticate, createSession, hashStoredSecret, parseCookie, verifySession, verifyStoredSecret,
} from "../../src/worker/auth";
import type { Env } from "../../src/worker/env";

const PASSCODE = "test-passcode";
const HASH = "sha256$MDEyMzQ1Njc4OWFiY2RlZg==$hwYMTXyyT1+b8zhK1rfNJSxvSfpEgpDKovqD/LVrClk=";
const TOKEN_HASH = "sha256$ZmVkY2JhOTg3NjU0MzIxMA==$MmpkxPFBuFDsanou1SXTh7jKYMVi9vAAYRpLK4KoC1A=";

const CSRF_ENV = { PUBLIC_ORIGIN: "https://study-record.foreach.me" } as Env;

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

  it("allows same-origin CSRF requests without an Origin header", () => {
    const request = new Request("https://study-record.foreach.me/api/auth/logout", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(() => assertCsrf(request, CSRF_ENV)).not.toThrow();
  });

  it("rejects CSRF requests with neither Origin nor Sec-Fetch-Site", () => {
    const request = new Request("https://study-record.foreach.me/api/auth/logout", { method: "POST" });
    expect(() => assertCsrf(request, CSRF_ENV)).toThrow("csrf");
  });

  it("returns false for tampered session signatures instead of throwing", async () => {
    expect(await verifySession("secret", "v1.4102444800.bad!", 1_700_000_000_000)).toBe(false);
    expect(await verifySession("secret", "v1.4102444800.abc.def", 1_700_000_000_000)).toBe(false);
  });

  it("rejects malformed stored secrets", async () => {
    expect(await verifyStoredSecret("x", "sha256$bad$bad")).toBe(false);
  });

  it("keeps cookie values containing equals signs intact", () => {
    expect(parseCookie("a=b=c; __Host-sr_session=x", "__Host-sr_session")).toBe("x");
    expect(parseCookie("__Host-sr_session=abc=def", "__Host-sr_session")).toBe("abc=def");
  });

  it("returns null from authenticate for a tampered session cookie", async () => {
    const env = { SESSION_SECRET: "secret", API_TOKEN_HASH: TOKEN_HASH, PUBLIC_ORIGIN: CSRF_ENV.PUBLIC_ORIGIN } as Env;
    const request = new Request("https://study-record.foreach.me/api/state", {
      headers: { cookie: "__Host-sr_session=v1.4102444800.bad!" },
    });
    expect(await authenticate(request, env)).toBeNull();
  });
});
