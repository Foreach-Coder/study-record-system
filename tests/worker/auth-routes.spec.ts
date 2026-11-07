import { env } from "cloudflare:workers";
import { applyD1Migrations, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256, toBase64Url } from "../../src/worker/auth";

type TestEnv = typeof env & { TEST_MIGRATIONS: { name: string; queries: string[] }[] };
const ORIGIN = "http://example.com";
const PASSCODE = "test-passcode";

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
});

async function login(passcode = PASSCODE) {
  return SELF.fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passcode }),
  });
}

describe("auth routes", () => {
  it("serves health", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, d1: true });
  });

  it("logs in with the family passcode and sets a signed cookie", async () => {
    const response = await login();
    expect(response.status).toBe(204);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-sr_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");

    const session = await SELF.fetch(`${ORIGIN}/api/auth/session`, {
      headers: { cookie: cookie.split(";")[0] },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ ok: true, mode: "cookie" });
  });

  it("rejects a wrong passcode and accepts a bearer token", async () => {
    expect((await login("wrong")).status).toBe(401);
    const bearer = await SELF.fetch(`${ORIGIN}/api/auth/session`, {
      headers: { authorization: "Bearer test-token" },
    });
    expect(bearer.status).toBe(200);
    expect(await bearer.json()).toEqual({ ok: true, mode: "bearer" });
    expect((await SELF.fetch(`${ORIGIN}/api/auth/session`, {
      headers: { authorization: "Bearer wrong" },
    })).status).toBe(401);
  });

  it("enforces CSRF on cookie-authenticated logout", async () => {
    const response = await login();
    const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
    const blocked = await SELF.fetch(`${ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: { cookie, origin: "http://evil.example" },
    });
    expect(blocked.status).toBe(403);
    const ok = await SELF.fetch(`${ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: { cookie, origin: ORIGIN },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rate-limits after 10 failures in the window", async () => {
    const ip = "203.0.113.9";
    const hash = toBase64Url(await sha256(new TextEncoder().encode(`test-session-secret:${ip}`)));
    const windowStart = Math.floor(Date.now() / 900_000) * 900_000;
    await env.DB.prepare(
      "INSERT INTO auth_attempts (ip_hash, window_start, failures) VALUES (?, ?, 10)",
    ).bind(hash, windowStart).run();
    const response = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ passcode: PASSCODE }),
    });
    expect(response.status).toBe(429);
  });
});
