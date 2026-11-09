<script setup lang="ts">
import { computed } from "vue";
import type { Task } from "../../shared/schema";
import { groupHeader } from "../../shared/labels";
import type { TaskGroup } from "../../shared/grouping";
import TaskRow from "./TaskRow.vue";

const props = defineProps<{ group: TaskGroup; today: string }>();
defineEmits<{ open: [task: Task]; toggle: [task: Task] }>();

const overdue = computed(() => props.group.tasks.some((task) => !task.completed && task.dueDate < props.today));
const pending = computed(() => props.group.tasks.filter((task) => !task.completed).length);
</script>

<template>
  <section class="group" :class="{ overdue }">
    <header class="group-head">
      <h2>{{ groupHeader(props.group, today) }}</h2>
      <span class="count">{{ pending }} 项待完成</span>
    </header>
    <div class="list">
      <TaskRow
        v-for="task in group.tasks"
        :key="task.id"
        :task="task"
        :today="today"
        @open="$emit('open', $event)"
        @toggle="$emit('toggle', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.group {
  margin-bottom: var(--space-5);
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin: 0 var(--space-1) var(--space-2);
}

h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.count {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.group.overdue h2 {
  color: var(--danger);
}

.list {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}
</style>
