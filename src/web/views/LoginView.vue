<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, ApiError } from "../api";
import { store } from "../stores/app";

const passcode = ref("");
const error = ref("");
const busy = ref(false);
const router = useRouter();
const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function press(key: string) {
  if (busy.value) return;
  error.value = "";
  if (key === "del") {
    passcode.value = passcode.value.slice(0, -1);
    return;
  }
  if (!key) return;
  if (passcode.value.length < 4) passcode.value += key;
}

async function submit() {
  if (!passcode.value || busy.value) {
    if (!passcode.value) error.value = "请输入家庭口令";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await api.login(passcode.value);
    store.sessionChecked = true;
    await router.replace("/today");
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : "登录失败";
    passcode.value = "";
  } finally {
    busy.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key >= "0" && event.key <= "9") {
    press(event.key);
    event.preventDefault();
  } else if (event.key === "Backspace") {
    press("del");
    event.preventDefault();
  } else if (event.key === "Enter") {
    void submit();
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <main class="login">
    <section class="card">
      <div class="brand" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="32" height="32">
          <path d="M10 12.5c5-2 10-2 14 1v23c-4-3-9-3-14-1z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
          <path d="M38 12.5c-5-2-10-2-14 1v23c4-3 9-3 14-1z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
        </svg>
      </div>
      <h1>学习记录</h1>
      <p class="hint">输入 4 位家庭口令</p>

      <label class="sr-only" for="passcode">家庭口令</label>
      <input
        id="passcode"
        v-model="passcode"
        class="sr-only"
        type="password"
        inputmode="numeric"
        maxlength="64"
        autocomplete="current-password"
        aria-label="家庭口令"
      />

      <div class="dots" role="status" aria-label="已输入口令位数">
        <span v-for="index in 4" :key="index" :class="{ filled: passcode.length >= index }" />
      </div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>

      <div class="keypad">
        <button
          v-for="(key, index) in keys"
          :key="`${key}-${index}`"
          type="button"
          class="key"
          :class="{ ghost: !key, del: key === 'del' }"
          :disabled="!key || busy"
          :aria-label="key === 'del' ? '删除' : key ? `数字 ${key}` : undefined"
          @click="press(key)"
        >
          <svg v-if="key === 'del'" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
            <path d="M9 5h11v14H9l-5-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            <path d="m12 9 5 6M17 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          <template v-else>{{ key }}</template>
        </button>
      </div>

      <button type="button" class="enter" :disabled="!passcode || busy" @click="submit">
        {{ busy ? "进入中…" : "进入" }}
      </button>
      <p class="foot">连续输错会暂时锁定</p>
    </section>
  </main>
</template>

<style scoped>
.login {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: var(--space-5);
  background:
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 48%),
    radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 52%),
    var(--bg);
}

.card {
  width: min(380px, 100%);
  padding: var(--space-6) var(--space-5) var(--space-5);
  border: 1px solid var(--line);
  border-radius: 28px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow: var(--shadow-3);
  text-align: center;
  backdrop-filter: blur(20px);
}

.brand {
  display: grid;
  width: 56px;
  height: 56px;
  margin: 0 auto var(--space-4);
  place-items: center;
  border-radius: 18px;
  background: var(--primary);
  color: #fff;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--primary) 30%, transparent);
}

h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.hint {
  margin: var(--space-1) 0 var(--space-5);
  color: var(--muted);
  font-size: var(--text-sm);
}

.dots {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.dots span {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
  transition: background var(--duration-fast), border-color var(--duration-fast), transform var(--duration-fast);
}

.dots span.filled {
  border-color: var(--primary);
  background: var(--primary);
  transform: scale(1.08);
}

.error {
  margin: 0 0 var(--space-2);
  color: var(--danger);
  font-size: var(--text-xs);
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.key {
  display: grid;
  min-height: 56px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-numeric);
  font-size: 22px;
  font-weight: 500;
  transition: background var(--duration-fast), transform var(--duration-fast);
}

.key:active {
  transform: scale(0.96);
  background: var(--primary-soft);
}

.key.ghost {
  border-color: transparent;
  background: transparent;
  pointer-events: none;
}

.key.del {
  color: var(--muted);
}

.enter {
  width: 100%;
  min-height: 48px;
  margin-top: var(--space-3);
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--on-primary);
  font-size: var(--text-base);
  font-weight: 600;
  transition: opacity var(--duration-fast), transform var(--duration-fast);
}

.enter:active {
  transform: scale(0.98);
}

.enter:disabled {
  opacity: 0.4;
}

.foot {
  margin: var(--space-3) 0 0;
  color: var(--muted);
  font-size: 11px;
}
</style>
