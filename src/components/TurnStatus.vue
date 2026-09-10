<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatRunDuration } from '../dsh/deliverables.js'

const props = defineProps({
  startTime: { type: Number, default: null },
})

const mountedAt = Date.now()
const now = ref(Date.now())
let timer

onMounted(() => {
  timer = window.setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (timer != null) window.clearInterval(timer)
})
watch(() => props.startTime, () => { now.value = Date.now() })

const elapsedMs = computed(() => Math.max(0, now.value - (props.startTime ?? mountedAt)))
const showClock = computed(() => elapsedMs.value >= 15_000)
</script>

<template>
  <div class="turn-status" role="status" aria-live="polite">
    Loading ...
    <span v-if="showClock" class="clock" aria-hidden="true">{{ formatRunDuration(elapsedMs) }}</span>
  </div>
</template>

<style scoped>
.turn-status {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  height: 26px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  background: linear-gradient(
    90deg,
    rgb(65, 118, 230) 0%,
    rgb(65, 118, 230) 40%,
    rgb(186, 208, 255) 50%,
    rgb(65, 118, 230) 60%,
    rgb(65, 118, 230) 100%
  );
  background-position: 100% 0;
  background-size: 250% 100%;
  background-clip: text;
  color: transparent;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 1.8s linear infinite;
}

.clock {
  margin-left: 8px;
  font-size: 13px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--caption);
  -webkit-text-fill-color: var(--caption);
}

@keyframes shimmer {
  to { background-position: 0 0; }
}

@media (prefers-reduced-motion: reduce) {
  .turn-status {
    background-position: 0 0;
    background-size: 100% 100%;
    animation: none;
  }
}
</style>
