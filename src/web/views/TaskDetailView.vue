<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { store } from "../stores/app";

const route = useRoute();
const router = useRouter();
const task = computed(() => (store.state?.tasks ?? []).find((item) => item.id === route.params.id));
</script>

<template>
  <div v-if="task">
    <button type="button" class="back" @click="router.back()">← 返回</button>
    <h1>{{ task.title }}</h1>
    <p class="meta">
      <span>{{ task.childName }}</span>
      <span v-if="task.subject">{{ task.subject }}</span>
      <span>{{ task.dueDate }} 截止</span>
      <span v-if="task.completed">已完成</span>
    </p>
    <pre class="body">{{ task.body || "没有正文" }}</pre>
  </div>
  <p v-else>任务不存在，或还没有加载。</p>
</template>

<style scoped>
.back { border: 0; background: transparent; padding: 8px 0; color: var(--muted); }
h1 { margin: 4px 0 8px; font-size: clamp(24px, 6vw, 36px); }
.meta { display: flex; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 13px; }
.body { white-space: pre-wrap; font: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; margin-top: 18px; }
</style>
