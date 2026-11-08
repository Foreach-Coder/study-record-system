<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { Task } from "../../shared/schema";
import { groupTasks } from "../../shared/grouping";
import { progress } from "../../shared/labels";
import { api, ApiError } from "../api";
import ProgressCard from "../components/ProgressCard.vue";
import TaskGroup from "../components/TaskGroup.vue";
import { refresh, selectedChild, store, todayList, visibleTasks } from "../stores/app";

const router = useRouter();
const today = computed(() => store.state?.today ?? "");
const tasks = computed(() => todayList());
const groups = computed(() => groupTasks(tasks.value));
const stats = computed(() => today.value ? progress(visibleTasks(), today.value) : { total: 0, done: 0, percent: 0 });
const recent = computed(() => {
  const child = selectedChild();
  return (store.state?.behaviors ?? []).filter((item) => item.childName === child?.nickname).slice(0, 3);
});

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
    <ProgressCard v-bind="stats" />
    <p v-if="store.error" class="error">{{ store.error }}</p>
    <p v-else-if="tasks.length === 0" class="empty">今天没有要做的，休息一下吧。</p>
    <TaskGroup
      v-for="group in groups"
      :key="group.key"
      :group="group"
      :today="today"
      @open="router.push(`/tasks/${$event.id}`)"
      @toggle="toggle"
      @check="check"
      @remove="remove"
    />
    <section v-if="recent.length" class="recent">
      <h2>最近表现</h2>
      <article v-for="item in recent" :key="item.id">
        <strong>{{ item.title }}</strong>
        <span>{{ item.occurredOn }}</span>
      </article>
    </section>
  </div>
</template>

<style scoped>
.error { color: var(--danger); }
.empty { color: var(--muted); padding: 24px 0; }
.recent { margin-top: 28px; }
.recent h2 { font-size: 13px; color: var(--muted); font-weight: 500; }
.recent article { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.recent span { color: var(--muted); font-size: 12px; }
</style>
