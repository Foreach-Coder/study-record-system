<script setup lang="ts">
import { computed } from "vue";
import type { Task } from "../../shared/schema";
import { groupHeader } from "../../shared/labels";
import type { TaskGroup } from "../../shared/grouping";
import TaskRow from "./TaskRow.vue";

const props = defineProps<{ group: TaskGroup; today: string }>();
defineEmits<{ open: [task: Task] }>();

const overdue = computed(() => props.group.tasks.some((task) => !task.completed && task.dueDate < props.today));
</script>

<template>
  <section class="group" :class="{ overdue }">
    <h2>{{ groupHeader(props.group, today) }}</h2>
    <TaskRow v-for="task in group.tasks" :key="task.id" :task="task" :today="today" @open="$emit('open', $event)" />
  </section>
</template>

<style scoped>
.group { margin-bottom: 20px; }
h2 { margin: 0 0 8px; font-size: 13px; color: var(--muted); font-weight: 500; letter-spacing: .04em; }
.group.overdue h2 { color: var(--danger); }
</style>
