<script setup>
import { computed, ref } from 'vue'
import { CHAT_CARD_MAX_LINES, headTailCap } from '../dsh/cap.js'

const props = defineProps({
  card: { type: Object, required: true },
})

const emit = defineEmits(['open'])

const expanded = ref(false)
const copied = ref(false)

function contentLines(text) {
  if (!text) return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

const built = computed(() => {
  const rows = []
  const paths = new Set()
  let added = 0
  let removed = 0
  let prevPath
  for (const diff of props.card.diffs) {
    paths.add(diff.path)
    if (diff.path !== prevPath) rows.push({ kind: 'path', text: diff.path })
    else rows.push({ kind: 'gap', text: '⋯' })
    prevPath = diff.path
    if (diff.oldText !== null) {
      for (const line of contentLines(diff.oldText)) {
        rows.push({ kind: 'del', text: line })
        removed += 1
      }
    }
    for (const line of contentLines(diff.newText)) {
      rows.push({ kind: 'add', text: line })
      added += 1
    }
  }
  return { rows, added, removed, files: paths.size }
})

const visible = computed(() => {
  const rows = built.value.rows
  const { hidden, capped, headLines, tailLines } = headTailCap(rows.length, CHAT_CARD_MAX_LINES, expanded.value)
  return {
    hidden,
    head: capped ? rows.slice(0, headLines) : rows,
    tail: capped ? rows.slice(rows.length - tailLines) : [],
  }
})

function copyText() {
  return built.value.rows.map((row) => {
    if (row.kind === 'del') return `- ${row.text}`
    if (row.kind === 'add') return `+ ${row.text}`
    return row.text
  }).join('\n')
}

function toggleRest() {
  expanded.value = !expanded.value
}

async function copy() {
  const text = copyText()
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
  <div v-if="built.rows.length" class="block">
    <button type="button" class="copy" @click.stop="copy">
      {{ copied ? '复制成功' : '复制' }}
    </button>
    <div class="body">
      <template v-for="(row, index) in visible.head" :key="`h:${index}`">
        <button
          v-if="row.kind === 'path'"
          type="button"
          class="line path-link"
          data-kind="path"
          @click.stop="emit('open', row.text)"
        >{{ row.text }}</button>
        <div v-else class="line" :data-kind="row.kind">{{ row.text }}</div>
      </template>
      <button
        v-if="visible.hidden > 0"
        type="button"
        class="expand"
        :aria-expanded="expanded"
        :aria-label="expanded ? '收起差异' : `展开其余 ${visible.hidden} 行差异`"
        @click.stop="toggleRest"
      >
        {{ expanded ? '收起' : `… 其余 ${visible.hidden} 行` }}
      </button>
      <template v-for="(row, index) in visible.tail" :key="`t:${index}`">
        <button
          v-if="row.kind === 'path'"
          type="button"
          class="line path-link"
          data-kind="path"
          @click.stop="emit('open', row.text)"
        >{{ row.text }}</button>
        <div v-else class="line" :data-kind="row.kind">{{ row.text }}</div>
      </template>
    </div>
    <div class="footer">└ +{{ built.added }} -{{ built.removed }} · {{ built.files }} file{{ built.files === 1 ? '' : 's' }}</div>
  </div>
</template>

<style scoped>
.block {
  position: relative;
  margin: 4px 0 4px 4px;
  background: var(--code-bg);
  border-radius: 12px;
}

.copy {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 1;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  font-size: 13px;
}

.body {
  padding: 12px 14px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.line {
  min-height: 22px;
  line-height: 22px;
  white-space: pre;
}

.line[data-kind='path'],
.path-link {
  font-weight: 600;
  padding-right: 56px;
}

.path-link {
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

.path-link:hover { text-decoration-color: currentColor; }

.line[data-kind='gap'] { color: var(--tertiary); }

.line[data-kind='del']::before { content: '- '; color: var(--error); }
.line[data-kind='del'] { color: var(--error); }

.line[data-kind='add']::before { content: '+ '; color: var(--success); }
.line[data-kind='add'] { color: var(--success); }

.expand {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--tertiary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.expand:hover { color: var(--secondary); }

.footer {
  padding: 0 14px 10px;
  font-size: 12px;
  color: var(--tertiary);
}
</style>
