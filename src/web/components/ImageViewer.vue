<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

defineProps<{ src: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="backdrop" role="dialog" aria-label="查看图片" @click.self="$emit('close')">
    <button type="button" class="close" aria-label="关闭" @click="$emit('close')">×</button>
    <img :src="src" alt="" />
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 85%); display: grid; place-items: center; padding: 20px; }
img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
.close { position: fixed; top: 14px; right: 14px; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgb(255 255 255 / 15%); color: white; font-size: 24px; }
</style>
