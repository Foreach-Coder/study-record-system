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
  try {
    for (const file of files.slice(0, 20 - list.value.length)) {
      const compressed = await compress(file);
      const uploaded = await api.uploadImage(compressed.file, compressed.width, compressed.height);
      images.value = [...list.value, { url: uploaded.url, title: null }];
      emit("insert", `\n![图片](${uploaded.url})\n`);
    }
  } catch (reason) {
    error.value = reason instanceof ApiError ? reason.message : "图片上传失败";
  } finally {
    busy.value = false;
    if (input.value) input.value.value = "";
  }
}

function remove(index: number) {
  images.value = list.value.filter((_, i) => i !== index);
}
</script>

<template>
  <div class="picker">
    <label class="add" :class="{ busy }">
      <input
        ref="input"
        type="file"
        aria-label="图片"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        @change="onFiles"
      />
      <span>{{ busy ? "上传中…" : "添加图片" }}</span>
    </label>
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="list.length" class="thumbs">
      <figure v-for="(image, index) in list" :key="image.url">
        <img :src="image.url" alt="已选图片" />
        <button type="button" aria-label="删除图片" @click="remove(index)">×</button>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.add { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 12px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); cursor: pointer; }
.add input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.add.busy { opacity: .6; }
.error { color: var(--danger); font-size: 13px; }
.thumbs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
figure { position: relative; margin: 0; }
img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
figure button { position: absolute; top: -6px; right: -6px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: var(--danger); color: white; }
</style>
