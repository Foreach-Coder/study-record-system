<script setup lang="ts">
defineProps<{ title: string; message?: string }>();
</script>

<template>
  <div class="empty">
    <span class="glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5z" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 10h8M8 13.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </span>
    <p class="title">{{ title }}</p>
    <p v-if="message" class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.empty {
  display: grid;
  justify-items: center;
  gap: var(--space-1);
  padding: var(--space-8) var(--space-4);
  color: var(--muted);
  text-align: center;
}

.glyph {
  display: grid;
  width: 52px;
  height: 52px;
  margin-bottom: var(--space-2);
  place-items: center;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  color: var(--muted);
}

.title {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-base);
  font-weight: 500;
}

.message {
  max-width: 260px;
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.5;
}
</style>
