<script setup lang="ts">
import { computed } from "vue";
import type { Behavior } from "../../shared/schema";
import { relativeDay } from "../../shared/relative";

const props = defineProps<{ behavior: Behavior; today: string }>();
defineEmits<{ open: [behavior: Behavior] }>();

const toneClass = computed(() => {
  if (props.behavior.tone === "需关注") return "warn";
  if (props.behavior.tone === "正向") return "ok";
  return "neutral";
});
</script>

<template>
  <button type="button" class="behavior-card" @click="$emit('open', behavior)">
    <span class="date">{{ relativeDay(behavior.occurredOn, today) }}</span>
    <span class="content">
      <strong>{{ behavior.title }}</strong>
      <span class="tags">
        <span v-if="behavior.dimension" class="dimension">{{ behavior.dimension }}</span>
        <span v-if="behavior.tone" class="tone" :class="toneClass">{{ behavior.tone }}</span>
        <span v-if="behavior.childId === null" class="orphan">孤儿</span>
      </span>
    </span>
    <svg class="chevron" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>

<style scoped>
.behavior-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 68px;
  padding: 12px var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  color: inherit;
  text-align: left;
  transition: background var(--duration-fast);
}

.behavior-card:last-child {
  border-bottom: 0;
}

.behavior-card:hover {
  background: var(--surface-2);
}

.date {
  flex: none;
  width: 56px;
  color: var(--muted);
  font-family: var(--font-numeric);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.content {
  flex: 1;
  min-width: 0;
}

strong {
  display: block;
  overflow: hidden;
  font-size: var(--text-base);
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: var(--text-xs);
}

.dimension {
  color: var(--text-secondary);
}

.tone.ok {
  color: var(--success);
}

.tone.warn {
  color: var(--warning);
}

.tone.neutral {
  color: var(--muted);
}

.orphan {
  padding: 0 6px;
  border: 1px solid currentColor;
  border-radius: var(--radius-pill);
  color: var(--warning);
}

.chevron {
  flex: none;
  color: var(--line-strong);
}
</style>
