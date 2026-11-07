import type { AppState, Behavior, Child, Task } from "../shared/schema";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } })?.error ?? {};
    throw new ApiError(response.status, error.code ?? "error", error.message ?? "请求失败", error.fields);
  }
  return data as T;
}

export interface ImageResult {
  url: string;
  width: number;
  height: number;
}

export const api = {
  session: () => request<{ ok: true; mode: string }>("/api/auth/session"),
  login: (passcode: string) => request<void>("/api/auth/login", { method: "POST", body: JSON.stringify({ passcode }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  state: () => request<AppState>("/api/state"),
  createChild: (body: Partial<Child>) => request<Child>("/api/children", { method: "POST", body: JSON.stringify(body) }),
  updateChild: (id: string, body: Partial<Child>) =>
    request<Child>(`/api/children/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteChild: (id: string) => request<void>(`/api/children/${id}`, { method: "DELETE" }),
  createTask: (body: Record<string, unknown>) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: "DELETE" }),
  createBehavior: (body: Record<string, unknown>) =>
    request<Behavior>("/api/behaviors", { method: "POST", body: JSON.stringify(body) }),
  updateBehavior: (id: string, body: Record<string, unknown>) =>
    request<Behavior>(`/api/behaviors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBehavior: (id: string) => request<void>(`/api/behaviors/${id}`, { method: "DELETE" }),
  uploadImage: (file: File, width: number, height: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("width", String(width));
    form.append("height", String(height));
    return request<ImageResult>("/api/images", { method: "POST", body: form });
  },
};
