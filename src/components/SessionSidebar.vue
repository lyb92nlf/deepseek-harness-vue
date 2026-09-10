<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { sessionLabel } from '../dsh/sessions.js'
import SessionRow from './SessionRow.vue'

const COLLAPSED_LIMIT = 5

const props = defineProps({
  groups: { type: Array, default: () => [] },
  sessions: { type: Array, default: () => [] },
  groupBy: { type: String, default: 'workspace' },
  currentId: { type: String, default: '' },
})

const emit = defineEmits([
  'select', 'create', 'create-in', 'toggle-group', 'set-group-by',
  'rename', 'fork', 'archive',
])

const now = Date.now()
const menuId = ref('')
const overflowOpen = ref(new Set())
const renameTarget = ref(null)
const renameDraft = ref('')
const root = ref(null)

const shownByGroup = computed(() => {
  const map = {}
  for (const group of props.groups) {
    const open = overflowOpen.value.has(group.key) || group.sessions.length <= COLLAPSED_LIMIT
    map[group.key] = open ? group.sessions : group.sessions.slice(0, COLLAPSED_LIMIT)
  }
  return map
})

function closeMenu() {
  menuId.value = ''
}

function toggleMenu(id) {
  menuId.value = menuId.value === id ? '' : id
}

function toggleOverflow(key) {
  const next = new Set(overflowOpen.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  overflowOpen.value = next
}

function revealCurrent() {
  const next = new Set(overflowOpen.value)
  for (const group of props.groups) {
    const index = group.sessions.findIndex((item) => item.sessionId === props.currentId)
    if (index >= COLLAPSED_LIMIT) next.add(group.key)
  }
  overflowOpen.value = next
}

function startRename(item) {
  closeMenu()
  renameTarget.value = item
  renameDraft.value = sessionLabel(item)
}

function cancelRename() {
  renameTarget.value = null
  renameDraft.value = ''
}

function confirmRename() {
  const title = renameDraft.value.trim()
  const item = renameTarget.value
  if (!item || !title) return
  emit('rename', item.sessionId, title)
  cancelRename()
}

function onFork(id) {
  closeMenu()
  emit('fork', id)
}

function onArchive(id) {
  closeMenu()
  emit('archive', id)
}

function onDocMouseDown(event) {
  if (root.value && !root.value.contains(event.target)) closeMenu()
}

watch(() => [props.currentId, props.groups], revealCurrent, { immediate: true })

onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', onDocMouseDown))
</script>

<template>
  <aside ref="root" class="sidebar">
    <div class="side-top">
      <div class="side-title">{{ groupBy === 'workspace' ? '工作区' : '会话' }}</div>
      <button type="button" class="new" @click="emit('create')">新对话</button>
    </div>
    <div class="view">
      <button
        type="button"
        :data-active="groupBy === 'workspace' || undefined"
        @click="emit('set-group-by', 'workspace')"
      >按工作区</button>
      <button
        type="button"
        :data-active="groupBy === 'flat' || undefined"
        @click="emit('set-group-by', 'flat')"
      >单列表</button>
    </div>

    <div class="side-list">
    <template v-if="groupBy === 'workspace'">
      <div v-if="groups.length === 0" class="empty">暂无会话</div>
      <section v-for="group in groups" :key="group.key || 'ungrouped'" class="group">
        <div class="group-row" :data-current="group.containsCurrent || undefined">
          <button type="button" class="fold" @click="emit('toggle-group', group.key)">
            <span class="chevron" :data-open="group.expanded || undefined">▸</span>
            <span class="group-name">{{ group.label }}</span>
            <span class="count">{{ group.sessionCount }}</span>
          </button>
          <button
            type="button"
            class="plus"
            :title="group.workspaceId ? `在「${group.label}」中新建` : '新建未分组会话'"
            @click="emit('create-in', group.workspaceId)"
          >+</button>
        </div>
        <template v-if="group.expanded">
          <SessionRow
            v-for="item in shownByGroup[group.key]"
            :key="item.sessionId"
            :item="item"
            :current-id="currentId"
            :now="now"
            :menu-open="menuId === item.sessionId"
            @select="emit('select', $event)"
            @menu="toggleMenu"
            @rename="startRename"
            @fork="onFork"
            @archive="onArchive"
          />
          <button
            v-if="group.sessions.length > COLLAPSED_LIMIT"
            type="button"
            class="overflow"
            :aria-expanded="overflowOpen.has(group.key)"
            @click="toggleOverflow(group.key)"
          >
            {{ overflowOpen.has(group.key)
              ? '收起'
              : `展开其余 ${group.sessions.length - COLLAPSED_LIMIT} 个会话` }}
          </button>
        </template>
      </section>
    </template>

    <template v-else>
      <div v-if="sessions.length === 0" class="empty">暂无会话</div>
      <SessionRow
        v-for="item in sessions"
        :key="item.sessionId"
        :item="item"
        :current-id="currentId"
        :now="now"
        :menu-open="menuId === item.sessionId"
        @select="emit('select', $event)"
        @menu="toggleMenu"
        @rename="startRename"
        @fork="onFork"
        @archive="onArchive"
      />
    </template>
    </div>

    <div v-if="renameTarget" class="modal" @click.self="cancelRename">
      <div class="dialog">
        <div class="dialog-title">重命名会话</div>
        <input
          v-model="renameDraft"
          autofocus
          @keydown.enter.prevent="confirmRename"
          @keydown.esc.prevent="cancelRename"
        />
        <div class="dialog-actions">
          <button type="button" class="ghost" @click="cancelRename">取消</button>
          <button type="button" :disabled="!renameDraft.trim()" @click="confirmRename">确定</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  flex: none;
  width: 260px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: rgb(249, 250, 251);
}

.side-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.side-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 12px 8px;
}

.side-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--secondary);
}

.new {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: rgb(65, 118, 230);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.view {
  display: flex;
  gap: 4px;
  padding: 0 12px 8px;
}

.view button {
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--tertiary);
  font-size: 11px;
  cursor: pointer;
}

.view button[data-active] {
  background: rgb(237, 243, 254);
  color: rgb(65, 118, 230);
}

.empty {
  padding: 16px 12px;
  font-size: 13px;
  color: var(--tertiary);
}

.group { padding-bottom: 4px; }

.group-row {
  display: flex;
  align-items: center;
  padding: 0 4px 0 8px;
}

.fold {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0;
  padding: 0 4px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.chevron {
  width: 12px;
  color: var(--caption);
  font-size: 10px;
  transform: rotate(0deg);
}

.chevron[data-open] { transform: rotate(90deg); }

.group-row[data-current] .group-name { color: var(--text); }

.group-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--secondary);
}

.count {
  margin-left: auto;
  font-size: 11px;
  color: var(--caption);
}

.plus {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tertiary);
  cursor: pointer;
}

.plus:hover { background: rgba(0, 0, 0, 0.06); }

.overflow {
  display: block;
  width: calc(100% - 16px);
  height: 28px;
  margin: 2px 8px 6px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--secondary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.overflow:hover { background: rgba(0, 0, 0, 0.04); }

.modal {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 21, 0.32);
}

.dialog {
  width: calc(100% - 24px);
  padding: 16px;
  border-radius: 12px;
  background: #fff;
}

.dialog-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}

.dialog input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.dialog-actions button {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: rgb(65, 118, 230);
  color: #fff;
  cursor: pointer;
}

.dialog-actions .ghost {
  background: transparent;
  color: var(--secondary);
}

.dialog-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
