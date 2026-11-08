<script setup lang="ts">
import { computed } from "vue";
import type { Task } from "../../shared/schema";
import { taskLabel } from "../../shared/labels";

const props = defineProps<{ task: Task; today: string }>();
defineEmits<{ open: [task: Task] }>();

const label = computed(() => taskLabel(props.task, props.today));
</script>

<template>
  <button type="button" class="row" @click="$emit('open', task)">
    <span class="check" :class="{ done: task.completed }" aria-hidden="true">{{ task.completed ? "✓" : "" }}</span>
    <span class="body">
      <span class="title" :class="{ done: task.completed }">{{ task.title }}</span>
      <span class="meta">
        <span v-if="task.type === 'homework' && task.subject">{{ task.subject }}</span>
        <span v-if="label" :class="label.tone">{{ label.text }}</span>
        <span v-if="task.checked">已检查</span>
      </span>
    </span>
    <span v-if="task.images.length" class="count">{{ task.images.length }} 图</span>
  </button>
</template>

<style scoped>
.row { width: 100%; display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: inherit; margin-bottom: 8px; }
.row:active { transform: scale(.995); }
.check { width: 24px; height: 24px; flex: none; border-radius: 50%; border: 2px solid var(--line); display: grid; place-items: center; color: var(--ok); font-size: 13px; }
.check.done { background: var(--ok); border-color: var(--ok); color: white; }
.body { flex: 1; min-width: 0; }
.title { display: block; font-weight: 600; }
.title.done { text-decoration: line-through; color: var(--muted); }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; color: var(--muted); font-size: 12px; }
.overdue { color: var(--danger); font-weight: 600; }
.today { color: var(--accent); font-weight: 600; }
.count { color: var(--muted); font-size: 12px; white-space: nowrap; }
</style>
