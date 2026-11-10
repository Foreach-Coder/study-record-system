<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { addDays, todayInShanghai } from "../../shared/dates";
import BehaviorCard from "../components/BehaviorCard.vue";
import EmptyState from "../components/EmptyState.vue";
import { store, visibleBehaviors } from "../stores/app";

const router = useRouter();
const today = computed(() => store.state?.today ?? todayInShanghai());
const days = ref(30);
const ranges: { value: number; label: string }[] = [
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
];
const list = computed(() => {
  const cutoff = addDays(today.value, -(days.value - 1));
  return [...visibleBehaviors()]
    .filter((item) => item.occurredOn >= cutoff)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
});
const stats = computed(() => ({
  total: list.value.length,
  positive: list.value.filter((item) => item.tone === "正向").length,
  attention: list.value.filter((item) => item.tone === "需关注").length,
}));
</script>

<template>
  <div class="behaviors-view">
    <section class="stats-card" aria-label="表现统计">
      <div class="stat">
        <strong>{{ stats.total }}</strong>
        <span>条记录</span>
      </div>
      <div class="stat positive">
        <strong>{{ stats.positive }}</strong>
        <span>正向</span>
      </div>
      <div class="stat attention">
        <strong>{{ stats.attention }}</strong>
        <span>需关注</span>
      </div>
    </section>

    <div class="range" role="tablist" aria-label="时间范围">
      <button
        v-for="item in ranges"
        :key="item.value"
        type="button"
        role="tab"
        :aria-selected="days === item.value"
        :class="{ active: days === item.value }"
        @click="days = item.value"
      >
        {{ item.label }}
      </button>
    </div>

    <EmptyState v-if="list.length === 0" title="这段时间还没有记录" message="点右下角“记录”添加一条。" />
    <div v-else class="list">
      <BehaviorCard
        v-for="item in list"
        :key="item.id"
        :behavior="item"
        :today="today"
        @open="router.push(`/behaviors/${item.id}`)"
      />
    </div>
  </div>
</template>

<style scoped>
.behaviors-view {
  padding-top: var(--space-2);
}

.stats-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

.stat {
  padding: var(--space-4) var(--space-3);
  border-right: 1px solid var(--line);
  text-align: center;
}

.stat:last-child {
  border-right: 0;
}

.stat strong {
  display: block;
  font-family: var(--font-numeric);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.stat span {
  color: var(--muted);
  font-size: var(--text-xs);
}

.stat.positive strong {
  color: var(--success);
}

.stat.attention strong {
  color: var(--warning);
}

.range {
  display: flex;
  gap: 2px;
  width: fit-content;
  margin: var(--space-4) 0 var(--space-3);
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.range button {
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.range button.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-1);
}

.list {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}
</style>
