<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import MarkdownView from "../components/MarkdownView.vue";
import EntrySheet from "../components/EntrySheet.vue";
import { store } from "../stores/app";

const route = useRoute();
const router = useRouter();
const item = computed(() => (store.state?.behaviors ?? []).find((row) => row.id === route.params.id));
const entry = ref<InstanceType<typeof EntrySheet> | null>(null);

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <div v-if="item">
    <button type="button" class="back" @click="router.back()">← 返回</button>
    <h1>{{ item.title }}</h1>
    <p class="meta">
      {{ item.occurredOn }} · {{ item.dimension ?? "未分类" }} · {{ item.tone ?? "无倾向" }}
      <span v-if="item.childId === null" class="orphan">孤儿</span>
    </p>
    <div class="actions">
      <button type="button" @click="entry?.editBehavior(item)">编辑</button>
    </div>
    <MarkdownView :body="item.body || '没有正文'" />
    <div v-if="item.attachments.length" class="attachments">
      <h2>附件</h2>
      <ul>
        <li v-for="attachment in item.attachments" :key="attachment.url">
          <a :href="attachment.url" :download="attachment.name">
            {{ attachment.name }}<span>{{ formatBytes(attachment.size) }}</span>
          </a>
        </li>
      </ul>
    </div>
    <EntrySheet ref="entry" />
  </div>
  <p v-else>表现不存在，或还没有加载。</p>
</template>

<style scoped>
.back { border: 0; background: transparent; padding: 8px 0; color: var(--muted); }
h1 { margin: 4px 0 8px; font-size: clamp(24px, 6vw, 36px); }
.meta { color: var(--muted); font-size: 13px; }
.meta .orphan { color: var(--warn); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
.actions { margin: 12px 0; }
.actions button { min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text); }
.attachments { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); }
.attachments h2 { font-size: 16px; margin: 0 0 10px; }
.attachments ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.attachments a { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text); text-decoration: none; }
.attachments a span { color: var(--muted); font-size: 12px; white-space: nowrap; }
</style>
