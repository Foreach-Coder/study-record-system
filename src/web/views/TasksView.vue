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
const filterOpen = ref(false);
const allTasks = computed(() => visibleTasks().filter((task) => kind.value === "all" || task.type === kind.value));
const kindFilters: { key: TaskKind; label: string }[] = [
  { key: "all", label: "全部类型" },
  { key: "homework", label: "作业" },
  { key: "todo", label: "待办" },
];
const activeKindLabel = computed(() => kindFilters.find((item) => item.key === kind.value)?.label ?? "全部类型");
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

function chooseKind(next: TaskKind) {
  kind.value = next;
  filterOpen.value = false;
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
</script>

<template>
  <div class="tasks-view">
    <div class="segmented" role="tablist" aria-label="任务状态">
      <button
        v-for="item in filters"
        :key="item.key"
        type="button"
        role="tab"
        :aria-selected="status === item.key"
        :class="{ active: status === item.key }"
        @click="status = item.key"
      >
        {{ item.label }}<span class="count">{{ item.count }}</span>
      </button>
    </div>

    <div class="toolbar">
      <button type="button" class="filter-btn" :class="{ active: kind !== 'all' }" @click="filterOpen = true">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        {{ activeKindLabel }}
      </button>
      <span class="total">共 {{ filtered.length }} 条</span>
    </div>

    <EmptyState v-if="filtered.length === 0" title="没有符合条件的记录" message="换个筛选条件试试。" />
    <TaskGroup
      v-for="group in groups"
      :key="group.key"
      :group="group"
      :today="today"
      @open="open"
      @toggle="toggle"
    />

    <Teleport to="body">
      <div v-if="filterOpen" class="sheet-mask" @click.self="filterOpen = false">
        <div class="filter-sheet" role="dialog" aria-modal="true" aria-label="筛选类型">
          <div class="sheet-handle" aria-hidden="true" />
          <h2>按类型筛选</h2>
          <button
            v-for="item in kindFilters"
            :key="item.key"
            type="button"
            class="option"
            :class="{ active: kind === item.key }"
            @click="chooseKind(item.key)"
          >
            <span>{{ item.label }}</span>
            <svg v-if="kind === item.key" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <path d="m5 12 4.2 4.2L19 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tasks-view {
  padding-top: var(--space-2);
}

.segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.segmented button {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 38px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background var(--duration-fast), color var(--duration-fast), box-shadow var(--duration-fast);
}

.segmented button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-1);
}

.count {
  margin-left: 4px;
  color: var(--muted);
  font-family: var(--font-numeric);
  font-size: 11px;
}

.segmented button.active .count {
  color: var(--primary);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: var(--space-4) 0 var(--space-3);
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.filter-btn.active {
  border-color: color-mix(in srgb, var(--primary) 30%, var(--line));
  background: var(--primary-soft);
  color: var(--primary);
}

.total {
  color: var(--muted);
  font-size: var(--text-xs);
}

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--scrim);
  backdrop-filter: blur(2px);
}

.filter-sheet {
  width: min(100%, 640px);
  padding: 8px var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  animation: sheet-up var(--duration-base) var(--ease-out);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  margin: 4px auto var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--line-strong);
}

h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 52px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  font-size: var(--text-base);
  text-align: left;
}

.option:last-child {
  border-bottom: 0;
}

.option.active {
  color: var(--primary);
  font-weight: 600;
}

@keyframes sheet-up {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
