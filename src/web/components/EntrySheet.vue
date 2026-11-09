<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api, ApiError } from "../api";
import { refresh, selectedChild } from "../stores/app";
import BehaviorForm from "./BehaviorForm.vue";
import TaskForm from "./TaskForm.vue";
import type { Behavior, Task } from "../../shared/schema";

type Mode = "task" | "behavior";
const DRAFT_KEYS: Record<Mode, string> = { task: "sr.draft.task", behavior: "sr.draft.behavior" };

const open = ref(false);
const mode = ref<Mode>("task");
const error = ref("");
const busy = ref(false);
const child = computed(() => selectedChild());
const editingTask = ref<Task | null>(null);
const editingBehavior = ref<Behavior | null>(null);
const taskForm = ref<InstanceType<typeof TaskForm> | null>(null);
const behaviorForm = ref<InstanceType<typeof BehaviorForm> | null>(null);

const title = computed(() => {
  if (mode.value === "task") return editingTask.value ? "编辑作业/待办" : "新增记录";
  return editingBehavior.value ? "编辑在校表现" : "新增在校表现";
});

watch(open, (value) => {
  document.body.style.overflow = value ? "hidden" : "";
});

function show(next: Mode) {
  mode.value = next;
  editingTask.value = null;
  editingBehavior.value = null;
  error.value = "";
  open.value = true;
}

function editTask(task: Task) {
  mode.value = "task";
  editingTask.value = task;
  editingBehavior.value = null;
  error.value = "";
  open.value = true;
}

function editBehavior(behavior: Behavior) {
  mode.value = "behavior";
  editingBehavior.value = behavior;
  editingTask.value = null;
  error.value = "";
  open.value = true;
}

function switchMode(next: Mode) {
  if (editingTask.value || editingBehavior.value) return;
  mode.value = next;
  error.value = "";
}

function close() {
  if (busy.value) return;
  open.value = false;
}

async function submit(body: Record<string, unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (mode.value === "task") {
      if (editingTask.value) await api.updateTask(editingTask.value.id, body);
      else await api.createTask(body);
      taskForm.value?.reset();
    } else {
      if (editingBehavior.value) await api.updateBehavior(editingBehavior.value.id, body);
      else await api.createBehavior(body);
      behaviorForm.value?.reset();
    }
    try {
      localStorage.removeItem(DRAFT_KEYS[mode.value]);
    } catch {
      /* ignore */
    }
    open.value = false;
    await refresh();
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : "保存失败，请重试";
  } finally {
    busy.value = false;
  }
}

defineExpose({ show, editTask, editBehavior });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @click.self="close">
      <section class="sheet" role="dialog" :aria-label="title">
        <div class="handle" aria-hidden="true" />
        <header class="head">
          <h2>{{ title }}</h2>
          <button type="button" class="close" aria-label="关闭" @click="close">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </header>
        <div v-if="!editingTask && !editingBehavior" class="mode-bar" role="tablist" aria-label="记录类型">
          <button type="button" role="tab" :aria-selected="mode === 'task'" :class="{ active: mode === 'task' }" @click="switchMode('task')">
            作业 / 待办
          </button>
          <button type="button" role="tab" :aria-selected="mode === 'behavior'" :class="{ active: mode === 'behavior' }" @click="switchMode('behavior')">
            在校表现
          </button>
        </div>
        <div class="sheet-body">
          <TaskForm v-if="mode === 'task'" ref="taskForm" :child="child" :initial="editingTask" :error="error" @submit="submit" />
          <BehaviorForm v-else ref="behaviorForm" :child="child" :initial="editingBehavior" :error="error" @submit="submit" />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--scrim);
  backdrop-filter: blur(2px);
}

.sheet {
  display: flex;
  flex-direction: column;
  width: min(100%, 640px);
  max-height: 92dvh;
  overflow: hidden;
  padding: 6px var(--space-4) 0;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  background: var(--surface);
  box-shadow: var(--shadow-3);
  animation: sheet-up var(--duration-base) var(--ease-out);
}

.handle {
  width: 36px;
  height: 4px;
  flex: none;
  margin: 4px auto 0;
  border-radius: var(--radius-pill);
  background: var(--line-strong);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: var(--space-3) 0 var(--space-2);
}

.head h2 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
}

.close {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--muted);
}

.mode-bar {
  display: flex;
  flex: none;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.mode-bar button {
  flex: 1;
  min-height: 38px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.mode-bar button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-1);
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-3) 0 calc(var(--space-4) + env(safe-area-inset-bottom));
}

@keyframes sheet-up {
  from {
    transform: translateY(28px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
