<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import BottomTabs from "./components/BottomTabs.vue";
import { refresh, store } from "./stores/app";

const route = useRoute();
const title = computed(() => route.path.startsWith("/behaviors") ? "在校表现" : route.path.startsWith("/tasks") ? "作业与待办" : "今天");

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
    <BottomTabs />
  </div>
</template>

<style scoped>
.app-shell { max-width: 860px; margin: 0 auto; min-height: 100dvh; padding: 0 16px; display: flex; flex-direction: column; }
.app-main { flex: 1; padding-bottom: 84px; }
</style>
