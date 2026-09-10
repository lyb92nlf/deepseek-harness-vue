<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  card: { type: Object, required: true },
})

const copied = ref(false)

const lines = computed(() => {
  const text = props.card.output ?? ''
  if (text === '') return []
  const parsed = text.split('\n')
  if (parsed[parsed.length - 1] === '') parsed.pop()
  return parsed
})

const status = computed(() => {
  if (props.card.running) return ''
  if (props.card.signal) return `信号 ${props.card.signal}`
  if (props.card.exitCode !== undefined && props.card.exitCode !== 0) return `退出码 ${props.card.exitCode}`
  return ''
})

const failed = computed(() => Boolean(status.value))

async function copy() {
  const text = props.card.output ?? ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="block" :data-running="card.running || undefined" :data-failed="failed || undefined">
    <div class="header">
      <div class="prompt">
        <span class="dot" :data-state="card.running ? 'run' : failed ? 'err' : 'ok'" />
        <span class="cmd">
          <span v-if="card.cwd" class="cwd">{{ card.cwd }}</span>
          <span class="dollar">$</span>
          <span class="command">{{ card.command }}</span>
        </span>
      </div>
      <div class="action">
        <span v-if="status" class="pill">{{ status }}</span>
        <button v-if="!card.running && (card.output ?? '') !== ''" type="button" class="copy" @click.stop="copy">
          {{ copied ? '复制成功' : '复制' }}
        </button>
      </div>
    </div>
    <div v-if="!card.running" class="body">
      <div v-if="lines.length === 0" class="empty">无输出</div>
      <div v-for="(line, index) in lines" :key="index" class="line">{{ line }}</div>
    </div>
  </div>
</template>

<style scoped>
.block {
  margin: 4px 0 4px 4px;
  padding-left: 30px;
  background: var(--code-bg);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-left: -30px;
  padding: 9px 14px 9px 30px;
}

.block:not([data-running]) .header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.prompt {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  background: rgb(34, 197, 94);
}

.dot[data-state='run'] {
  background: transparent;
  border: 1.5px solid var(--tertiary);
  animation: pulse 1s ease-in-out infinite;
}

.dot[data-state='err'] { background: var(--error); }

@keyframes pulse {
  50% { opacity: 0.35; }
}

.cmd {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 22px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cwd { color: var(--tertiary); margin-right: 6px; }
.dollar { color: var(--secondary); margin-right: 6px; }
.command { color: var(--text); }

.action {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.pill {
  font-size: 11px;
  line-height: 18px;
  color: var(--error);
}

.copy {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  font-size: 13px;
}

.body {
  max-height: 224px;
  overflow: auto;
  padding: 8px 14px 12px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 22px;
}

.line { white-space: pre; min-height: 22px; }
.empty { color: var(--tertiary); }

@media (prefers-reduced-motion: reduce) {
  .dot[data-state='run'] { animation: none; }
}
</style>
