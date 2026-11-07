import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import staticHeaders from "../../public/_headers?raw";

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

describe("security headers", () => {
  it("sets CSP and hardening headers on API responses", async () => {
    const response = await SELF.fetch("http://example.com/api/health");
    expect(response.headers.get("content-security-policy")).toBe(CSP);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("returns JSON for unknown API and 405 for wrong method", async () => {
    const notFound = await SELF.fetch("http://example.com/api/nope");
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get("content-type")).toContain("application/json");
    expect(notFound.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await notFound.json()).toMatchObject({ error: { code: "not_found" } });

    const wrong = await SELF.fetch("http://example.com/api/auth/login");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("POST");
    expect(await wrong.json()).toMatchObject({ error: { code: "method_not_allowed" } });
  });

  it("ships the planned static header block for Vite to copy", () => {
    expect(staticHeaders).toContain("/*");
    expect(staticHeaders).toContain(`Content-Security-Policy: ${CSP}`);
    expect(staticHeaders).toContain("X-Content-Type-Options: nosniff");
    expect(staticHeaders).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(staticHeaders).toContain("Permissions-Policy: camera=(), microphone=(), geolocation=()");
    expect(staticHeaders).toContain("X-Frame-Options: DENY");
  });
});
