<script setup lang="ts">
defineProps<{ title?: string; message: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="error-state" role="alert">
    <p class="title">{{ title ?? "加载失败" }}</p>
    <p class="message">{{ message }}</p>
    <button type="button" @click="$emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.error-state { padding: 28px 16px; text-align: center; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--text); }
.title { margin: 0 0 6px; font-weight: 600; }
.message { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
button { min-height: var(--tap); padding: 0 20px; border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: white; }
</style>
