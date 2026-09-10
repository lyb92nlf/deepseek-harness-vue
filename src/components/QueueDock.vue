<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['remove'])

const visible = computed(() => (
  props.items.filter((item) => item.placement === 'queued' || item.placement === 'steering')
))

function label(item) {
  const content = item.message?.content
  if (!Array.isArray(content)) return '排队消息'
  const text = content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim()
  return text || '排队消息'
}
</script>

<template>
  <div v-if="visible.length" class="dock">
    <div class="count">{{ visible.length }} 条排队消息</div>
    <div v-for="item in visible" :key="item.id" class="row">
      <span class="text" :data-steer="item.placement === 'steering' || undefined">{{ label(item) }}</span>
      <button type="button" class="remove" @click="emit('remove', item.id)">删除</button>
    </div>
  </div>
</template>

<style scoped>
.dock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px 8px;
  max-width: 736px;
  width: 100%;
  margin: 0 auto;
}

.count {
  font-size: 12px;
  color: var(--tertiary);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--secondary);
}

.text[data-steer] { color: rgb(65, 118, 230); }

.remove {
  flex: none;
  margin: 0;
  padding: 0 8px;
  height: 24px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--tertiary);
  cursor: pointer;
}

.remove:hover { color: var(--error); }
</style>
