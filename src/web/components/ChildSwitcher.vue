<script setup lang="ts">
import { computed, ref } from "vue";
import { children, selectChild, selectedChild } from "../stores/app";
import ChildManager from "./ChildManager.vue";

const current = computed(() => selectedChild());
const list = computed(() => children());
const manager = ref<InstanceType<typeof ChildManager> | null>(null);
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
    <button type="button" class="manage" @click="manager?.open()">管理孩子</button>
    <ChildManager ref="manager" />
  </div>
</template>

<style scoped>
.switcher { display: flex; align-items: center; gap: 6px; }
.switcher select { min-height: var(--tap); border: 1px solid var(--line); border-radius: 999px; background: var(--surface); padding: 0 12px; }
.manage { min-height: var(--tap); border: 1px solid var(--line); border-radius: 999px; background: transparent; padding: 0 10px; color: var(--muted); font-size: 12px; }
</style>
