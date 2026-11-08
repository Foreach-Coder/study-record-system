<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { groupCompletedTasks, groupTasks } from "../../shared/grouping";
import type { Task } from "../../shared/schema";
import { api, ApiError } from "../api";
import TaskGroup from "../components/TaskGroup.vue";
import EmptyState from "../components/EmptyState.vue";
import { refresh, store, visibleTasks } from "../stores/app";

type Status = "todo" | "done" | "all";
type TaskKind = "all" | "homework" | "todo";

const router = useRouter();
const status = ref<Status>("todo");
const kind = ref<TaskKind>("all");
const allTasks = computed(() =>
  visibleTasks().filter((task) => kind.value === "all" || task.type === kind.value),
);
const kindFilters: { key: TaskKind; label: string }[] = [
  { key: "all", label: "全部类型" },
  { key: "homework", label: "作业" },
  { key: "todo", label: "待办" },
];
const filtered = computed(() => {
  if (status.value === "todo") return allTasks.value.filter((task) => !task.completed);
  if (status.value === "done") return allTasks.value.filter((task) => task.completed);
  return allTasks.value;
});
const counts = computed(() => {
  const done = allTasks.value.filter((task) => task.completed).length;
  return { todo: allTasks.value.length - done, done, all: allTasks.value.length };
});
const filters = computed<{ key: Status; label: string; count: number }[]>(() => [
  { key: "todo", label: "待做", count: counts.value.todo },
  { key: "done", label: "已完成", count: counts.value.done },
  { key: "all", label: "全部", count: counts.value.all },
]);
const groups = computed(() =>
  status.value === "done"
    ? groupCompletedTasks(filtered.value)
    : groupTasks(filtered.value, status.value === "all"),
);
const today = computed(() => store.state?.today ?? "");

function open(task: Task) {
  router.push(`/tasks/${task.id}`);
}

function fail(error: unknown) {
  store.error = error instanceof ApiError ? error.message : "操作失败";
}

async function toggle(task: Task) {
  try {
    await api.updateTask(task.id, { completed: !task.completed });
    await refresh();
  } catch (error) {
    fail(error);
  }
}

async function check(task: Task) {
  try {
    await api.updateTask(task.id, { checked: !task.checked });
    await refresh();
  } catch (error) {
    fail(error);
  }
}

async function remove(task: Task) {
  try {
    await api.deleteTask(task.id);
    await refresh();
  } catch (error) {
    fail(error);
  }
}
</script>

<template>
  <div>
    <div class="filters" role="group" aria-label="筛选">
      <button
        v-for="item in filters"
        :key="item.key"
        type="button"
        :class="{ active: status === item.key }"
        :aria-label="item.key === 'all' ? '全部' : undefined"
        :aria-pressed="status === item.key"
        @click="status = item.key"
      >
        {{ item.label }} <span class="count">{{ item.count }}</span>
      </button>
    </div>
    <div class="filters" role="group" aria-label="类型">
      <button
        v-for="item in kindFilters"
        :key="item.key"
        type="button"
        :class="{ active: kind === item.key }"
        :aria-pressed="kind === item.key"
        @click="kind = item.key"
      >
        {{ item.label }}
      </button>
    </div>
    <EmptyState v-if="filtered.length === 0" title="还没有记录。" />
    <TaskGroup
      v-for="group in groups"
      :key="group.key"
      :group="group"
      :today="today"
      @open="open"
      @toggle="toggle"
      @check="check"
      @remove="remove"
    />
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 8px; margin: 8px 0 18px; }
.filters button { min-height: 36px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); padding: 0 14px; border-radius: 999px; }
.filters button.active { background: var(--accent); color: white; border-color: var(--accent); }
.filters .count { opacity: .75; font-variant-numeric: tabular-nums; }
.empty { color: var(--muted); }
</style>
