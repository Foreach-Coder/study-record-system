<script setup lang="ts">
import { computed } from "vue";
import { children, selectChild, selectedChild } from "../stores/app";
const current = computed(() => selectedChild());
const list = computed(() => children());
</script>

<template>
  <div class="switcher">
    <label class="sr-only" for="child-select">孩子</label>
    <select
      id="child-select"
      :value="current?.id ?? ''"
      :disabled="list.length === 0"
      @change="selectChild(($event.target as HTMLSelectElement).value || null)"
    >
      <option v-if="list.length === 0" value="">还没有孩子</option>
      <option v-for="child in list" :key="child.id" :value="child.id">{{ child.nickname }}</option>
    </select>
  </div>
</template>

<style scoped>
.switcher select { min-height: var(--tap); border: 1px solid var(--line); border-radius: 999px; background: var(--surface); padding: 0 12px; }
</style>
