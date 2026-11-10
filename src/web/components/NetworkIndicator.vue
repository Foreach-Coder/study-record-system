<script setup lang="ts">
import { network } from "../network";
</script>

<template>
  <div v-if="network.visible" class="network" role="status" aria-live="polite" aria-label="加载中">
    <div class="network-bar" aria-hidden="true"><span /></div>
    <div class="network-toast">
      <span class="spinner" aria-hidden="true" />
      加载中…
    </div>
  </div>
</template>

<style scoped>
.network-bar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 60;
  height: 2px;
  overflow: hidden;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
}

.network-bar span {
  display: block;
  width: 34%;
  height: 100%;
  background: var(--primary);
  animation: network-slide 1.05s var(--ease-out) infinite;
}

.network-toast {
  position: fixed;
  bottom: calc(var(--tab-height) + var(--space-4) + env(safe-area-inset-bottom));
  left: 50%;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  pointer-events: none;
  transform: translateX(-50%);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--line);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: network-spin 0.7s linear infinite;
}

@keyframes network-slide {
  from {
    transform: translateX(-110%);
  }
  to {
    transform: translateX(320%);
  }
}

@keyframes network-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 600px) {
  .network-toast {
    bottom: var(--space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .network-bar span {
    width: 100%;
    animation: none;
  }

  .spinner {
    animation-duration: 2s;
  }
}
</style>
