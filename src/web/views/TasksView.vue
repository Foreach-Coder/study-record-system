<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { groupTasks } from "../../shared/grouping";
import type { Task } from "../../shared/schema";
import TaskGroup from "../components/TaskGroup.vue";
import { store, visibleTasks } from "../stores/app";

type Filter = "all" | "homework" | "todo";

const router = useRouter();
const filter = ref<Filter>("all");
const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "homework", label: "作业" },
  { key: "todo", label: "待办" },
];
const tasks = computed(() => visibleTasks().filter((task) => filter.value === "all" || task.type === filter.value));
const groups = computed(() => groupTasks(tasks.value));
const today = computed(() => store.state?.today ?? "");

function open(task: Task) {
  router.push(`/tasks/${task.id}`);
}
</script>

<template>
  <div>
    <div class="filters" role="group" aria-label="筛选">
      <button
        v-for="item in filters"
        :key="item.key"
        type="button"
        :class="{ active: filter === item.key }"
        @click="filter = item.key"
      >
        {{ item.label }}
      </button>
    </div>
    <p v-if="tasks.length === 0" class="empty">还没有记录。</p>
    <TaskGroup v-for="group in groups" :key="group.key" :group="group" :today="today" @open="open" />
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 8px; margin: 8px 0 18px; }
.filters button { min-height: 36px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); padding: 0 14px; border-radius: 999px; }
.filters button.active { background: var(--accent); color: white; border-color: var(--accent); }
.empty { color: var(--muted); }
</style>
