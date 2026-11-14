<script setup lang="ts">
import { computed } from "vue";
import { checklistProgress } from "../../shared/checklist";
import type { Task } from "../../shared/schema";
import { taskLabel } from "../../shared/labels";

const props = defineProps<{ task: Task; today: string }>();
defineEmits<{ open: [task: Task]; toggle: [task: Task] }>();

const label = computed(() => taskLabel(props.task, props.today));
const attachmentCount = computed(() => props.task.attachments.length);
const progress = computed(() => checklistProgress(props.task.body));
</script>

<template>
  <div class="task-row" :class="{ 'task-row--done': task.completed }">
    <button
      type="button"
      class="check"
      :class="{ done: task.completed }"
      :aria-label="task.completed ? '取消完成' : '完成'"
      :aria-pressed="task.completed"
      @click.stop="$emit('toggle', task)"
    >
      <svg v-if="task.completed" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
        <path d="m5 12 4.2 4.2L19 6.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button type="button" class="row-main" @click="$emit('open', task)">
      <span class="body">
        <span class="title" :class="{ done: task.completed }">{{ task.title }}</span>
        <span class="meta">
          <span v-if="task.type === 'homework' && task.subject" class="subject">{{ task.subject }}</span>
          <span v-else-if="task.type === 'todo'" class="subject">待办</span>
          <span v-if="label" class="label" :class="label.tone">{{ label.text }}</span>
          <span v-if="task.checked" class="checked">已检查</span>
          <span v-if="progress.total" class="progress" :class="{ done: progress.done === progress.total }">
            {{ progress.done }}/{{ progress.total }}
          </span>
          <span v-if="task.childId === null" class="orphan">孤儿</span>
        </span>
      </span>
      <span class="trailing">
        <span v-if="attachmentCount" class="attach" :aria-label="`${attachmentCount} 个附件`">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
            <path d="m9 12 5.2-5.2a3.4 3.4 0 0 1 4.8 4.8L11.4 19a5.2 5.2 0 0 1-7.4-7.4l7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ attachmentCount }}
        </span>
        <svg class="chevron" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>
  </div>
</template>

<style scoped>
.task-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 72px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  transition: background var(--duration-fast);
}

.task-row:last-child {
  border-bottom: 0;
}

.task-row:hover {
  background: var(--surface-2);
}

.check {
  display: grid;
  flex: none;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1.8px solid var(--line-strong);
  border-radius: 50%;
  background: transparent;
  color: var(--on-primary);
  transition: background var(--duration-fast), border-color var(--duration-fast), transform var(--duration-fast);
}

.check:active {
  transform: scale(0.9);
}

.check.done {
  border-color: var(--primary);
  background: var(--primary);
}

.row-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.body {
  flex: 1;
  min-width: 0;
}

.title {
  display: block;
  overflow: hidden;
  color: var(--text);
  font-size: var(--text-base);
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title.done {
  color: var(--muted);
  text-decoration: line-through;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: var(--muted);
  font-size: var(--text-xs);
}

.subject {
  color: var(--text-secondary);
  font-weight: 500;
}

.label.overdue {
  color: var(--danger);
  font-weight: 600;
}

.label.today {
  color: var(--primary);
  font-weight: 600;
}

.checked {
  color: var(--success);
}

.progress {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.progress.done {
  color: var(--success);
}

.orphan {
  padding: 0 6px;
  border: 1px solid currentColor;
  border-radius: var(--radius-pill);
  color: var(--warning);
}

.trailing {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
  color: var(--muted);
}

.attach {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
}

.chevron {
  color: var(--line-strong);
}
</style>
