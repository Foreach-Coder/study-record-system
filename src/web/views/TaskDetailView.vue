<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { todayInShanghai } from "../../shared/dates";
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
const today = todayInShanghai();
const canDelay = computed(() => !!task.value && !task.value.completed && task.value.dueDate < today);

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
  await update({ dueDate: today, startDate: today });
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
  <div v-if="task">
    <button type="button" class="back" @click="router.back()">← 返回</button>
    <h1>{{ task.title }}</h1>
    <p class="meta">
      <span>{{ task.childName }}</span>
      <span v-if="task.subject">{{ task.subject }}</span>
      <span v-if="task.startDate">{{ task.startDate }} 开始</span>
      <span>{{ task.dueDate }} 截止</span>
      <span v-if="task.completed" class="done">已完成</span>
      <span v-if="task.checked">已检查</span>
      <span v-if="task.childId === null" class="orphan">孤儿</span>
    </p>
    <div class="actions">
      <button type="button" :disabled="pending" @click="update({ completed: !task.completed })">
        {{ task.completed ? "取消完成" : "完成" }}
      </button>
      <button type="button" :disabled="pending" @click="update({ checked: !task.checked })">
        {{ task.checked ? "取消检查" : "检查" }}
      </button>
      <button v-if="canDelay" type="button" :disabled="pending" @click="delayToToday">
        顺延到今天
      </button>
      <button type="button" :disabled="pending" @click="entry?.editTask(task)">编辑</button>
      <button type="button" class="danger" :disabled="pending" @click="confirming = true">删除</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <MarkdownView :body="task.body || '没有正文'" />
    <div v-if="task.attachments.length" class="attachments">
      <h2>附件</h2>
      <ul>
        <li v-for="attachment in task.attachments" :key="attachment.url">
          <a :href="attachment.url" :download="attachment.name">
            {{ attachment.name }}<span>{{ formatBytes(attachment.size) }}</span>
          </a>
        </li>
      </ul>
    </div>
    <EntrySheet ref="entry" />
    <div v-if="confirming" class="dialog" role="dialog" aria-label="确认删除">
      <p>删除后无法恢复，确定要删除「{{ task.title }}」吗？</p>
      <button type="button" class="danger" :disabled="pending" @click="removeConfirmed">确认删除</button>
      <button type="button" :disabled="pending" @click="confirming = false">取消</button>
    </div>
  </div>
  <p v-else>任务不存在，或还没有加载。</p>
</template>

<style scoped>
.back { border: 0; background: transparent; padding: 8px 0; color: var(--muted); }
h1 { margin: 4px 0 8px; font-size: clamp(24px, 6vw, 36px); }
.meta { display: flex; gap: 10px; flex-wrap: wrap; color: var(--muted); font-size: 13px; }
.meta .done { color: var(--ok); font-weight: 600; }
.meta .orphan { color: var(--warn); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.actions button { min-height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text); }
.actions button:disabled { opacity: .5; }
.actions .danger { background: var(--danger); border-color: var(--danger); color: white; }
.error { color: var(--danger); }
.attachments { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); }
.attachments h2 { font-size: 16px; margin: 0 0 10px; }
.attachments ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.attachments a { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text); text-decoration: none; }
.attachments a span { color: var(--muted); font-size: 12px; white-space: nowrap; }
.dialog { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); display: grid; gap: 10px; }
.dialog button { min-height: 40px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--text); }
.dialog .danger { background: var(--danger); border-color: var(--danger); color: white; }
.dialog button:disabled { opacity: .5; }
</style>
