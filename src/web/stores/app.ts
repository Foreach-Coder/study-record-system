import { reactive } from "vue";
import { api, ApiError } from "../api";
import type { AppState, Child, Task } from "../../shared/schema";
import { todayTasks } from "../../shared/grouping";
import { computeHorizon } from "../../shared/horizon";

function readSelected(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem("sr.child");
  } catch {
    return null;
  }
}

export const store = reactive({
  state: null as AppState | null,
  loading: false,
  error: "",
  sessionChecked: false,
  selectedChildId: readSelected(),
});

export function children(): Child[] {
  return store.state?.children ?? [];
}

export function selectedChild(): Child | null {
  return children().find((child) => child.id === store.selectedChildId) ?? children()[0] ?? null;
}

export function selectChild(id: string | null): void {
  store.selectedChildId = id;
  if (typeof localStorage === "undefined") return;
  try {
    if (id) localStorage.setItem("sr.child", id);
    else localStorage.removeItem("sr.child");
  } catch {
    /* 隐私模式下 localStorage 可能不可写，选中态仍在内存中生效 */
  }
}

export function visibleTasks(): Task[] {
  const child = selectedChild();
  const tasks = store.state?.tasks ?? [];
  return child ? tasks.filter((task) => task.childName === child.nickname) : tasks;
}

export function todayList(): Task[] {
  const today = store.state?.today ?? "";
  return todayTasks(visibleTasks(), today, computeHorizon(today));
}

export async function refresh(): Promise<void> {
  store.loading = true;
  store.error = "";
  try {
    store.state = await api.state();
    if (!store.selectedChildId && store.state.children[0]) selectChild(store.state.children[0].id);
  } catch (error) {
    store.error = error instanceof ApiError ? error.message : "无法加载数据";
    throw error;
  } finally {
    store.loading = false;
  }
}

export async function ensureSession(): Promise<boolean> {
  if (store.sessionChecked) return true;
  try {
    await api.session();
    store.sessionChecked = true;
    return true;
  } catch {
    store.sessionChecked = true;
    return false;
  }
}
