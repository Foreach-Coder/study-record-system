<script setup lang="ts">
import { computed, ref } from "vue";
import { children, selectChild, selectedChild } from "../stores/app";
import ChildManager from "./ChildManager.vue";

const current = computed(() => selectedChild());
const list = computed(() => children());
const manager = ref<InstanceType<typeof ChildManager> | null>(null);

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  selectChild(value === "all" ? "all" : value || null);
}
</script>

<template>
  <div class="switcher">
    <label class="sr-only" for="child-select">孩子</label>
    <svg class="person" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8" />
      <path d="M5 20c.8-3.4 3.5-5.2 7-5.2s6.2 1.8 7 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
    <select id="child-select" :value="current?.id ?? 'all'" :disabled="list.length === 0" @change="onChange">
      <option v-if="list.length === 0" value="">还没有孩子</option>
      <option v-else value="all">全部孩子</option>
      <option v-for="child in list" :key="child.id" :value="child.id">{{ child.nickname }}</option>
    </select>
    <button type="button" class="manage" aria-label="档案管理" @click="manager?.open()">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </button>
    <ChildManager ref="manager" />
  </div>
</template>

<style scoped>
.switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 40px;
  padding: 0 4px 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text-secondary);
}

.person {
  flex: none;
  color: var(--primary);
}

.switcher select {
  width: auto;
  min-height: 38px;
  max-width: 132px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0 4px;
  font-size: var(--text-sm);
  font-weight: 600;
  box-shadow: none;
}

.switcher select:focus {
  box-shadow: none;
}

.manage {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
}

.manage:hover {
  background: var(--surface-2);
  color: var(--primary);
}

@media (max-width: 560px) {
  .switcher select {
    max-width: 100px;
  }
}
</style>
