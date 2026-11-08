<script setup lang="ts">
defineProps<{ total: number; done: number; percent: number }>();
</script>

<template>
  <section class="progress" aria-label="今日进度">
    <div>
      <p class="label">今日进度</p>
      <p class="number">{{ done }} / {{ total }}</p>
    </div>
    <div class="ring" :style="{ '--p': `${percent}%` }"><span>{{ percent }}%</span></div>
  </section>
</template>

<style scoped>
.progress { display: flex; align-items: center; justify-content: space-between; margin: 8px 0 18px; padding: 18px 20px; border-radius: var(--radius); background: linear-gradient(135deg, var(--surface), var(--surface-2)); border: 1px solid var(--line); box-shadow: var(--shadow); }
.label { margin: 0; color: var(--muted); font-size: 13px; }
.number { margin: 4px 0 0; font-size: 30px; font-weight: 700; letter-spacing: -.02em; }
.ring { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--accent) var(--p), var(--surface-2) 0); }
.ring span { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); font-size: 12px; font-weight: 600; }
</style>
