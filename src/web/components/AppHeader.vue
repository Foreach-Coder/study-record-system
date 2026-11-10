<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { todayInShanghai } from "../../shared/dates";
import { relativeDateTime, shanghaiDay } from "../../shared/relative";
import { api } from "../api";
import { refresh, store } from "../stores/app";
import ChildSwitcher from "./ChildSwitcher.vue";

defineProps<{ title: string }>();
const router = useRouter();

const syncLabel = computed(() => {
  const value = store.state?.syncCutoffAt;
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return `${relativeDateTime(value, store.state?.today ?? todayInShanghai())} · ${shanghaiDay(value).slice(5)}`;
});

async function reload() {
  try {
    await refresh();
  } catch {
    /* refresh 已把错误写入 store.error，由 App 的错误横幅展示 */
  }
}

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
    <div class="heading">
      <h1>{{ title }}</h1>
      <p class="sync" :class="{ 'sync--empty': syncLabel === '尚未同步' }">
        <span class="sync-dot" aria-hidden="true" />
        信息同步 {{ syncLabel }}
      </p>
    </div>
    <div class="actions">
      <ChildSwitcher />
      <button
        type="button"
        class="icon-btn refresh"
        aria-label="刷新"
        title="刷新"
        :disabled="store.loading"
        @click="reload"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="21"
          height="21"
          :class="{ spinning: store.loading }"
        >
          <path
            d="M20 11a8 8 0 1 0-2.34 5.66"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.8"
          />
          <path
            d="M20 5v6h-6"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </button>
      <details class="menu">
        <summary class="icon-btn" aria-label="更多">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
            <circle cx="5" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="19" cy="12" r="1.6" fill="currentColor" />
          </svg>
        </summary>
        <div class="menu-panel">
          <button type="button" @click="logout">退出登录</button>
        </div>
      </details>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--header-height);
  padding: var(--space-4) 0 var(--space-3);
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(18px);
}

.heading {
  min-width: 0;
}

h1 {
  margin: 0;
  overflow: hidden;
  font-size: clamp(26px, 6vw, 34px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: var(--space-1) 0 0;
  color: var(--muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.sync-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.sync--empty .sync-dot {
  background: var(--muted);
}

.actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
}

.refresh:disabled {
  opacity: 0.55;
  cursor: default;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation-duration: 2s;
  }
}

.menu {
  position: relative;
}

.menu summary {
  list-style: none;
}

.menu summary::-webkit-details-marker {
  display: none;
}

.menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 148px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-3);
}

.menu-panel button {
  width: 100%;
  min-height: 42px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  text-align: left;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}

.menu-panel button:hover {
  background: var(--surface-2);
}

@media (max-width: 560px) {
  .app-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .actions {
    width: 100%;
    justify-content: flex-start;
  }

  .menu {
    margin-left: auto;
  }
}
</style>
