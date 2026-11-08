<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { addDays, todayInShanghai } from "../../shared/dates";
import BehaviorCard from "../components/BehaviorCard.vue";
import { selectedChild, store } from "../stores/app";

const router = useRouter();
const days = ref(30);
const list = computed(() => {
  const child = selectedChild();
  const cutoff = addDays(todayInShanghai(), -(days.value - 1));
  return (store.state?.behaviors ?? []).filter((item) => item.childName === child?.nickname && item.occurredOn >= cutoff);
});
const stats = computed(() => ({
  total: list.value.length,
  positive: list.value.filter((item) => item.tone === "正向").length,
  attention: list.value.filter((item) => item.tone === "需关注").length,
}));
</script>

<template>
  <div>
    <div class="stats">
      <span><strong>{{ stats.total }}</strong> 条</span>
      <span><strong>{{ stats.positive }}</strong> 正向</span>
      <span><strong>{{ stats.attention }}</strong> 需关注</span>
      <select v-model.number="days" aria-label="时间范围">
        <option :value="7">近 7 天</option>
        <option :value="30">近 30 天</option>
        <option :value="90">近 90 天</option>
      </select>
    </div>
    <p v-if="list.length === 0" class="empty">这段时间没有记录。</p>
    <BehaviorCard v-for="item in list" :key="item.id" :behavior="item" @open="router.push(`/behaviors/${item.id}`)" />
  </div>
</template>

<style scoped>
.stats { display: flex; align-items: center; gap: 14px; margin: 8px 0 18px; color: var(--muted); font-size: 13px; }
.stats strong { color: var(--text); font-size: 18px; }
.stats select { margin-left: auto; min-height: 36px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.empty { color: var(--muted); }
</style>
