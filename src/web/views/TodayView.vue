<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { Task } from "../../shared/schema";
import { groupTasks, todayTasks } from "../../shared/grouping";
import { computeHorizon } from "../../shared/horizon";
import { relativeDay } from "../../shared/relative";
import { api, ApiError } from "../api";
import ProgressCard from "../components/ProgressCard.vue";
import EmptyState from "../components/EmptyState.vue";
import TaskGroup from "../components/TaskGroup.vue";
import { refresh, store, todayList, visibleBehaviors, visibleTasks } from "../stores/app";

const router = useRouter();
const today = computed(() => store.state?.today ?? "");
const tasks = computed(() => todayList());
const groups = computed(() => groupTasks(tasks.value));
const stats = computed(() => {
  if (!today.value) return { total: 0, done: 0, percent: 0 };
  const scope = todayTasks(visibleTasks(), today.value, computeHorizon(today.value), true);
  const done = scope.filter(
    (task) => task.completed && (task.dueDate === today.value || task.startDate === today.value),
  ).length;
  const total = scope.filter((task) => !task.completed).length + done;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
});
const recent = computed(() =>
  [...visibleBehaviors()]
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3),
);

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
  <div>
    <ProgressCard v-bind="stats" />

    <EmptyState v-if="tasks.length === 0" title="今天没有任务" message="可以休息一下，或点右下角“记录”添加。" />
    <TaskGroup
      v-for="group in groups"
      :key="group.key"
      :group="group"
      :today="today"
      @open="router.push(`/tasks/${$event.id}`)"
      @toggle="toggle"
    />

    <section v-if="recent.length" class="recent">
      <div class="recent-head">
        <h2>最近表现</h2>
        <button type="button" class="text-link" @click="router.push('/behaviors')">全部</button>
      </div>
      <div class="recent-list">
        <article v-for="item in recent" :key="item.id">
          <span class="dot" aria-hidden="true" />
          <strong>{{ item.title }}</strong>
          <span class="date">{{ relativeDay(item.occurredOn, today) }} · {{ item.occurredOn.slice(5) }}</span>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.recent {
  margin-top: var(--space-6);
}

.recent-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.recent h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.text-link {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: var(--text-xs);
}

.recent-list {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.recent article {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 52px;
  padding: 10px var(--space-3);
  border-bottom: 1px solid var(--line);
}

.recent article:last-child {
  border-bottom: 0;
}

.dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--success);
}

.recent strong {
  flex: 1;
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
</style>
