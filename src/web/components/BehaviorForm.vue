<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Behavior, Child, Dimension, Source, TaskImage, Tone } from "../../shared/schema";
import { DIMENSIONS, SOURCES, TONES } from "../../shared/schema";
import { todayInShanghai } from "../../shared/dates";
import ImagePicker from "./ImagePicker.vue";

const DRAFT_KEY = "sr.draft.behavior";

interface Draft {
  title: string;
  body: string;
  occurredOn: string;
  dimension: Dimension;
  tone: Tone;
  source: Source;
  createdBy: string;
  images: TaskImage[];
}

function blank(): Draft {
  return {
    title: "",
    body: "",
    occurredOn: todayInShanghai(),
    dimension: "品格",
    tone: "正向",
    source: "老师反馈",
    createdBy: "爸爸",
    images: [],
  };
}

const props = defineProps<{ child: Child | null; error?: string; initial?: Behavior | null }>();
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
    if (typeof saved.occurredOn === "string") draft.occurredOn = saved.occurredOn;
    if (typeof saved.dimension === "string" && (DIMENSIONS as readonly string[]).includes(saved.dimension)) {
      draft.dimension = saved.dimension as Dimension;
    }
    if (typeof saved.tone === "string" && (TONES as readonly string[]).includes(saved.tone)) draft.tone = saved.tone as Tone;
    if (typeof saved.source === "string" && (SOURCES as readonly string[]).includes(saved.source)) draft.source = saved.source as Source;
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
  const behavior = props.initial;
  draft.title = behavior.title;
  draft.body = behavior.body ?? "";
  draft.occurredOn = behavior.occurredOn;
  draft.dimension = behavior.dimension ?? "品格";
  draft.tone = behavior.tone ?? "正向";
  draft.source = behavior.source ?? "老师反馈";
  draft.createdBy = behavior.createdBy ?? "";
  draft.images = behavior.images ?? [];
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
    <label>标题<input v-model.trim="draft.title" required maxlength="200" /></label>
    <label>日期<input v-model="draft.occurredOn" type="date" required /></label>
    <label>
      维度
      <select v-model="draft.dimension">
        <option v-for="item in DIMENSIONS" :key="item">{{ item }}</option>
      </select>
    </label>
    <label>
      语气
      <select v-model="draft.tone">
        <option v-for="item in TONES" :key="item">{{ item }}</option>
      </select>
    </label>
    <label>
      来源
      <select v-model="draft.source">
        <option v-for="item in SOURCES" :key="item">{{ item }}</option>
      </select>
    </label>
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
