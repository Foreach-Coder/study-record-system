<script setup lang="ts">
import DOMPurify from "dompurify";
import { marked } from "marked";
import { computed, nextTick, ref, watch } from "vue";
import { parseChecklist, toggleChecklistItem } from "../../shared/checklist";
import ImageViewer from "./ImageViewer.vue";

const props = defineProps<{ body: string; interactive?: boolean }>();
const emit = defineEmits<{ toggle: [body: string] }>();

const viewing = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);
const html = computed(() =>
  DOMPurify.sanitize(
    marked.parse(props.body, { async: false, gfm: true, breaks: true }) as string,
    { FORBID_TAGS: ["style"], FORBID_ATTR: ["style", "srcset"] },
  ),
);

watch(
  () => [props.body, props.interactive] as const,
  () => void nextTick(bind),
  { immediate: true },
);

// 组件是受控的：正文只有 props.body 一份，勾选后把新正文 emit 给父级，
// 父级写回 props 再触发重新渲染。组件内部不保存第二份正文，避免回刷。

function bind() {
  const element = root.value;
  if (!element) return;
  const inputs = Array.from(
    element.querySelectorAll<HTMLInputElement>("li > input[type=checkbox]"),
  );
  const items = parseChecklist(props.body);
  if (!props.interactive || inputs.length !== items.length) {
    for (const input of inputs) input.disabled = true;
    return;
  }
  inputs.forEach((input, index) => {
    const item = items[index]!;
    input.disabled = false;
    input.checked = item.checked;
    input.setAttribute("aria-label", item.text);
    input.onchange = () => {
      const next = toggleChecklistItem(props.body, index);
      if (next === null) {
        input.checked = item.checked;
        return;
      }
      emit("toggle", next);
    };
  });
}

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.tagName === "IMG") viewing.value = (target as HTMLImageElement).src;
}
</script>

<template>
  <article ref="root" class="markdown" :class="{ 'markdown--interactive': interactive }" @click="onClick" v-html="html" />
  <ImageViewer v-if="viewing" :src="viewing" @close="viewing = null" />
</template>

<style scoped>
.markdown { line-height: 1.7; overflow-wrap: anywhere; }
.markdown :deep(h1), .markdown :deep(h2), .markdown :deep(h3) { line-height: 1.25; margin: 1.2em 0 .5em; }
.markdown :deep(img) { max-width: 100%; border-radius: 12px; cursor: zoom-in; }
.markdown :deep(pre) { overflow: auto; background: var(--surface-2); padding: 12px; border-radius: 12px; }
.markdown :deep(blockquote) { margin: 0; padding-left: 14px; border-left: 3px solid var(--accent); color: var(--muted); }
.markdown :deep(li:has(> input[type="checkbox"])) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  list-style: none;
  margin-left: -1.35em;
}
.markdown :deep(li > input[type="checkbox"]) {
  flex: none;
  width: 18px;
  height: 18px;
  min-height: 0;
  margin: 4px 0 0;
  padding: 0;
  accent-color: var(--primary);
}
.markdown--interactive :deep(li > input[type="checkbox"]) { cursor: pointer; }
.markdown--interactive :deep(li:has(> input[type="checkbox"]:checked)) { color: var(--muted); }
</style>
