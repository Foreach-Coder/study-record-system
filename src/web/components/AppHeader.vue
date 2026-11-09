<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { store } from "../stores/app";
import ChildSwitcher from "./ChildSwitcher.vue";

defineProps<{ title: string }>();
const router = useRouter();

const syncLabel = computed(() => {
  const value = store.state?.syncCutoffAt;
  if (!value) return "信息同步截至 尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "信息同步截至 尚未同步";
  const text = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `信息同步截至 ${text}`;
});

async function logout() {
  try {
    await api.logout();
  } catch {
    /* 网络失败也要清理本地会话状态并回到登录页 */
  }
  store.sessionChecked = false;
  store.state = null;
  store.error = "";
  await router.replace("/login");
}
</script>

<template>
  <header class="app-header">
    <div>
      <p class="eyebrow">学习记录</p>
      <h1>{{ title }}</h1>
      <p class="sync">{{ syncLabel }}</p>
    </div>
    <div class="actions">
      <ChildSwitcher />
      <button type="button" class="ghost" @click="logout">退出登录</button>
    </div>
  </header>
</template>

<style scoped>
.app-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 0 10px; }
.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 12px; letter-spacing: .16em; }
h1 { margin: 0; font-size: clamp(24px, 5vw, 34px); }
.sync { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.actions { display: flex; align-items: center; gap: 8px; }
.ghost { min-height: var(--tap); border: 1px solid var(--line); background: transparent; border-radius: 999px; padding: 0 12px; color: var(--muted); }
</style>
