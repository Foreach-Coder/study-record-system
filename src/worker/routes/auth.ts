import {
  assertCsrf, clearSessionCookie, createSession, requireAuth, sessionCookie, sha256, toBase64Url, verifyStoredSecret,
} from "../auth";
import type { Env } from "../env";
import { ApiProblem } from "../errors";
import { clientIp, readJson } from "../http";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const encoder = new TextEncoder();

async function ipHash(request: Request, env: Env): Promise<string> {
  return toBase64Url(await sha256(encoder.encode(`${env.SESSION_SECRET}:${clientIp(request)}`)));
}
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!passcode) throw new ApiProblem(400, "validation", "口令必填", { passcode: "必填" });
  const hash = await ipHash(request, env);
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const row = await env.DB.prepare(
    "INSERT INTO auth_attempts (ip_hash, window_start, failures) VALUES (?, ?, 1) " +
    "ON CONFLICT(ip_hash, window_start) DO UPDATE SET failures = failures + 1 " +
    "RETURNING failures",
  ).bind(hash, windowStart).first<{ failures: number }>();
  if ((row?.failures ?? 0) > MAX_FAILURES) throw new ApiProblem(429, "rate_limited", "尝试过多，请稍后再试");
  await env.DB.prepare("DELETE FROM auth_attempts WHERE window_start < ?").bind(windowStart - 24 * 60 * 60 * 1000).run();
  if (!(await verifyStoredSecret(passcode, env.PASSCODE_HASH))) {
    await delay(250);
    throw new ApiProblem(401, "invalid_passcode", "口令不对");
  }
  await env.DB.prepare("DELETE FROM auth_attempts WHERE ip_hash = ?").bind(hash).run();
  const session = await createSession(env.SESSION_SECRET);
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie(request, session.token) } });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth.mode === "cookie") {
    assertCsrf(request, env);
  }
  return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie(request) } });
}

export async function session(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  return Response.json({ ok: true, mode: auth.mode });
}
