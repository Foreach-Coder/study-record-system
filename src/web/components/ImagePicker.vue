<script setup lang="ts">
import { computed, ref } from "vue";
import type { TaskImage } from "../../shared/schema";
import { api, ApiError } from "../api";

const images = defineModel<TaskImage[]>();
const emit = defineEmits<{ insert: [markdown: string] }>();
const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref("");
const list = computed(() => images.value ?? []);
const full = computed(() => list.value.length >= 20);

async function compress(file: File): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("无法压缩图片");
  return { file: new File([blob], "image.jpg", { type: "image/jpeg" }), width, height };
}

async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []);
  if (files.length === 0) return;
  busy.value = true;
  error.value = "";
  let failed = 0;
  for (const file of files.slice(0, Math.max(0, 20 - list.value.length))) {
    try {
      const compressed = await compress(file);
      const uploaded = await api.uploadImage(compressed.file, compressed.width, compressed.height);
      images.value = [...list.value, { url: uploaded.url, title: null }];
      emit("insert", `\n![图片](${uploaded.url})\n`);
    } catch (reason) {
      failed += 1;
      if (reason instanceof ApiError) error.value = reason.message;
    }
  }
  if (failed && !error.value) error.value = `${failed} 张图片上传失败`;
  busy.value = false;
  if (input.value) input.value.value = "";
}

function remove(index: number) {
  images.value = list.value.filter((_, i) => i !== index);
}
</script>

<template>
  <div class="picker">
    <div class="grid">
      <figure v-for="(image, index) in list" :key="image.url">
        <img :src="image.url" alt="已选图片" />
        <button type="button" class="remove" aria-label="删除图片" @click="remove(index)">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
            <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </button>
      </figure>
      <label class="add" :class="{ busy, full }">
        <input
          ref="input"
          type="file"
          aria-label="添加图片"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          :disabled="busy || full"
          @change="onFiles"
        />
        <svg v-if="!busy" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M4 8h4l1.5-2h5L16 8h4v11H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <circle cx="12" cy="13.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7" />
        </svg>
        <span>{{ busy ? "上传中" : full ? "已满 20 张" : "添加图片" }}</span>
      </label>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p class="hint">图片会直接插入正文；单张自动压缩到 1600px 内。</p>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  gap: var(--space-2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: var(--space-2);
}

figure {
  position: relative;
  aspect-ratio: 1;
  margin: 0;
}

img {
  width: 100%;
  height: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  object-fit: cover;
}

.remove {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
}

.add {
  display: flex;
  aspect-ratio: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 10px;
  cursor: pointer;
  transition: border-color var(--duration-fast), color var(--duration-fast);
}

.add:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.add.busy,
.add.full {
  opacity: 0.6;
  pointer-events: none;
}

.add input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-xs);
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
}
</style>
