import type { Env } from "./env";

const encoder = new TextEncoder();
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function sha256(data: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}
export function parseStoredSecret(value: string): { salt: Uint8Array; digest: Uint8Array } | null {
  const [scheme, salt, digest] = value.split("$");
  if (scheme !== "sha256" || !salt || !digest) return null;
  return { salt: fromBase64(salt), digest: fromBase64(digest) };
}
export async function hashStoredSecret(secret: string, salt: Uint8Array): Promise<string> {
  const secretBytes = encoder.encode(secret);
  const input = new Uint8Array(salt.length + secretBytes.length);
  input.set(salt);
  input.set(secretBytes, salt.length);
  return `sha256$${toBase64(salt)}$${toBase64(await sha256(input))}`;
}
export async function verifyStoredSecret(secret: string, stored: string): Promise<boolean> {
  const parsed = parseStoredSecret(stored);
  if (!parsed) return false;
  const actual = new Uint8Array(await sha256(
    (() => {
      const bytes = encoder.encode(secret);
      const input = new Uint8Array(parsed.salt.length + bytes.length);
      input.set(parsed.salt);
      input.set(bytes, parsed.salt.length);
      return input;
    })(),
  ));
  return constantTimeEqual(actual, parsed.digest);
}
export async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))));
}
export async function createSession(secret: string, now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  return { token: `${payload}.${await hmacSha256(secret, payload)}`, maxAge: SESSION_TTL_SECONDS };
}
export async function verifySession(secret: string, token: string, now = Date.now()): Promise<boolean> {
  const [version, exp, signature] = token.split(".");
  if (version !== "v1" || !exp || !signature) return false;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const expected = await hmacSha256(secret, `${version}.${exp}`);
  return constantTimeEqual(fromBase64Url(signature), fromBase64Url(expected));
}
export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
export function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}
export function sessionCookieName(request: Request): string {
  return isLocalRequest(request) ? "sr_session" : "__Host-sr_session";
}
export function sessionCookie(request: Request, token: string): string {
  const local = isLocalRequest(request);
  return `${sessionCookieName(request)}=${token}; HttpOnly; ${local ? "" : "Secure; "}SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}
export function clearSessionCookie(request: Request): string {
  return `${sessionCookieName(request)}=; HttpOnly; ${isLocalRequest(request) ? "" : "Secure; "}SameSite=Lax; Path=/; Max-Age=0`;
}
export function assertCsrf(request: Request, env: Env): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) throw new Error("csrf");
  const allowed = new Set([env.PUBLIC_ORIGIN]);
  if (isLocalRequest(request)) {
    allowed.add("http://localhost:5173");
    allowed.add("http://127.0.0.1:5173");
  }
  if (!allowed.has(origin)) throw new Error("csrf");
}
export async function authenticate(request: Request, env: Env): Promise<{ mode: "cookie" | "bearer" } | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return (await verifyStoredSecret(authorization.slice(7), env.API_TOKEN_HASH)) ? { mode: "bearer" } : null;
  }
  const token = parseCookie(request.headers.get("cookie"), sessionCookieName(request));
  if (token && await verifySession(env.SESSION_SECRET, token)) return { mode: "cookie" };
  return null;
}
export async function requireAuth(request: Request, env: Env): Promise<{ mode: "cookie" | "bearer" }> {
  const auth = await authenticate(request, env);
  if (!auth) throw new Error("unauthorized");
  return auth;
}
