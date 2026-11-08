<script setup lang="ts">
defineProps<{ title: string; message?: string }>();
</script>

<template>
  <div class="empty">
    <p class="title">{{ title }}</p>
    <p v-if="message" class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.empty { padding: 36px 0; text-align: center; color: var(--muted); }
.title { margin: 0; font-size: 15px; }
.message { margin: 8px 0 0; font-size: 13px; }
</style>
