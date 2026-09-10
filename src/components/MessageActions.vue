<script setup>
import { ref } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  seq: { type: Number, default: undefined },
  canFork: { type: Boolean, default: false },
})

const emit = defineEmits(['fork'])
const copied = ref(false)
let timer

async function copy() {
  if (!props.text || copied.value) return
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => { copied.value = false }, 1000)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="actions">
    <button type="button" :aria-label="copied ? '已复制' : '复制'" @click="copy">{{ copied ? '已复制' : '复制' }}</button>
    <button
      v-if="canFork && seq != null"
      type="button"
      aria-label="在新对话中分支"
      @click="emit('fork', seq)"
    >分叉</button>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

button {
  margin: 0;
  padding: 0 8px;
  height: 24px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--tertiary);
  font-size: 12px;
  cursor: pointer;
}

button:hover { color: var(--secondary); background: rgba(0, 0, 0, 0.04); }
</style>
