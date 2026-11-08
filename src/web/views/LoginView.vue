<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api, ApiError } from "../api";
import { store } from "../stores/app";

const passcode = ref("");
const error = ref("");
const busy = ref(false);
const router = useRouter();

async function submit() {
  if (!passcode.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await api.login(passcode.value);
    store.sessionChecked = true;
    await router.replace("/today");
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : "登录失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="login">
    <section class="card">
      <p class="eyebrow">学习记录系统</p>
      <h1>今天，也一起记下来</h1>
      <p class="hint">输入家庭口令。连续输错会暂时锁定。</p>
      <form @submit.prevent="submit">
        <label for="passcode">家庭口令</label>
        <input id="passcode" v-model="passcode" type="password" autocomplete="current-password" enterkeyhint="go" />
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <button type="submit" :disabled="busy">{{ busy ? "进入中…" : "进入" }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at 20% 0%, var(--accent-soft), transparent 60%), var(--bg); }
.card { width: min(420px, 100%); background: var(--surface); border: 1px solid var(--line); border-radius: calc(var(--radius) + 8px); padding: 32px; box-shadow: var(--shadow); }
.eyebrow { margin: 0 0 12px; color: var(--accent); font-size: 13px; letter-spacing: .18em; text-transform: uppercase; }
h1 { margin: 0 0 8px; font-size: clamp(24px, 6vw, 34px); line-height: 1.15; }
.hint { margin: 0 0 24px; color: var(--muted); }
label { display: block; font-size: 14px; margin-bottom: 8px; }
input { width: 100%; min-height: var(--tap); border: 1px solid var(--line); border-radius: 12px; background: var(--bg); padding: 10px 14px; }
input:focus { outline: 3px solid var(--accent-soft); border-color: var(--accent); }
.error { color: var(--danger); margin: 10px 0 0; }
button { width: 100%; min-height: var(--tap); margin-top: 18px; border: 0; border-radius: 12px; background: var(--accent); color: white; font-weight: 600; }
button:disabled { opacity: .6; }
</style>
