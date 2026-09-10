<script setup>
import { computed, ref } from 'vue'
import { todoProgress } from '../dsh/markdown.js'

const props = defineProps({
  todos: { type: Array, default: () => [] },
})

const collapsed = ref(true)
const progress = computed(() => todoProgress(props.todos))
</script>

<template>
  <section v-if="todos.length" class="todo" aria-label="任务">
    <button type="button" class="header" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      <span class="lead" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2" />
          <path d="M4 7.1 6.1 9.2 10 4.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="title">任务</span>
      <span class="progress">{{ progress }}</span>
      <span class="chevron" :data-open="!collapsed || undefined">▾</span>
    </button>
    <ul v-if="!collapsed" class="list">
      <li v-for="item in todos" :key="item.content" class="item" :data-status="item.status">
        <span class="glyph" aria-hidden>
          <svg v-if="item.status === 'completed'" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.4" stroke="currentColor" stroke-width="1.2" />
            <path d="M10.96 5.71 7.7 8.98a3.3 3.3 0 0 1-1.34.92 1.6 1.6 0 0 1-.47 0 1.6 1.6 0 0 1-.81-.35A3.3 3.3 0 0 1 4.55 8.98L3.04 7.46l.93-.93 1.51 1.51c.24.24.39.39.5.48l.18.08.18-.08c.12-.09.26-.24.5-.48l3.26-3.26.93.93Z" fill="currentColor" />
          </svg>
          <svg v-else-if="item.status === 'in_progress'" class="spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.4" stroke="currentColor" stroke-width="1.2" stroke-dasharray="28 12" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.4" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2.4 2.4" />
          </svg>
        </span>
        <span class="content">{{ item.content }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.todo {
  box-sizing: border-box;
  width: calc(100% - 32px);
  max-width: 736px;
  margin: 0 auto 8px;
  padding: 6px 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: rgb(249, 250, 251);
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.lead,
.chevron {
  display: grid;
  place-items: center;
  color: var(--tertiary);
  font-size: 12px;
}

.chevron[data-open] { transform: rotate(180deg); }

.title {
  flex: none;
  font-size: 13px;
  line-height: 24px;
  font-weight: 500;
}

.progress {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--tertiary);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  margin: 8px 0 2px;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--secondary);
}

.glyph {
  display: grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
}

.item[data-status='completed'] .glyph { color: rgb(22, 163, 74); }
.item[data-status='in_progress'] .glyph { color: rgb(65, 118, 230); }
.item[data-status='pending'] .glyph { color: var(--caption); }

.spin { animation: spin 1s linear infinite; }

.content {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
}
</style>
