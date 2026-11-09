<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Child, Subject, Task, TaskImage, TaskType } from "../../shared/schema";
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

const props = defineProps<{ child: Child | null; error?: string; initial?: Task | null }>();
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

if (props.initial) {
  const task = props.initial;
  draft.title = task.title;
  draft.body = task.body ?? "";
  draft.type = task.type;
  draft.subject = task.subject ?? "语文";
  draft.dueDate = task.dueDate;
  draft.startDate = task.startDate ?? "";
  draft.createdBy = task.createdBy ?? "";
  draft.images = task.images ?? [];
} else {
  load();
}

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
  // 图片已经由 ImagePicker 写入正文；附件字段只给文件类使用。
  emit("submit", { ...draft, childId: props.initial?.childId ?? props.child?.id, images: [] });
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <div class="type-switch" role="group" aria-label="类型">
      <button type="button" :class="{ active: draft.type === 'homework' }" :aria-pressed="draft.type === 'homework'" @click="draft.type = 'homework'">
        作业
      </button>
      <button type="button" :class="{ active: draft.type === 'todo' }" :aria-pressed="draft.type === 'todo'" @click="draft.type = 'todo'">
        待办
      </button>
    </div>

    <label class="field">
      <span>标题</span>
      <input v-model.trim="draft.title" required maxlength="200" placeholder="例如：语文第三单元练习" />
    </label>

    <div class="grid">
      <label v-if="draft.type === 'homework'" class="field">
        <span>科目</span>
        <select v-model="draft.subject">
          <option v-for="subject in SUBJECTS" :key="subject">{{ subject }}</option>
        </select>
      </label>
      <label class="field">
        <span>谁记录的</span>
        <input v-model="draft.createdBy" maxlength="50" placeholder="爸爸 / 妈妈" />
      </label>
    </div>

    <div class="grid">
      <label class="field">
        <span>开始日</span>
        <input v-model="draft.startDate" type="date" />
      </label>
      <label class="field">
        <span>截止日</span>
        <input v-model="draft.dueDate" type="date" required />
      </label>
    </div>

    <label class="field">
      <span>正文</span>
      <textarea v-model="draft.body" rows="6" placeholder="支持 Markdown，可以直接粘贴图片" />
    </label>

    <ImagePicker v-model="draft.images" @insert="draft.body += $event" />

    <p v-if="error" class="error">{{ error }}</p>

    <div class="actions">
      <button type="submit" class="btn primary">保存</button>
    </div>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--space-4);
}

.type-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.type-switch button {
  min-height: 40px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.type-switch button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-1);
}

.field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.field > span {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 500;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

.actions {
  position: sticky;
  bottom: calc(-1 * var(--space-4));
  z-index: 2;
  padding: var(--space-3) 0 var(--space-2);
  background: linear-gradient(to bottom, transparent, var(--surface) 24%);
}

.actions .btn {
  width: 100%;
  min-height: 48px;
  font-size: var(--text-base);
}

@media (max-width: 380px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
