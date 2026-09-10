<script setup>
import { sessionLabel, relativeTime } from '../dsh/sessions.js'

defineProps({
  item: { type: Object, required: true },
  currentId: { type: String, default: '' },
  now: { type: Number, required: true },
  menuOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'menu', 'rename', 'fork', 'archive'])
</script>

<template>
  <div
    class="wrap"
    :data-active="item.sessionId === currentId || undefined"
    :data-menu="menuOpen || undefined"
  >
    <button
      type="button"
      class="row"
      :style="{ paddingLeft: `${12 + (item.depth ?? 0) * 16}px` }"
      @click="emit('select', item.sessionId)"
    >
      <span class="name">{{ sessionLabel(item) }}</span>
      <span class="meta">
        <span v-if="item.running" class="dot" />
        <span class="time">{{ relativeTime(item.updatedAt ?? 0, now) }}</span>
      </span>
    </button>
    <button
      type="button"
      class="more"
      aria-label="会话操作"
      :aria-expanded="menuOpen"
      @click.stop="emit('menu', item.sessionId)"
    >⋯</button>
    <div v-if="menuOpen" class="menu" @click.stop>
      <button type="button" @click="emit('rename', item)">重命名</button>
      <button type="button" @click="emit('fork', item.sessionId)">分叉会话</button>
      <button type="button" @click="emit('archive', item.sessionId)">归档会话</button>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  display: flex;
  align-items: stretch;
}

.wrap:hover,
.wrap[data-active],
.wrap[data-menu] { background: rgba(0, 0, 0, 0.04); }

.wrap[data-active] { background: rgb(237, 243, 254); }

.row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 8px 4px 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.more {
  flex: none;
  width: 28px;
  margin: 6px 6px 6px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tertiary);
  cursor: pointer;
  opacity: 0;
}

.wrap:hover .more,
.wrap[data-active] .more,
.wrap[data-menu] .more { opacity: 1; }

.more:hover { background: rgba(0, 0, 0, 0.06); }

.menu {
  position: absolute;
  top: 32px;
  right: 8px;
  z-index: 8;
  min-width: 140px;
  padding: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.menu button {
  display: block;
  width: 100%;
  height: 32px;
  margin: 0;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.menu button:hover { background: rgba(0, 0, 0, 0.04); }

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 20px;
  color: var(--text);
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--tertiary);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(34, 197, 94);
}
</style>
