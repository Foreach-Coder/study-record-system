<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import BottomTabs from "./components/BottomTabs.vue";
import EntrySheet from "./components/EntrySheet.vue";
import { refresh, store } from "./stores/app";

const route = useRoute();
const title = computed(() => route.path.startsWith("/behaviors") ? "在校表现" : route.path.startsWith("/tasks") ? "作业与待办" : "今天");
const sheet = ref<InstanceType<typeof EntrySheet> | null>(null);

watch(
  [() => store.sessionChecked, () => route.path],
  () => {
    if (!store.sessionChecked || route.path === "/login" || store.loading) return;
    refresh().catch((error) => console.error("加载状态失败", error));
  },
  { immediate: true },
);
</script>

<template>
  <RouterView v-if="route.path === '/login'" />
  <div v-else class="app-shell">
    <AppHeader :title="title" />
    <main class="app-main"><RouterView /></main>
    <button type="button" class="fab behavior" aria-label="记表现" @click="sheet?.show('behavior')">表现</button>
    <button type="button" class="fab" aria-label="新增记录" @click="sheet?.show('task')">＋</button>
    <BottomTabs />
    <EntrySheet ref="sheet" />
  </div>
</template>

<style scoped>
.app-shell { max-width: 860px; margin: 0 auto; min-height: 100dvh; padding: 0 16px; display: flex; flex-direction: column; }
.app-main { flex: 1; padding-bottom: 84px; }
.fab { position: fixed; right: 18px; bottom: 84px; z-index: 30; width: 56px; height: 56px; border: 0; border-radius: 50%; background: var(--accent); color: white; font-size: 26px; line-height: 1; box-shadow: 0 8px 20px rgb(0 0 0 / 18%); }
.fab.behavior { bottom: 150px; width: 48px; height: 48px; font-size: 12px; background: var(--surface); color: var(--text); border: 1px solid var(--line); }
</style>
