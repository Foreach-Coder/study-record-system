<script setup lang="ts">
defineProps<{ title?: string; message: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="error-state" role="alert">
    <span class="glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7" />
        <path d="M12 7.5v5.5M12 16.5v.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
      </svg>
    </span>
    <p class="title">{{ title ?? "加载失败" }}</p>
    <p class="message">{{ message }}</p>
    <button type="button" class="btn" @click="$emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.error-state {
  display: grid;
  justify-items: center;
  gap: var(--space-1);
  margin: var(--space-4) 0;
  padding: var(--space-6) var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  text-align: center;
}

.glyph {
  display: grid;
  width: 48px;
  height: 48px;
  margin-bottom: var(--space-1);
  place-items: center;
  border-radius: 50%;
  background: var(--danger-soft);
  color: var(--danger);
}

.title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
}

.message {
  max-width: 320px;
  margin: 0 0 var(--space-3);
  color: var(--muted);
  font-size: var(--text-xs);
}

.btn {
  min-height: 40px;
  padding: 0 var(--space-5);
}
</style>
