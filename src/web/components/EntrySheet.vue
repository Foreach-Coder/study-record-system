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
      <section
        class="sheet"
        role="dialog"
        :aria-label="mode === 'task' ? (editingTask ? '编辑作业或待办' : '新增作业或待办') : (editingBehavior ? '编辑在校表现' : '新增在校表现')"
      >
        <header class="head">
          <h2>{{ mode === "task" ? (editingTask ? "编辑作业或待办" : "新增作业或待办") : (editingBehavior ? "编辑在校表现" : "新增在校表现") }}</h2>
          <button type="button" aria-label="关闭" @click="close">×</button>
        </header>
        <TaskForm v-if="mode === 'task'" ref="taskForm" :child="child" :initial="editingTask" :error="error" @submit="submit" />
        <BehaviorForm v-else ref="behaviorForm" :child="child" :initial="editingBehavior" :error="error" @submit="submit" />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 40%); display: flex; align-items: flex-end; justify-content: center; }
.sheet { width: min(100%, 640px); max-height: 92dvh; overflow-y: auto; background: var(--bg); border-radius: 20px 20px 0 0; padding: 16px 18px calc(18px + env(safe-area-inset-bottom)); box-shadow: 0 -12px 32px rgb(0 0 0 / 16%); }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.head h2 { margin: 0; font-size: 17px; }
.head button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--surface); font-size: 20px; }
</style>
