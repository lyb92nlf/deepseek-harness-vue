<script setup>
import { computed, ref } from 'vue'
import {
  CHAT_SEARCH_MAX_LINES,
  headTailCap,
  searchCopyText,
  searchRows,
  searchSummaryText,
} from '../dsh/search.js'

const props = defineProps({
  card: { type: Object, required: true },
})

const emit = defineEmits(['open'])

function openPath(path, event) {
  event.stopPropagation()
  emit('open', path)
}

const expanded = ref(false)
const copied = ref(false)
const collapsed = ref({})

const rows = computed(() => searchRows(props.card, collapsed.value))
const summary = computed(() => searchSummaryText(props.card))
const empty = computed(() => rows.value.length === 0)

const visible = computed(() => {
  const list = rows.value
  const { hidden, capped, headLines, tailLines } = headTailCap(list.length, CHAT_SEARCH_MAX_LINES, expanded.value)
  const head = capped ? list.slice(0, headLines) : list
  const naturalTail = capped ? list.slice(list.length - tailLines) : []
  const tailLead = naturalTail[0]
  const tailHeader = tailLead?.type === 'match'
    && !head.some((row) => row.type === 'file' && row.index === tailLead.fileIndex)
    ? list.find((row) => row.type === 'file' && row.index === tailLead.fileIndex)
    : undefined
  const tail = tailHeader === undefined ? naturalTail : naturalTail.slice(1)
  return { hidden, head, tail, tailHeader }
})

function rowKey(row) {
  if (row.type === 'match') return `match:${row.key}`
  if (row.type === 'file') return `file:${row.index}`
  return `path:${row.path}`
}

function toggleRest() {
  expanded.value = !expanded.value
}

function toggleFile(index) {
  collapsed.value = { ...collapsed.value, [index]: !collapsed.value[index] }
}

async function copy() {
  const text = searchCopyText(props.card)
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
  <div class="wrap">
    <div class="block" :data-search="card.kind">
      <div class="header">
        <span class="summary">{{ summary }}</span>
        <button v-if="!empty" type="button" class="copy" @click.stop="copy">
          {{ copied ? '复制成功' : '复制' }}
        </button>
      </div>
      <div v-if="empty" class="empty">无结果</div>
      <div v-else class="body">
        <template v-for="row in visible.head" :key="rowKey(row)">
        <button
          v-if="row.type === 'file'"
          type="button"
          class="file-header"
          :aria-expanded="!row.collapsed"
          @click.stop="toggleFile(row.index)"
        >
          <span class="file-path" @click="openPath(row.path, $event)">{{ row.path }}</span>
          <span class="file-count">{{ row.count }}</span>
        </button>
        <div v-else-if="row.type === 'match'" class="line">
          <span class="line-number">{{ row.lineNumber }}: </span>{{ row.line }}
        </div>
        <button v-else type="button" class="line file-link" @click="openPath(row.path, $event)">{{ row.path }}</button>
      </template>

      <button
        v-if="visible.hidden > 0"
        type="button"
        class="expand"
        :aria-expanded="expanded"
        :aria-label="expanded ? '收起结果' : `展开其余 ${visible.hidden} 行结果`"
        @click.stop="toggleRest"
      >
        {{ expanded ? '收起' : `… 其余 ${visible.hidden} 行` }}
      </button>

      <button
        v-if="visible.tailHeader"
        type="button"
        class="file-header"
        :aria-expanded="!visible.tailHeader.collapsed"
        @click.stop="toggleFile(visible.tailHeader.index)"
      >
        <span class="file-path" @click="openPath(visible.tailHeader.path, $event)">{{ visible.tailHeader.path }}</span>
        <span class="file-count">{{ visible.tailHeader.count }}</span>
      </button>

      <template v-for="row in visible.tail" :key="`tail:${rowKey(row)}`">
        <button
          v-if="row.type === 'file'"
          type="button"
          class="file-header"
          :aria-expanded="!row.collapsed"
          @click.stop="toggleFile(row.index)"
        >
          <span class="file-path" @click="openPath(row.path, $event)">{{ row.path }}</span>
          <span class="file-count">{{ row.count }}</span>
        </button>
        <div v-else-if="row.type === 'match'" class="line">
          <span class="line-number">{{ row.lineNumber }}: </span>{{ row.line }}
        </div>
        <button v-else type="button" class="line file-link" @click="openPath(row.path, $event)">{{ row.path }}</button>
        </template>
      </div>
    </div>
    <div v-if="card.recovery" class="recovery">{{ card.recovery }}</div>
  </div>
</template>

<style scoped>
.wrap { min-width: 0; }

.block {
  margin: 4px 0 4px 4px;
  color: var(--text);
  background: var(--code-bg);
  border-radius: 12px;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  background: var(--code-banner);
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}

.summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
  color: var(--secondary);
}

.copy {
  flex: none;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  font-size: 13px;
  line-height: 18px;
}

.body {
  padding: 8px 14px 12px 0;
  overflow-x: auto;
  overflow-y: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 22px;
}

.line {
  min-height: 22px;
  padding-left: 14px;
  white-space: pre;
}

.line-number { color: var(--tertiary); }

.file-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  min-height: 22px;
  padding: 0 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.file-path {
  min-width: 0;
  font-weight: 600;
  color: var(--text);
  white-space: pre;
  text-decoration: underline;
  text-decoration-color: var(--caption);
  text-underline-offset: 2px;
  cursor: pointer;
}

.file-path:hover { text-decoration-color: currentColor; }

.file-link {
  display: block;
  width: 100%;
  margin: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--caption);
  text-underline-offset: 2px;
  cursor: pointer;
}

.file-link:hover { text-decoration-color: currentColor; }

.file-count {
  flex: none;
  color: var(--tertiary);
}

.expand {
  display: block;
  width: 100%;
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--tertiary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.expand:hover { color: var(--secondary); }

.empty {
  padding: 12px 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--tertiary);
}

.recovery {
  margin: 4px 0 4px 4px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 18px;
  color: var(--tertiary);
}
</style>
