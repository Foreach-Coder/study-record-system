<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { todayInShanghai } from "../../shared/dates";
import { relativeDay } from "../../shared/relative";
import MarkdownView from "../components/MarkdownView.vue";
import EntrySheet from "../components/EntrySheet.vue";
import { store } from "../stores/app";

const route = useRoute();
const router = useRouter();
const item = computed(() => (store.state?.behaviors ?? []).find((row) => row.id === route.params.id));
const today = computed(() => store.state?.today ?? todayInShanghai());
const entry = ref<InstanceType<typeof EntrySheet> | null>(null);

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function toneClass(tone: string | null): string {
  if (tone === "需关注") return "danger";
  if (tone === "正向") return "success";
  return "";
}
</script>

<template>
  <div v-if="item" class="detail">
    <div class="topbar">
      <button type="button" class="icon-btn" aria-label="返回" @click="router.back()">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <span class="topbar-gap" />
      <button type="button" class="edit-btn" @click="entry?.editBehavior(item)">编辑</button>
    </div>

    <section class="hero">
      <div class="chips">
        <span class="chip">{{ relativeDay(item.occurredOn, today) }} · {{ item.occurredOn.slice(5) }}</span>
        <span v-if="item.dimension" class="chip">{{ item.dimension }}</span>
        <span v-if="item.tone" class="chip" :class="toneClass(item.tone)">{{ item.tone }}</span>
        <span v-if="item.childId === null" class="chip danger">孤儿</span>
      </div>
      <h1>{{ item.title }}</h1>
      <p class="byline">{{ item.childName }}<span v-if="item.source"> · {{ item.source }}</span></p>
    </section>

    <MarkdownView :body="item.body || '没有正文'" />

    <section v-if="item.attachments.length" class="attachments">
      <h2>附件</h2>
      <a
        v-for="attachment in item.attachments"
        :key="attachment.url"
        class="file"
        :href="attachment.url"
        :download="attachment.name"
      >
        <span class="file-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
            <path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="file-name">{{ attachment.name }}</span>
        <span class="file-size">{{ formatBytes(attachment.size) }}</span>
      </a>
    </section>

    <EntrySheet ref="entry" />
  </div>
  <p v-else class="missing">表现不存在，或还没有加载。</p>
</template>

<style scoped>
.detail {
  padding-top: var(--space-2);
}

.topbar {
  position: sticky;
  top: calc(var(--header-height) - 8px);
  z-index: 12;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) 0 var(--space-2);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(14px);
}

.topbar-gap {
  flex: 1;
}

.edit-btn {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 500;
}

.hero {
  margin: var(--space-3) 0 var(--space-5);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: 11px;
}

.chip.success {
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
  color: var(--success);
}

.chip.danger {
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  color: var(--danger);
}

h1 {
  margin: var(--space-3) 0 var(--space-1);
  font-size: clamp(26px, 6vw, 38px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.byline {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
}

.attachments {
  margin-top: var(--space-6);
}

.attachments h2 {
  margin: 0 0 var(--space-2);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 56px;
  margin-bottom: var(--space-2);
  padding: 8px var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
}

.file-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary);
}

.file-name {
  flex: 1;
  overflow: hidden;
  font-size: var(--text-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  flex: none;
  color: var(--muted);
  font-size: 11px;
}

.missing {
  padding: var(--space-8) 0;
  color: var(--muted);
  text-align: center;
}
</style>
