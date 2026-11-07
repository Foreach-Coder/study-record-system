import { authenticate, requireWrite } from "../auth";
import type { Env } from "../env";
import { ApiProblem, json } from "../errors";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const CACHE = "private, max-age=31536000, immutable";

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadImage(request: Request, env: Env): Promise<Response> {
  await requireWrite(request, env);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiProblem(415, "unsupported_media_type", "Content-Type 必须是 multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiProblem(422, "validation", "缺少 file", { file: "必填" });
  if (!TYPES[file.type]) throw new ApiProblem(415, "unsupported_type", "只支持 png/jpeg/webp/gif");
  if (file.size > MAX_BYTES) throw new ApiProblem(413, "too_large", "图片不能超过 5 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `images/${await sha256Hex(bytes)}.${TYPES[file.type]}`;
  if (!(await env.MEDIA.head(key))) {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type } });
  }
  const width = Number(form.get("width") ?? 0);
  const height = Number(form.get("height") ?? 0);
  return json({ url: `/media/${key}`, width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 }, 201);
}

export async function getMedia(request: Request, env: Env): Promise<Response> {
  if (!(await authenticate(request, env))) throw new ApiProblem(401, "unauthorized", "请先登录");
  const key = new URL(request.url).pathname.replace(/^\/media\//, "");
  if (!key.startsWith("images/") || key.includes("..")) throw new ApiProblem(404, "not_found", "图片不存在");
  const object = await env.MEDIA.get(key);
  if (!object) throw new ApiProblem(404, "not_found", "图片不存在");
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": CACHE,
      etag: object.httpEtag,
    },
  });
}
