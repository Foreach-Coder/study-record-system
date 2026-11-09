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
    <label class="field">
      <span>标题</span>
      <input v-model.trim="draft.title" required maxlength="200" placeholder="例如：主动帮同学捡书" />
    </label>

    <div class="grid">
      <label class="field">
        <span>日期</span>
        <input v-model="draft.occurredOn" type="date" required />
      </label>
      <label class="field">
        <span>维度</span>
        <select v-model="draft.dimension">
          <option v-for="item in DIMENSIONS" :key="item">{{ item }}</option>
        </select>
      </label>
    </div>

    <div class="field">
      <span>倾向</span>
      <div class="tone-switch" role="group" aria-label="倾向">
        <button
          v-for="item in TONES"
          :key="item"
          type="button"
          :class="[item === '正向' ? 'positive' : item === '需关注' ? 'attention' : 'neutral', { active: draft.tone === item }]"
          :aria-pressed="draft.tone === item"
          @click="draft.tone = item"
        >
          {{ item }}
        </button>
      </div>
    </div>

    <div class="grid">
      <label class="field">
        <span>来源</span>
        <select v-model="draft.source">
          <option v-for="item in SOURCES" :key="item">{{ item }}</option>
        </select>
      </label>
      <label class="field">
        <span>谁记录的</span>
        <input v-model="draft.createdBy" maxlength="50" placeholder="爸爸 / 妈妈" />
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

.tone-switch {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.tone-switch button {
  min-height: 38px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.tone-switch button.active {
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

.tone-switch .positive.active {
  color: var(--success);
}

.tone-switch .attention.active {
  color: var(--warning);
}

.tone-switch .neutral.active {
  color: var(--text);
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
