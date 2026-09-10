<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { contextOccupancy, formatTokens } from '../dsh/stats.js'

const props = defineProps({
  pressure: { type: Object, default: null },
  breakdown: { type: Object, default: null },
})

const open = ref(false)
const root = ref(null)
const context = computed(() => contextOccupancy(props.pressure))
const CIRCUMFERENCE = 2 * Math.PI * 5.5

const segments = computed(() => {
  const ctx = context.value
  if (!ctx) return []
  const breakdown = props.breakdown
  const total = breakdown
    ? (breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens)
    : 0
  if (!breakdown || total === 0) return [{ key: 'total', width: ctx.percent, color: 'var(--meter-total, rgb(65, 118, 230))' }]
  return [
    { key: 'system', width: ctx.percent * breakdown.systemTokens / total, color: 'rgb(99, 102, 241)' },
    { key: 'tools', width: ctx.percent * breakdown.toolsTokens / total, color: 'rgb(16, 185, 129)' },
    { key: 'messages', width: ctx.percent * breakdown.messageTokens / total, color: 'rgb(65, 118, 230)' },
  ].filter((item) => item.width > 0)
})

function onDoc(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDoc))
onUnmounted(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <span v-if="context" ref="root" class="meter">
    <button
      type="button"
      class="trigger"
      :aria-label="`上下文已用 ${context.percent}%`"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <circle class="track" cx="7" cy="7" r="5.5" />
        <circle
          class="fill"
          cx="7"
          cy="7"
          r="5.5"
          :stroke-dasharray="`${CIRCUMFERENCE * context.percent / 100} ${CIRCUMFERENCE}`"
          transform="rotate(-90 7 7)"
        />
      </svg>
    </button>
    <div v-if="open" class="panel" role="dialog">
      <div class="header">
        <span>上下文已用</span>
        <strong>{{ context.percent }}%</strong>
        <span class="figures">~{{ formatTokens(context.usedTokens) }} / {{ formatTokens(context.contextWindow) }}</span>
      </div>
      <div class="bar">
        <div
          v-for="part in segments"
          :key="part.key"
          class="seg"
          :style="{ width: `${part.width}%`, background: part.color }"
        />
      </div>
      <dl v-if="breakdown" class="rows">
        <div class="row"><dt>系统提示词</dt><dd>~{{ formatTokens(breakdown.systemTokens) }}</dd></div>
        <div class="row"><dt>工具</dt><dd>~{{ formatTokens(breakdown.toolsTokens) }}</dd></div>
        <div class="row"><dt>对话消息</dt><dd>~{{ formatTokens(breakdown.messageTokens) }}</dd></div>
      </dl>
    </div>
  </span>
</template>

<style scoped>
.meter { position: relative; display: inline-flex; }

.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
}

.track {
  fill: none;
  stroke: rgba(0, 0, 0, 0.12);
  stroke-width: 2;
}

.fill {
  fill: none;
  stroke: rgb(65, 118, 230);
  stroke-width: 2;
  stroke-linecap: round;
}

.panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 9;
  width: 260px;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--secondary);
}

.header strong { color: var(--text); }

.figures { margin-left: auto; color: var(--tertiary); }

.bar {
  display: flex;
  height: 6px;
  margin: 10px 0;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.06);
}

.seg { height: 100%; }

.rows { margin: 0; }

.row {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--secondary);
}

dt, dd { margin: 0; }
</style>
