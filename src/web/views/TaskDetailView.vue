<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { todayInShanghai } from "../../shared/dates";
import { relativeDay } from "../../shared/relative";
import { api, ApiError } from "../api";
import MarkdownView from "../components/MarkdownView.vue";
import EntrySheet from "../components/EntrySheet.vue";
import { refresh, store } from "../stores/app";

const route = useRoute();
const router = useRouter();
const task = computed(() => (store.state?.tasks ?? []).find((item) => item.id === route.params.id));
const pending = ref(false);
const error = ref("");
const confirming = ref(false);
const entry = ref<InstanceType<typeof EntrySheet> | null>(null);
const today = computed(() => store.state?.today ?? todayInShanghai());
const canDelay = computed(() => !!task.value && !task.value.completed && task.value.dueDate < today.value);

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function fail(reason: unknown) {
  error.value = reason instanceof ApiError ? reason.message : "操作失败，请重试";
}

async function update(patch: Record<string, unknown>) {
  if (!task.value || pending.value) return;
  pending.value = true;
  error.value = "";
  try {
    await api.updateTask(task.value.id, patch);
    await refresh();
  } catch (reason) {
    fail(reason);
  } finally {
    pending.value = false;
  }
}

async function delayToToday() {
  await update({ dueDate: today.value, startDate: today.value });
}

async function removeConfirmed() {
  if (!task.value || pending.value) return;
  pending.value = true;
  error.value = "";
  try {
    await api.deleteTask(task.value.id);
    await refresh();
    await router.replace("/tasks");
  } catch (reason) {
    fail(reason);
    pending.value = false;
  }
}
</script>

<template>
  <div v-if="task" class="detail">
    <div class="topbar">
      <button type="button" class="icon-btn" aria-label="返回" @click="router.back()">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <span class="topbar-gap" />
      <button
        type="button"
        class="status-btn"
        :class="{ done: task.completed }"
        :disabled="pending"
        @click="update({ completed: !task.completed })"
      >
        {{ task.completed ? "已完成" : "未完成" }}
      </button>
      <button
        type="button"
        class="round-btn"
        :class="{ active: task.checked }"
        :aria-label="task.checked ? '取消检查' : '标为已检查'"
        :aria-pressed="task.checked"
        :disabled="pending"
        @click="update({ checked: !task.checked })"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="m5 12 4.2 4.2L19 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <details class="menu">
        <summary class="icon-btn" aria-label="更多操作">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
            <circle cx="5" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="19" cy="12" r="1.6" fill="currentColor" />
          </svg>
        </summary>
        <div class="menu-panel">
          <button type="button" @click="entry?.editTask(task)">编辑</button>
          <button v-if="canDelay" type="button" @click="delayToToday">顺延到今天</button>
          <button type="button" class="danger" @click="confirming = true">删除</button>
        </div>
      </details>
    </div>

    <section class="hero">
      <div class="chips">
        <span class="chip primary">{{ task.type === "homework" ? "作业" : "待办" }}</span>
        <span v-if="task.subject" class="chip">{{ task.subject }}</span>
        <span class="chip">{{ task.childName }}</span>
        <span v-if="task.childId === null" class="chip danger">孤儿</span>
      </div>
      <h1>{{ task.title }}</h1>
      <p class="dates">
        <span v-if="task.startDate">{{ relativeDay(task.startDate, today) }}开始</span>
        <span>{{ relativeDay(task.dueDate, today) }}截止</span>
        <span v-if="task.checked" class="ok">已检查</span>
      </p>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
    <MarkdownView :body="task.body || '没有正文'" />

    <section v-if="task.attachments.length" class="attachments">
      <h2>附件</h2>
      <a
        v-for="attachment in task.attachments"
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

    <Teleport to="body">
      <div v-if="confirming" class="dialog-mask" @click.self="confirming = false">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="确认删除">
          <h2>删除这条记录？</h2>
          <p>删除后无法恢复。</p>
          <div class="dialog-actions">
            <button type="button" :disabled="pending" @click="confirming = false">取消</button>
            <button type="button" class="danger" :disabled="pending" @click="removeConfirmed">删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
  <p v-else class="missing">任务不存在，或还没有加载。</p>
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

.status-btn {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
}

.status-btn.done {
  border-color: color-mix(in srgb, var(--success) 30%, var(--line));
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
  color: var(--success);
}

.round-btn {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
}

.round-btn.active {
  border-color: color-mix(in srgb, var(--primary) 35%, var(--line));
  background: var(--primary-soft);
  color: var(--primary);
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
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 148px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-3);
}

.menu-panel button {
  width: 100%;
  min-height: 40px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  padding: 0 var(--space-3);
  text-align: left;
  font-size: var(--text-sm);
}

.menu-panel button:hover {
  background: var(--surface-2);
}

.menu-panel .danger {
  color: var(--danger);
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

.chip.primary {
  background: var(--primary-soft);
  color: var(--primary);
}

.chip.danger {
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  color: var(--danger);
}

h1 {
  margin: var(--space-3) 0 var(--space-2);
  font-size: clamp(26px, 6vw, 38px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.dates {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.dates .ok {
  color: var(--success);
}

.error {
  color: var(--danger);
  font-size: var(--text-sm);
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

.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: var(--scrim);
}

.dialog {
  width: min(100%, 360px);
  padding: var(--space-5);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-3);
}

.dialog h2 {
  margin: 0;
  font-size: var(--text-lg);
}

.dialog p {
  margin: var(--space-2) 0 var(--space-5);
  color: var(--muted);
  font-size: var(--text-sm);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.dialog-actions button {
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
}

.dialog-actions .danger {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
}

.missing {
  padding: var(--space-8) 0;
  color: var(--muted);
  text-align: center;
}
</style>
