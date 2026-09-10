<script setup>
import { computed } from 'vue'
import { statsLine } from '../dsh/stats.js'

const props = defineProps({
  stats: { type: Object, default: null },
  usage: { type: Object, default: null },
})

const line = computed(() => statsLine(props.stats, props.usage))
</script>

<template>
  <div v-if="line" class="stats" :title="line">{{ line }}</div>
</template>

<style scoped>
.stats {
  max-width: 736px;
  width: 100%;
  margin: 0 auto;
  padding: 0 16px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  color: var(--caption);
}
</style>
