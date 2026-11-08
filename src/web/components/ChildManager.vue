<script setup lang="ts">
import { ref } from "vue";
import { api, ApiError } from "../api";
import { refresh, store } from "../stores/app";

const open = ref(false);
const nickname = ref("");
const error = ref("");

function show() {
  error.value = "";
  open.value = true;
}

function fail(reason: unknown) {
  error.value = reason instanceof ApiError ? reason.message : "操作失败，请重试";
}

async function add() {
  const value = nickname.value.trim();
  if (!value) return;
  error.value = "";
  try {
    await api.createChild({ nickname: value });
    nickname.value = "";
    await refresh();
  } catch (reason) {
    fail(reason);
  }
}

async function rename(id: string, current: string) {
  const next = window.prompt("新的昵称", current);
  if (!next || !next.trim() || next.trim() === current) return;
  error.value = "";
  try {
    await api.updateChild(id, { nickname: next.trim() });
    await refresh();
  } catch (reason) {
    fail(reason);
  }
}

async function remove(id: string) {
  if (!window.confirm("删除孩子后，记录会保留为孤儿。继续？")) return;
  error.value = "";
  try {
    await api.deleteChild(id);
    await refresh();
  } catch (reason) {
    fail(reason);
  }
}

defineExpose({ open: show });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @click.self="open = false">
      <section class="panel" role="dialog" aria-label="管理孩子">
        <header>
          <h2>管理孩子</h2>
          <button type="button" aria-label="关闭" @click="open = false">×</button>
        </header>
        <form class="add" @submit.prevent="add">
          <label>新孩子昵称<input v-model="nickname" /></label>
          <button type="submit">添加</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
        <ul>
          <li v-for="child in store.state?.children ?? []" :key="child.id">
            <span>{{ child.nickname }}</span>
            <button type="button" @click="rename(child.id, child.nickname)">改名</button>
            <button type="button" class="danger" @click="remove(child.id)">删除</button>
          </li>
        </ul>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / 35%); display: flex; align-items: flex-end; justify-content: center; }
.panel { width: min(560px, 100%); max-height: 80dvh; overflow: auto; background: var(--surface); border-radius: 18px 18px 0 0; padding: 18px; display: grid; gap: 14px; }
header { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-size: 18px; }
header button { border: 0; background: transparent; font-size: 22px; color: var(--muted); padding: 0 6px; }
.add { display: flex; gap: 8px; align-items: flex-end; }
.add label { flex: 1; display: grid; gap: 6px; color: var(--muted); font-size: 12px; }
.add input { min-height: 40px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); padding: 0 10px; }
.add button { min-height: 40px; border-radius: 10px; border: 1px solid var(--accent); background: var(--accent); color: white; padding: 0 16px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
li { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; }
li span { flex: 1; }
li button { min-height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--text); }
li .danger { background: var(--danger); border-color: var(--danger); color: white; }
.error { color: var(--danger); }
</style>
