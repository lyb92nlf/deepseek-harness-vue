<script setup>
import { computed } from 'vue'
import { basename } from '../dsh/deliverables.js'

const SHOWN_LIMIT = 6

const props = defineProps({
  paths: { type: Array, default: () => [] },
})

const emit = defineEmits(['open'])

const shown = computed(() => props.paths.slice(0, SHOWN_LIMIT))
const hidden = computed(() => Math.max(0, props.paths.length - shown.value.length))
const moreLabel = computed(() => (
  hidden.value === 1 ? '+ 1 个文件' : `+ ${hidden.value} 个文件`
))
</script>

<template>
  <div v-if="paths.length" class="produced">
    <span class="label">产物</span>
    <div class="row">
      <button
        v-for="path in shown"
        :key="path"
        type="button"
        class="file"
        :title="path"
        @click="emit('open', path)"
      >{{ basename(path) }}</button>
      <span v-if="hidden > 0" class="more">{{ moreLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.produced {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  margin-top: 16px;
  font-size: 13px;
  line-height: 22px;
}

.label {
  color: var(--tertiary);
}

.row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.file {
  flex: 0 0 auto;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: rgb(244, 245, 247);
  color: var(--secondary);
  font: inherit;
  cursor: pointer;
}

.file:hover {
  color: var(--text);
  text-decoration: underline;
}

.more {
  flex: 0 0 auto;
  white-space: nowrap;
  color: var(--tertiary);
}
</style>
