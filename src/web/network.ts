import { reactive } from "vue";

export const network = reactive({
  pending: 0,
  visible: false,
});

let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function beginRequest(): void {
  network.pending += 1;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  if (network.visible || showTimer) return;
  showTimer = setTimeout(() => {
    showTimer = undefined;
    if (network.pending > 0) network.visible = true;
  }, 180);
}

export function endRequest(): void {
  network.pending = Math.max(0, network.pending - 1);
  if (network.pending > 0) return;

  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = undefined;
  }
  if (!network.visible) return;

  hideTimer = setTimeout(() => {
    hideTimer = undefined;
    if (network.pending === 0) network.visible = false;
  }, 220);
}
