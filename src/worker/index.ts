import type { Env } from "./env";
import { handle } from "./router";

export default { fetch: (request: Request, env: Env, ctx: ExecutionContext) => handle(request, env, ctx) };
