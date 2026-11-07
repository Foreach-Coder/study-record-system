<script setup lang="ts">
import { onMounted, ref } from "vue";

interface Note {
  id: string;
  body: string;
  created_at: string;
}

const health = ref("未检查");
const r2 = ref("未测试");
const notes = ref<Note[]>([]);
const draft = ref("");
const busy = ref(false);

async function checkHealth() {
  busy.value = true;
  try {
    const res = await fetch("/api/health");
    health.value = JSON.stringify(await res.json(), null, 2);
  } catch (error) {
    health.value = String(error);
  } finally {
    busy.value = false;
  }
}

async function testR2() {
  busy.value = true;
  try {
    const res = await fetch("/api/r2", { method: "POST" });
    r2.value = JSON.stringify(await res.json(), null, 2);
  } catch (error) {
    r2.value = String(error);
  } finally {
    busy.value = false;
  }
}

async function loadNotes() {
  const res = await fetch("/api/notes");
  const data = (await res.json()) as { notes: Note[] };
  notes.value = data.notes;
}

async function addNote() {
  const body = draft.value.trim();
  if (!body) return;
  busy.value = true;
  try {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    draft.value = "";
    await loadNotes();
  } finally {
    busy.value = false;
  }
}

onMounted(loadNotes);
</script>

<template>
  <main>
    <p class="eyebrow">Cloudflare Spike</p>
    <h1>学习记录系统</h1>
    <p class="lede">Vue + Vite + Workers + D1 + R2，本地与线上同一套代码。</p>

    <section class="card">
      <h2>D1</h2>
      <button :disabled="busy" @click="checkHealth">检查 D1</button>
      <pre>{{ health }}</pre>

      <form class="note-form" @submit.prevent="addNote">
        <input v-model="draft" placeholder="写一条 D1 记录…" />
        <button :disabled="busy || !draft.trim()" type="submit">写入</button>
      </form>
      <ul class="notes">
        <li v-for="note in notes" :key="note.id">
          <span>{{ note.body }}</span>
          <time>{{ note.created_at }}</time>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>R2</h2>
      <button :disabled="busy" @click="testR2">测试 R2 写入/读取</button>
      <pre>{{ r2 }}</pre>
    </section>
  </main>
</template>
