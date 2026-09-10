<script setup>
import { computed, ref } from 'vue'
import { CHAT_CARD_MAX_LINES, headTailCap } from '../dsh/cap.js'

const props = defineProps({
  card: { type: Object, required: true },
  filePath: { type: String, default: '' },
})

const emit = defineEmits(['open'])

const openPath = computed(() => props.filePath || props.card.path || '')

const expanded = ref(false)
const copied = ref(false)

const windowed = computed(() => props.card.lines.length < props.card.totalLines)
const raw = computed(() => props.card.lines.map((line) => line.text).join('\n'))

const visible = computed(() => {
  const lines = props.card.lines
  const { hidden, capped, headLines, tailLines } = headTailCap(lines.length, CHAT_CARD_MAX_LINES, expanded.value)
  return {
    hidden,
    head: capped ? lines.slice(0, headLines) : lines,
    tail: capped ? lines.slice(lines.length - tailLines) : [],
  }
})

function toggleRest() {
  expanded.value = !expanded.value
}

async function copy() {
  if (!raw.value) return
  try {
    await navigator.clipboard.writeText(raw.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="block">
    <div class="banner">
      <button
        v-if="openPath"
        type="button"
        class="label file-link"
        @click.stop="emit('open', openPath)"
      >{{ card.label }}</button>
      <div v-else class="label">{{ card.label }}</div>
      <div class="action">
        <span v-if="windowed" class="count">显示 {{ card.lines.length }} / {{ card.totalLines }} 行</span>
        <span v-if="card.lang" class="lang">{{ card.lang }}</span>
        <button v-if="card.lines.length > 0" type="button" class="copy" @click.stop="copy">
          {{ copied ? '复制成功' : '复制' }}
        </button>
      </div>
    </div>
    <div class="body">
      <div v-for="line in visible.head" :key="`h:${line.number}`" class="line">
        <span class="gutter">{{ line.number }}</span>
        <span class="content">{{ line.text }}</span>
      </div>
      <button
        v-if="visible.hidden > 0"
        type="button"
        class="expand"
        :aria-expanded="expanded"
        :aria-label="expanded ? '收起内容' : `展开其余 ${visible.hidden} 行`"
        @click.stop="toggleRest"
      >
        {{ expanded ? '收起' : `… 其余 ${visible.hidden} 行` }}
      </button>
      <div v-for="line in visible.tail" :key="`t:${line.number}`" class="line">
        <span class="gutter">{{ line.number }}</span>
        <span class="content">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block {
  margin: 4px 0 4px 4px;
  background: var(--code-bg);
  border-radius: 12px;
  overflow: hidden;
}

.banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  background: var(--code-banner);
}

.label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
}

.file-link {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--caption);
  text-underline-offset: 2px;
  cursor: pointer;
}

.file-link:hover { text-decoration-color: currentColor; }

.action {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
}

.count,
.lang,
.copy {
  color: var(--tertiary);
  font-size: 13px;
  line-height: 18px;
}

.lang {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.copy {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
}

.body {
  padding: 12px 0;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.line {
  display: flex;
  min-height: 22px;
  line-height: 22px;
  white-space: pre;
}

.gutter {
  flex: none;
  width: 48px;
  padding-right: 14px;
  text-align: right;
  color: var(--tertiary);
  user-select: none;
}

.content { color: var(--text); }

.expand {
  display: block;
  width: 100%;
  padding: 0 0 0 48px;
  border: none;
  background: transparent;
  color: var(--tertiary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.expand:hover { color: var(--secondary); }
</style>
