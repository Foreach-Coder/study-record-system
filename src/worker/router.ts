import type { Env } from "./env";
import { ApiProblem, errorResponse, json } from "./errors";
import { withSecurity } from "./http";
import { login, logout, session } from "./routes/auth";
import { createBehavior, deleteBehavior, updateBehavior } from "./routes/behaviors";
import { createChild, deleteChild, updateChild } from "./routes/children";
import { createTask, deleteTask, updateTask } from "./routes/tasks";

export type Handler = (request: Request, env: Env, ctx: ExecutionContext, params: Record<string, string>) => Promise<Response>;
interface Route { method: string; regex: RegExp; keys: string[]; handler: Handler; }
const routes: Route[] = [];
export function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = [];
  const regex = new RegExp(`^${path.replace(/:([A-Za-z]+)/g, (_, key: string) => { keys.push(key); return "([^/]+)"; })}$`);
  routes.push({ method, regex, keys, handler });
}
route("GET", "/api/health", async (_request, env) => {
  try {
    const row = await env.DB.prepare("SELECT version FROM schema_meta WHERE id = 1").first<{ version: number }>();
    return json({ ok: true, d1: true, schemaVersion: row?.version ?? 0, now: new Date().toISOString() });
  } catch {
    return json({ ok: false, d1: false }, 503);
  }
});
route("POST", "/api/auth/login", login);
route("POST", "/api/auth/logout", logout);
route("GET", "/api/auth/session", session);
route("POST", "/api/children", createChild);
route("PATCH", "/api/children/:id", updateChild);
route("DELETE", "/api/children/:id", deleteChild);
route("POST", "/api/behaviors", createBehavior);
route("PATCH", "/api/behaviors/:id", updateBehavior);
route("DELETE", "/api/behaviors/:id", deleteBehavior);
route("POST", "/api/tasks", createTask);
route("PATCH", "/api/tasks/:id", updateTask);
route("DELETE", "/api/tasks/:id", deleteTask);

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (!(url.pathname === "/api" || url.pathname.startsWith("/api/"))) return new Response("Not found", { status: 404 });
  const matches = routes.filter((candidate) => candidate.regex.test(url.pathname));
  if (matches.length === 0) return withSecurity(json({ error: { code: "not_found", message: "接口不存在" } }, 404));
  const match = matches.find((candidate) => candidate.method === request.method);
  if (!match) {
    const allow = [...new Set(matches.map((candidate) => candidate.method))].join(", ");
    return withSecurity(json({ error: { code: "method_not_allowed", message: "方法不允许" } }, 405, { allow }));
  }
  try {
    const values = match.regex.exec(url.pathname) ?? [];
    let params: Record<string, string>;
    try {
      params = Object.fromEntries(match.keys.map((key, index) => [key, decodeURIComponent(values[index + 1] ?? "")]));
    } catch {
      throw new ApiProblem(400, "bad_request", "路径参数编码不合法");
    }
    return withSecurity(await match.handler(request, env, ctx, params));
  } catch (error) {
    return withSecurity(errorResponse(error));
  }
}
