<script setup lang="ts">
import DOMPurify from "dompurify";
import { marked } from "marked";
import { computed, ref } from "vue";
import ImageViewer from "./ImageViewer.vue";

const props = defineProps<{ body: string }>();
const viewing = ref<string | null>(null);
const html = computed(() => DOMPurify.sanitize(marked.parse(props.body, { async: false }) as string));

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.tagName === "IMG") viewing.value = (target as HTMLImageElement).src;
}
</script>

<template>
  <article class="markdown" @click="onClick" v-html="html" />
  <ImageViewer v-if="viewing" :src="viewing" @close="viewing = null" />
</template>

<style scoped>
.markdown { line-height: 1.7; overflow-wrap: anywhere; }
.markdown :deep(h1), .markdown :deep(h2), .markdown :deep(h3) { line-height: 1.25; margin: 1.2em 0 .5em; }
.markdown :deep(img) { max-width: 100%; border-radius: 12px; cursor: zoom-in; }
.markdown :deep(pre) { overflow: auto; background: var(--surface-2); padding: 12px; border-radius: 12px; }
.markdown :deep(blockquote) { margin: 0; padding-left: 14px; border-left: 3px solid var(--accent); color: var(--muted); }
</style>
