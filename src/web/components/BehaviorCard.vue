<script setup lang="ts">
import type { Behavior } from "../../shared/schema";

defineProps<{ behavior: Behavior }>();
defineEmits<{ open: [behavior: Behavior] }>();
</script>

<template>
  <button type="button" class="card" @click="$emit('open', behavior)">
    <span class="date">{{ behavior.occurredOn.slice(5) }}</span>
    <span class="content">
      <strong>{{ behavior.title }}</strong>
      <span class="tags">
        <span v-if="behavior.dimension">{{ behavior.dimension }}</span>
        <span v-if="behavior.tone" :class="behavior.tone === '需关注' ? 'warn' : 'ok'">{{ behavior.tone }}</span>
        <span v-if="behavior.source">{{ behavior.source }}</span>
        <span v-if="behavior.childId === null" class="orphan">孤儿</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.card { width: 100%; display: flex; gap: 14px; text-align: left; padding: 14px; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: inherit; }
.date { color: var(--muted); font-size: 12px; padding-top: 3px; }
.content { flex: 1; }
strong { display: block; }
.tags { display: flex; gap: 8px; margin-top: 4px; color: var(--muted); font-size: 12px; }
.ok { color: var(--ok); }
.warn { color: var(--warn); }
.orphan { color: var(--warn); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
</style>
