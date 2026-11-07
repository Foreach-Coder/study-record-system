export class ApiProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof ApiProblem) {
    return json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}), ...error.extra } }, error.status);
  }
  if (error instanceof Error && error.message === "unauthorized") {
    return json({ error: { code: "unauthorized", message: "请先登录" } }, 401);
  }
  if (error instanceof Error && error.message === "csrf") {
    return json({ error: { code: "csrf", message: "请求来源不合法" } }, 403);
  }
  console.error(error);
  return json({ error: { code: "internal", message: "服务内部错误" } }, 500);
}
