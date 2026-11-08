<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Child, Subject, TaskImage, TaskType } from "../../shared/schema";
import { SUBJECTS } from "../../shared/schema";
import { todayInShanghai } from "../../shared/dates";
import ImagePicker from "./ImagePicker.vue";

const DRAFT_KEY = "sr.draft.task";

interface Draft {
  title: string;
  body: string;
  type: TaskType;
  subject: Subject;
  dueDate: string;
  startDate: string;
  createdBy: string;
  images: TaskImage[];
}

function blank(): Draft {
  return {
    title: "",
    body: "",
    type: "homework",
    subject: "语文",
    dueDate: todayInShanghai(),
    startDate: todayInShanghai(),
    createdBy: "爸爸",
    images: [],
  };
}

const props = defineProps<{ child: Child | null; error?: string }>();
const emit = defineEmits<{ submit: [body: Record<string, unknown>] }>();
const draft = reactive<Draft>(blank());

function load() {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if (typeof saved.title === "string") draft.title = saved.title;
    if (typeof saved.body === "string") draft.body = saved.body;
    if (saved.type === "homework" || saved.type === "todo") draft.type = saved.type;
    if (typeof saved.subject === "string" && (SUBJECTS as readonly string[]).includes(saved.subject)) {
      draft.subject = saved.subject as Subject;
    }
    if (typeof saved.dueDate === "string") draft.dueDate = saved.dueDate;
    if (typeof saved.startDate === "string") draft.startDate = saved.startDate;
    if (typeof saved.createdBy === "string") draft.createdBy = saved.createdBy;
    if (Array.isArray(saved.images)) {
      draft.images = saved.images
        .filter((item): item is TaskImage => typeof (item as TaskImage | null)?.url === "string")
        .map((item) => ({ url: item.url, title: typeof item.title === "string" ? item.title : null }));
    }
  } catch {
    /* 损坏的草稿按空表单处理 */
  }
}

load();

let silent = false;
watch(
  draft,
  () => {
    if (silent || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* 隐私模式下忽略 */
    }
  },
  { deep: true, flush: "sync" },
);

function reset() {
  silent = true;
  Object.assign(draft, blank());
  silent = false;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

defineExpose({ reset });

function submit() {
  emit("submit", { ...draft, childId: props.child?.id, images: draft.images });
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <label>标题<input v-model.trim="draft.title" required maxlength="200" /></label>
    <label>
      类型
      <select v-model="draft.type">
        <option value="homework">作业</option>
        <option value="todo">待办</option>
      </select>
    </label>
    <label v-if="draft.type === 'homework'">
      科目
      <select v-model="draft.subject">
        <option v-for="subject in SUBJECTS" :key="subject">{{ subject }}</option>
      </select>
    </label>
    <label>截止日<input v-model="draft.dueDate" type="date" required /></label>
    <label>开始日<input v-model="draft.startDate" type="date" /></label>
    <label>正文<textarea v-model="draft.body" rows="5" placeholder="支持 Markdown" /></label>
    <ImagePicker v-model="draft.images" @insert="draft.body += $event" />
    <label>谁记录的<input v-model="draft.createdBy" maxlength="50" /></label>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit">保存</button>
  </form>
</template>

<style scoped>
.form { display: grid; gap: 12px; }
label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
input, select, textarea { min-height: var(--tap); border: 1px solid var(--line); border-radius: 10px; background: var(--bg); padding: 8px 12px; color: var(--text); }
textarea { min-height: 110px; resize: vertical; }
button { min-height: var(--tap); border: 0; border-radius: 12px; background: var(--accent); color: white; font-weight: 600; }
.error { color: var(--danger); }
</style>
