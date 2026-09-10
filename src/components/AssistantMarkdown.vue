<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '../dsh/markdown.js'
import { formatAnswerChrome } from '../dsh/deliverables.js'
import ProducedFiles from './ProducedFiles.vue'
import MessageActions from './MessageActions.vue'

const props = defineProps({
  text: { type: String, default: '' },
  streaming: { type: Boolean, default: false },
  produced: { type: Array, default: () => [] },
  time: { type: Number, default: undefined },
  runMs: { type: Number, default: undefined },
  ttftMs: { type: Number, default: undefined },
  tokensPerSecond: { type: Number, default: undefined },
  interrupted: { type: Boolean, default: false },
  seq: { type: Number, default: undefined },
  canFork: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'fork'])

const html = computed(() => renderMarkdown(props.text, props.produced))
const chrome = computed(() => formatAnswerChrome(props))
const files = computed(() => (props.streaming ? [] : props.produced))

function onMarkdownClick(event) {
  const button = event.target.closest('.md-file')
  if (!button) return
  event.preventDefault()
  const path = button.getAttribute('data-file')
  if (path) emit('open', path)
}
</script>

<template>
  <div class="assistant" data-time-hover-root :data-streaming="streaming || undefined">
    <div class="markdown" v-html="html" @click="onMarkdownClick" />
    <ProducedFiles :paths="files" @open="emit('open', $event)" />
    <div v-if="interrupted" class="stopped">已停止</div>
    <MessageActions
      v-if="!streaming && canFork"
      :text="text"
      :chrome="chrome"
      :seq="seq"
      :can-fork="canFork"
      @fork="emit('fork', $event)"
    />
  </div>
</template>

<style scoped>
.assistant {
  font-size: 16px;
  line-height: 28px;
}

.markdown {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text);
}

.stopped {
  margin-top: 8px;
  font-size: 13px;
  color: var(--tertiary);
}

.markdown :deep(strong) { font-weight: 600; }

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  margin: 32px 0 16px;
  font-weight: 600;
  line-height: 1.35;
}

.markdown :deep(h1) { font-size: 22px; }
.markdown :deep(h2) { font-size: 18px; }
.markdown :deep(h3) { font-size: 16px; }

.markdown :deep(h4),
.markdown :deep(h5),
.markdown :deep(h6) {
  margin: 16px 0;
  font-size: 16px;
  font-weight: 600;
}

.markdown :deep(p) { margin: 16px 0; }

.markdown :deep(h4) + :deep(ul),
.markdown :deep(h4) + :deep(ol),
.markdown :deep(h5) + :deep(ul),
.markdown :deep(h5) + :deep(ol),
.markdown :deep(h6) + :deep(ul),
.markdown :deep(h6) + :deep(ol) {
  margin-top: 8px;
}

.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 16px 0;
  padding-left: 18px;
}

.markdown :deep(li:not(:first-child)) { margin-top: 6px; }
.markdown :deep(li > ul),
.markdown :deep(li > ol) { margin-top: 4px; }
.markdown :deep(li::marker) { color: var(--secondary); }

.markdown :deep(ul) ol,
.markdown :deep(ol) ol {
  list-style-position: inside;
  padding-left: 0;
}

.markdown :deep(li > p) { margin: 8px 0; }
.markdown :deep(li > *:first-child) { margin-top: 0; }
.markdown :deep(li > *:last-child) { margin-bottom: 0; }

.markdown :deep(a) {
  color: rgb(65, 118, 230);
  text-decoration: none;
}

.markdown :deep(a:hover) { text-decoration: underline; }

.markdown :deep(hr) {
  display: block;
  height: 1px;
  margin: 32px 0;
  border: none;
  background: rgba(0, 0, 0, 0.08);
}

.markdown :deep(blockquote) {
  margin: 16px 0 0;
  padding-left: 14px;
  border-left: 2px solid var(--caption);
  color: var(--secondary);
}

.markdown :deep(pre.md-code) {
  margin: 16px 0;
  padding: 12px 14px;
  overflow: auto;
  border-radius: 8px;
  background: var(--code-bg);
}

.markdown :deep(pre.md-code code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 20px;
  background: none;
  padding: 0;
}

.markdown :deep(:not(pre) > code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875em;
  background: var(--code-bg);
  border-radius: 6px;
  padding: 0 5px;
}

.markdown :deep(button.md-file) {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: rgb(65, 118, 230);
  text-decoration: none;
  cursor: pointer;
}

.markdown :deep(button.md-file:hover),
.markdown :deep(button.md-file:focus) {
  outline: none;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.markdown :deep(.md-table) {
  max-width: 100%;
  overflow-x: auto;
}

.markdown :deep(table) {
  border-collapse: collapse;
  width: max-content;
}

.markdown :deep(th),
.markdown :deep(td) {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  text-align: start;
  max-width: min(30vw, 320px);
}

.markdown :deep(th) { font-weight: 600; }

.markdown :deep(.md-image-alt) {
  color: var(--tertiary);
  font-style: italic;
}

.markdown :deep(> *:first-child),
.markdown :deep(p:first-child) { margin-top: 0; }

.markdown :deep(> *:last-child),
.markdown :deep(p:last-child) { margin-bottom: 0; }
</style>
