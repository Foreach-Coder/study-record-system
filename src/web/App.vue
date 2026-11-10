<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import BottomTabs from "./components/BottomTabs.vue";
import EntrySheet from "./components/EntrySheet.vue";
import ErrorState from "./components/ErrorState.vue";
import NetworkIndicator from "./components/NetworkIndicator.vue";
import { refresh, store } from "./stores/app";

const route = useRoute();
const title = computed(() =>
  route.path.startsWith("/behaviors") ? "在校表现" : route.path.startsWith("/tasks") ? "作业与待办" : "今天",
);
const sheet = ref<InstanceType<typeof EntrySheet> | null>(null);

watch(
  [() => store.sessionChecked, () => route.path],
  () => {
    if (!store.sessionChecked || route.path === "/login" || store.loading) return;
    refresh().catch((error) => console.error("加载状态失败", error));
  },
  { immediate: true },
);

function retry() {
  refresh().catch(() => {
    /* 错误已写入 store，由 ErrorState 展示 */
  });
}
</script>

<template>
  <NetworkIndicator />
  <RouterView v-if="route.path === '/login'" />
  <div v-else class="app-shell">
    <BottomTabs />
    <div class="app-surface">
      <AppHeader :title="title" />
      <main class="app-main">
        <div v-if="store.loading && !store.state" class="skeleton-stack" role="status" aria-label="加载中">
          <div class="skeleton skeleton--hero" />
          <div class="skeleton skeleton--row" />
          <div class="skeleton skeleton--row" />
          <div class="skeleton skeleton--row" />
        </div>
        <ErrorState
          v-else-if="store.error && !store.state"
          :message="store.error"
          @retry="retry"
        />
        <template v-else>
          <p v-if="store.error" class="error-banner" role="status">
            <span>{{ store.error }}</span>
            <button type="button" class="btn btn--secondary banner-retry" @click="retry">重试</button>
          </p>
          <RouterView />
        </template>
      </main>
    </div>
    <button type="button" class="fab" aria-label="记录" @click="sheet?.show('task')">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
        <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <span>记录</span>
    </button>
    <EntrySheet ref="sheet" />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100dvh;
  background: var(--bg);
}

.app-surface {
  min-height: 100dvh;
  max-width: calc(var(--page-max) + var(--space-8));
  margin: 0 auto;
  padding: 0 var(--space-4);
}

.app-main {
  padding-bottom: calc(var(--tab-height) + var(--space-8));
}

.skeleton-stack {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-4);
}

.skeleton {
  border-radius: var(--radius-lg);
  background: linear-gradient(100deg, var(--surface-2) 20%, var(--surface-3) 40%, var(--surface-2) 60%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}

.skeleton--hero {
  height: 132px;
}

.skeleton--row {
  height: 72px;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: var(--space-4) 0 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--danger) 28%, var(--line));
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.banner-retry {
  min-height: 36px;
  padding: 0 var(--space-3);
  font-size: var(--text-xs);
}

.fab {
  position: fixed;
  right: var(--space-4);
  bottom: calc(var(--tab-height) + var(--space-4) + env(safe-area-inset-bottom));
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--primary) 36%, transparent);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast);
}

.fab span {
  display: none;
}

.fab:active {
  transform: scale(0.94);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent);
}

@media (min-width: 600px) {
  .app-shell {
    padding-left: var(--rail-width);
  }

  .app-surface {
    padding: 0 var(--space-6);
  }

  .app-main {
    padding-bottom: var(--space-8);
  }

  .fab {
    right: var(--space-6);
    bottom: var(--space-6);
    width: auto;
    height: 56px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-pill);
  }

  .fab span {
    display: inline;
  }
}

@media (max-width: 360px) {
  .app-surface {
    padding: 0 var(--space-3);
  }
}
</style>
