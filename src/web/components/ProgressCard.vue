<script setup lang="ts">
defineProps<{ total: number; done: number; percent: number }>();
</script>

<template>
  <section class="progress" aria-label="今日进度">
    <div class="copy">
      <p class="label">今日进度</p>
      <p class="number"><strong>{{ done }}</strong><span> / {{ total }}</span></p>
      <p class="hint">{{ total === 0 ? "今天没有安排，轻松一下" : done === total ? "今天全部完成" : `还剩 ${total - done} 项待完成` }}</p>
    </div>
    <div class="ring" :style="{ '--p': `${percent}%` }" role="img" :aria-label="`完成 ${percent}%`">
      <span>{{ percent }}<small>%</small></span>
    </div>
  </section>
</template>

<style scoped>
.progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin: var(--space-2) 0 var(--space-5);
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--line));
  border-radius: var(--radius-xl);
  background:
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 52%),
    var(--surface);
  box-shadow: var(--shadow-1);
}

.label {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.number {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 4px 0;
  line-height: 1;
}

.number strong {
  font-family: var(--font-numeric);
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.number span {
  color: var(--muted);
  font-size: var(--text-lg);
  font-weight: 500;
}

.hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.ring {
  display: grid;
  flex: none;
  width: 84px;
  height: 84px;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--primary) var(--p), var(--surface-3) 0);
}

.ring span {
  display: flex;
  width: 66px;
  height: 66px;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-numeric);
  font-size: var(--text-lg);
  font-weight: 700;
  white-space: nowrap;
}

.ring small {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
}
</style>
