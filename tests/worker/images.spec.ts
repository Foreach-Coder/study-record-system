import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "http://example.com";
const AUTH = { authorization: "Bearer test-token" };
const PNG = new Uint8Array(
  Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  ),
);

function form(bytes: Uint8Array<ArrayBuffer> = PNG, type = "image/png", name = "pixel.png"): FormData {
  const data = new FormData();
  data.append("file", new File([bytes], name, { type }));
  data.append("width", "1");
  data.append("height", "1");
  return data;
}

async function upload(body: FormData = form()): Promise<Response> {
  return SELF.fetch(`${BASE}/api/images`, { method: "POST", headers: { ...AUTH, origin: BASE }, body });
}

function fileForm(bytes: Uint8Array, name = "test.pdf", type = "application/pdf"): FormData {
  const data = new FormData();
  data.append("file", new File([bytes.buffer as ArrayBuffer], name, { type }));
  return data;
}

describe("files", () => {
  it("uploads a PDF and serves it as an attachment with auth", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nminimal\n%%EOF");
    const response = await SELF.fetch(`${BASE}/api/files`, { method: "POST", headers: { ...AUTH, origin: BASE }, body: fileForm(bytes) });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { name: string; url: string; size: number; type: string };
    expect(body.name).toBe("test.pdf");
    expect(body.type).toBe("application/pdf");
    expect(body.size).toBe(bytes.byteLength);
    expect(body.url).toMatch(/^\/media\/files\/[a-f0-9]{64}\.pdf$/);

    const anonymous = await SELF.fetch(`${BASE}${body.url}`);
    expect(anonymous.status).toBe(401);

    const media = await SELF.fetch(`${BASE}${body.url}`, { headers: AUTH });
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("application/pdf");
    expect(media.headers.get("content-disposition")).toContain("attachment");
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(bytes);
  });

  it("rejects unsupported file extensions", async () => {
    const response = await SELF.fetch(`${BASE}/api/files`, { method: "POST", headers: { ...AUTH, origin: BASE }, body: fileForm(new Uint8Array([1]), "bad.exe", "application/octet-stream") });
    expect(response.status).toBe(415);
  });
});

describe("images", () => {
  it("uploads, deduplicates and serves media with auth", async () => {
    const first = await upload();
    expect(first.status).toBe(201);
    const body = (await first.json()) as { url: string; width: number; height: number };
    expect(body.url).toMatch(/^\/media\/images\/[a-f0-9]{64}\.png$/);
    expect(body.width).toBe(1);
    expect(body.height).toBe(1);

    const second = await upload();
    expect(second.status).toBe(201);
    expect(((await second.json()) as { url: string }).url).toBe(body.url);

    const anonymous = await SELF.fetch(`${BASE}${body.url}`);
    expect(anonymous.status).toBe(401);
    expect(((await anonymous.json()) as { error: { code: string } }).error.code).toBe("unauthorized");

    const media = await SELF.fetch(`${BASE}${body.url}`, { headers: AUTH });
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/png");
    expect(media.headers.get("cache-control")).toContain("private");
    expect(media.headers.get("cache-control")).toContain("immutable");
    expect(media.headers.get("etag")).toBeTruthy();
    expect(media.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(PNG);
  });

  it("rejects unsupported types and missing files", async () => {
    expect((await upload(form(new Uint8Array([1, 2, 3]), "text/plain", "x.txt"))).status).toBe(415);
    expect((await upload(new FormData())).status).toBe(422);
  });

  it("rejects non-image keys and missing objects with 404", async () => {
    const notImage = await SELF.fetch(`${BASE}/media/other/x.png`, { headers: AUTH });
    expect(notImage.status).toBe(404);
    const missing = await SELF.fetch(`${BASE}/media/images/${"0".repeat(64)}.png`, { headers: AUTH });
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });

  it("rejects images over the 5 MiB limit", async () => {
    const tooLarge = new Uint8Array(5 * 1024 * 1024 + 1);
    const response = await upload(form(tooLarge, "image/png", "big.png"));
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("too_large");
  });
});
