<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import MarkdownView from "../components/MarkdownView.vue";
import { store } from "../stores/app";

const route = useRoute();
const router = useRouter();
const item = computed(() => (store.state?.behaviors ?? []).find((row) => row.id === route.params.id));
</script>

<template>
  <div v-if="item">
    <button type="button" class="back" @click="router.back()">← 返回</button>
    <h1>{{ item.title }}</h1>
    <p class="meta">
      {{ item.occurredOn }} · {{ item.dimension ?? "未分类" }} · {{ item.tone ?? "无倾向" }}
      <span v-if="item.childId === null" class="orphan">孤儿</span>
    </p>
    <MarkdownView :body="item.body || '没有正文'" />
  </div>
  <p v-else>表现不存在，或还没有加载。</p>
</template>

<style scoped>
.back { border: 0; background: transparent; padding: 8px 0; color: var(--muted); }
h1 { margin: 4px 0 8px; font-size: clamp(24px, 6vw, 36px); }
.meta { color: var(--muted); font-size: 13px; }
.meta .orphan { color: var(--warn); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
</style>
