<script setup lang="ts">
import { computed, ref } from "vue";
import type { Task } from "../../shared/schema";
import { taskLabel } from "../../shared/labels";

const props = defineProps<{ task: Task; today: string }>();
defineEmits<{ open: [task: Task]; toggle: [task: Task]; check: [task: Task]; remove: [task: Task] }>();

const label = computed(() => taskLabel(props.task, props.today));
const revealed = ref(false);
const confirming = ref(false);
let startX = 0;

function onTouchStart(event: TouchEvent) {
  startX = event.touches[0]?.clientX ?? 0;
}

function onTouchEnd(event: TouchEvent) {
  const endX = event.changedTouches[0]?.clientX ?? startX;
  const delta = endX - startX;
  if (delta < -40) revealed.value = true;
  else if (delta > 40) {
    revealed.value = false;
    confirming.value = false;
  }
}
</script>

<template>
  <div class="task-row" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
    <button
      type="button"
      class="check"
      :class="{ done: task.completed }"
      :aria-label="task.completed ? '取消完成' : '完成'"
      @click.stop="$emit('toggle', task)"
    >
      {{ task.completed ? "✓" : "" }}
    </button>
    <button type="button" class="row-main" @click="$emit('open', task)">
      <span class="body">
        <span class="title" :class="{ done: task.completed }">{{ task.title }}</span>
        <span class="meta">
          <span v-if="task.type === 'homework' && task.subject">{{ task.subject }}</span>
          <span v-if="label" :class="label.tone">{{ label.text }}</span>
          <span v-if="task.checked">已检查</span>
          <span v-if="task.childId === null" class="orphan">孤儿</span>
        </span>
      </span>
      <span v-if="task.images.length" class="count">{{ task.images.length }} 图</span>
    </button>
    <div v-if="revealed" class="swipe-actions">
      <template v-if="confirming">
        <button type="button" class="danger" @click.stop="$emit('remove', task)">确认删除</button>
        <button type="button" @click.stop="confirming = false">取消</button>
      </template>
      <template v-else>
        <button type="button" @click.stop="$emit('check', task)">{{ task.checked ? "取消检查" : "检查" }}</button>
        <button type="button" class="danger" @click.stop="confirming = true">删除</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.task-row { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); margin-bottom: 8px; padding: 6px 10px; }
.check { width: 34px; height: 34px; flex: none; border-radius: 50%; border: 2px solid var(--line); background: transparent; display: grid; place-items: center; color: var(--ok); font-size: 14px; }
.check.done { background: var(--ok); border-color: var(--ok); color: white; }
.row-main { flex: 1; min-width: 0; display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 8px 4px; border: 0; background: transparent; color: inherit; }
.row-main:active { transform: scale(.995); }
.body { flex: 1; min-width: 0; }
.title { display: block; font-weight: 600; }
.title.done { text-decoration: line-through; color: var(--muted); }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; color: var(--muted); font-size: 12px; }
.overdue { color: var(--danger); font-weight: 600; }
.today { color: var(--accent); font-weight: 600; }
.count { color: var(--muted); font-size: 12px; white-space: nowrap; }
.orphan { color: var(--warn); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
.swipe-actions { display: flex; gap: 6px; flex: none; }
.swipe-actions button { min-height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 12px; }
.swipe-actions .danger { color: white; background: var(--danger); border-color: var(--danger); }
</style>
