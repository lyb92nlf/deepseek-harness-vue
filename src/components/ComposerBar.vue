<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { isFullAccess, modelTriggerLabel, permissionLabel } from '../dsh/labels.js'
import {
  commandLine, EMPTY_CATALOG, filterGroup, parseClaim, slashQuery,
} from '../dsh/commands.js'
import ContextMeter from './ContextMeter.vue'

const props = defineProps({
  draft: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  sending: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  permissions: { type: Object, default: null },
  models: { type: Object, default: null },
  images: { type: Array, default: () => [] },
  catalog: { type: Object, default: () => EMPTY_CATALOG },
  plan: { type: Object, default: null },
  pressure: { type: Object, default: null },
  breakdown: { type: Object, default: null },
  canImage: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:draft', 'send', 'stop', 'permission', 'model',
  'add-files', 'remove-image', 'exit-plan',
])

const permOpen = ref(false)
const modelOpen = ref(false)
const cmdOpen = ref(false)
const highlight = ref(0)
const fileInput = ref(null)
const inputEl = ref(null)
const confirmOpen = ref(false)
const acknowledged = ref(false)
const pendingFull = ref('')
const root = ref(null)

const permLabel = computed(() => {
  const value = props.permissions
  if (!value) return ''
  const current = value.options?.find((item) => item.value === value.currentValue)
  return permissionLabel(current ?? value.currentValue)
})

const modelLabel = computed(() => modelTriggerLabel(props.models))

const currentModelMeta = computed(() => {
  const current = props.models?.current
  if (!current) return null
  for (const group of props.models.groups ?? []) {
    if (group.id !== current.provider) continue
    const model = group.models?.find((item) => item.id === current.model)
    if (model) return { group, model }
  }
  return null
})

const effortChoices = computed(() => {
  const reasoning = currentModelMeta.value?.model?.reasoning
  if (!reasoning) return []
  const rows = []
  if (reasoning.defaultEffort === undefined) {
    rows.push({ key: 'default', effort: undefined, label: '默认' })
  }
  for (const item of reasoning.efforts ?? []) {
    rows.push({ key: item.id, effort: item.id, label: item.name, description: item.description })
  }
  return rows
})

const currentEffort = computed(() => {
  const model = currentModelMeta.value?.model
  return props.models?.current?.reasoningEffort ?? model?.reasoning?.defaultEffort
})

const planOn = computed(() => {
  const plan = props.plan
  if (!plan) return false
  return plan.pending ? !plan.active : plan.active
})

const claim = computed(() => parseClaim(props.draft, props.catalog))

const placeholder = computed(() => {
  if (claim.value) return ''
  return planOn.value ? '描述你的任务以生成计划' : '给智能体发消息'
})

const query = computed(() => slashQuery(props.draft))
const commandHits = computed(() => filterGroup(props.catalog.commands ?? [], query.value))
const skillHits = computed(() => filterGroup(props.catalog.skills ?? [], query.value))
const menuGroups = computed(() => [
  { source: 'command', title: '命令', items: commandHits.value },
  { source: 'skill', title: '技能', items: skillHits.value },
].filter((group) => cmdOpen.value || query.value !== null ? group.items.length > 0 : false))
const flatHits = computed(() => menuGroups.value.flatMap((group) => group.items))
const showCommands = computed(() => cmdOpen.value || query.value !== null)
const canSend = computed(() => props.draft.trim() !== '' || props.images.length > 0)

function closeMenus() {
  permOpen.value = false
  modelOpen.value = false
  cmdOpen.value = false
}

function onDocMouseDown(event) {
  if (root.value && !root.value.contains(event.target)) closeMenus()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
})

function choosePermission(value) {
  if (!props.permissions || value === props.permissions.currentValue) {
    permOpen.value = false
    return
  }
  permOpen.value = false
  if (isFullAccess(value)) {
    pendingFull.value = value
    acknowledged.value = false
    confirmOpen.value = true
    return
  }
  emit('permission', value)
}

function confirmFull() {
  if (!acknowledged.value || !pendingFull.value) return
  emit('permission', pendingFull.value)
  confirmOpen.value = false
  pendingFull.value = ''
  acknowledged.value = false
}

function cancelFull() {
  confirmOpen.value = false
  pendingFull.value = ''
  acknowledged.value = false
}

function chooseModel(provider, model) {
  modelOpen.value = false
  const current = props.models?.current
  if (current?.provider === provider && current?.model === model) return
  emit('model', { provider, model })
}

function chooseEffort(effort) {
  const current = props.models?.current
  if (!current) return
  modelOpen.value = false
  if ((current.reasoningEffort ?? currentModelMeta.value?.model?.reasoning?.defaultEffort) === effort) return
  emit('model', {
    provider: current.provider,
    model: current.model,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  })
}

function pickCommand(item) {
  cmdOpen.value = false
  if (item.action === 'model') {
    modelOpen.value = true
    permOpen.value = false
    emit('update:draft', '')
    return
  }
  const line = commandLine(item)
  emit('update:draft', line)
  if (!item.hint && item.source === 'command') {
    queueMicrotask(() => emit('send'))
  }
}

function toggleCommandMenu() {
  cmdOpen.value = !cmdOpen.value
  permOpen.value = false
  modelOpen.value = false
  highlight.value = 0
  if (cmdOpen.value && query.value === null && props.draft !== '' && !props.draft.startsWith('/')) {
    emit('update:draft', '/')
  }
}

function onDraftInput(value) {
  emit('update:draft', value)
  if (slashQuery(value) !== null) {
    cmdOpen.value = true
    highlight.value = 0
  } else if (!value.startsWith('/')) {
    cmdOpen.value = false
  }
}

function onComposerKeydown(event) {
  if (!showCommands.value || !flatHits.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    highlight.value = (highlight.value + 1) % flatHits.value.length
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlight.value = (highlight.value - 1 + flatHits.value.length) % flatHits.value.length
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cmdOpen.value = false
    return
  }
  if (event.key === 'Enter' && !event.shiftKey && showCommands.value) {
    event.preventDefault()
    const item = flatHits.value[highlight.value]
    if (item) pickCommand(item)
  }
}

function optionActive(item) {
  return flatHits.value[highlight.value] === item
}

function onPaste(event) {
  const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  emit('add-files', files)
}

function onDrop(event) {
  const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  emit('add-files', files)
}

function onPickFiles(event) {
  const files = [...(event.target.files ?? [])]
  event.target.value = ''
  if (files.length) emit('add-files', files)
}
</script>

<template>
  <form
    ref="root"
    class="composer"
    @submit.prevent="emit('send')"
    @dragover.prevent
    @drop="onDrop"
  >
    <div class="card" data-composer-card>
    <div v-if="images.length" class="thumbs">
      <div v-for="(image, index) in images" :key="image.preview" class="thumb">
        <img :src="image.preview" :alt="image.name" />
        <button type="button" class="x" @click="emit('remove-image', index)">×</button>
      </div>
    </div>
    <div class="field">
      <div v-if="claim" class="backdrop" aria-hidden>
        <span class="token">{{ claim.token }} </span>
        <span class="args">{{ claim.args }}</span>
        <span v-if="claim.showHint" class="ghost">{{ claim.hint }}</span>
      </div>
      <input
        ref="inputEl"
        :value="draft"
        :disabled="disabled"
        :placeholder="placeholder"
        :data-claimed="claim ? '' : undefined"
        @input="onDraftInput($event.target.value)"
        @keydown="onComposerKeydown"
        @paste="onPaste"
      />
      <div v-if="showCommands" class="slash" role="listbox" aria-label="触发候选建议">
        <template v-for="group in menuGroups" :key="group.source">
          <div class="group-title">{{ group.title }}</div>
          <button
            v-for="item in group.items"
            :key="`${group.source}:${item.name}`"
            type="button"
            class="slash-item"
            role="option"
            :aria-selected="optionActive(item)"
            :data-active="optionActive(item) || undefined"
            @mousedown.prevent="pickCommand(item)"
          >
            <span class="slash-name">{{ item.name }}</span>
            <span v-if="item.description" class="slash-desc">{{ item.description }}</span>
          </button>
        </template>
        <div v-if="!flatHits.length" class="empty">没有匹配的命令</div>
      </div>
    </div>
    <div class="tools">
      <button
        type="button"
        class="add"
        :disabled="disabled"
        aria-label="命令"
        aria-haspopup="listbox"
        :aria-expanded="showCommands"
        @mousedown.prevent
        @click="toggleCommandMenu"
      >+</button>
      <button
        v-if="canImage"
        type="button"
        class="chip"
        :disabled="disabled || sending"
        @click="fileInput?.click()"
      >图片</button>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden @change="onPickFiles" />
      <button
        v-if="planOn"
        type="button"
        class="chip plan"
        :disabled="disabled || sending || locked"
        title="退出计划模式"
        @click="emit('exit-plan')"
      >Plan ×</button>
      <div v-if="permissions" class="menu">
        <button
          type="button"
          class="chip"
          :disabled="disabled || sending"
          :title="permissions.options?.find((item) => item.value === permissions.currentValue)?.description"
          @click="permOpen = !permOpen; modelOpen = false"
        >
          {{ permLabel }}
          <span class="caret">▾</span>
        </button>
        <div v-if="permOpen" class="panel" role="menu">
          <button
            v-for="option in (permissions.options ?? []).filter((item) => item.value !== 'custom')"
            :key="option.value"
            type="button"
            class="option"
            :data-selected="option.value === permissions.currentValue || undefined"
            @click="choosePermission(option.value)"
          >
            <span>{{ permissionLabel(option) }}</span>
            <span v-if="option.description" class="hint">{{ option.description }}</span>
          </button>
        </div>
      </div>

      <div class="trailing">
      <div v-if="models" class="menu">
        <button
          type="button"
          class="chip"
          :disabled="disabled"
          :title="modelLabel"
          @click="modelOpen = !modelOpen; permOpen = false"
        >
          {{ modelLabel }}
          <span class="caret">▾</span>
        </button>
        <div v-if="modelOpen" class="panel model-panel" role="menu">
          <section v-for="group in (models.groups ?? [])" :key="group.id" class="group">
            <div class="group-title">{{ group.name }}</div>
            <button
              v-for="item in group.models"
              :key="item.id"
              type="button"
              class="option"
              :data-selected="models.current?.provider === group.id && models.current?.model === item.id || undefined"
              @click="chooseModel(group.id, item.id)"
            >
              <span>{{ item.name }}</span>
              <span v-if="item.description" class="hint">{{ item.description }}</span>
            </button>
          </section>
          <section v-if="effortChoices.length" class="group">
            <div class="group-title">推理强度</div>
            <button
              v-for="level in effortChoices"
              :key="level.key"
              type="button"
              class="option"
              :data-selected="currentEffort === level.effort || undefined"
              @click="chooseEffort(level.effort)"
            >
              <span>{{ level.label }}</span>
              <span v-if="level.description" class="hint">{{ level.description }}</span>
            </button>
          </section>
          <div v-if="!models.groups?.length" class="empty">暂无可用模型</div>
        </div>
      </div>

      <ContextMeter :pressure="pressure" :breakdown="breakdown" />
      <button
        v-if="running"
        type="button"
        class="stop"
        :disabled="sending"
        aria-label="停止生成"
        @click="emit('stop')"
      >停止</button>
      <button
        v-else
        type="submit"
        class="send"
        :disabled="disabled || sending || locked || !canSend"
        aria-label="发送消息"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 12.5V3.5M8 3.5L4 7.5M8 3.5L12 7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      </div>
    </div>
    </div>

    <div v-if="confirmOpen" class="modal" @click.self="cancelFull">
      <div class="dialog">
        <div class="dialog-title">确认启用 Full access？</div>
        <p>启用 Full access 后，agent 将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。</p>
        <label class="ack">
          <input v-model="acknowledged" type="checkbox" />
          我已了解风险，并愿意继续
        </label>
        <div class="dialog-actions">
          <button type="button" class="ghost" @click="cancelFull">取消</button>
          <button type="button" :disabled="!acknowledged" @click="confirmFull">启用 Full access</button>
        </div>
      </div>
    </div>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 8px;
  max-width: 736px;
  width: 100%;
  margin: 0 auto;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(15, 17, 21, 0.06);
}

.field {
  position: relative;
}

.field input {
  width: 100%;
  min-height: 32px;
  height: 32px;
  border: none;
  outline: none;
  padding: 4px 12px 0 16px;
  font: inherit;
  font-size: 16px;
  line-height: 24px;
  background: transparent;
  color: var(--text);
}

.field input::placeholder {
  color: var(--caption);
}

.field input[data-claimed] {
  color: transparent;
  caret-color: rgb(65, 118, 230);
}

.backdrop {
  position: absolute;
  inset: 0;
  padding: 4px 12px 0 16px;
  font-size: 16px;
  line-height: 24px;
  pointer-events: none;
  white-space: pre-wrap;
  overflow: hidden;
}

.token {
  color: rgb(196, 130, 38);
}

.args { color: var(--text); }

.ghost { color: var(--caption); }

.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 12px 0;
}

.thumb {
  position: relative;
  width: 56px;
  height: 56px;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.thumb .x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: rgb(15, 17, 21);
  color: #fff;
  cursor: pointer;
}

.slash {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  z-index: 100;
  min-width: min(260px, 100%);
  max-width: min(537px, 100%);
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.slash .group-title {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 16px;
  color: var(--tertiary);
}

.slash-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  margin: 0;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}

.slash-item:hover,
.slash-item[data-active] {
  background: rgba(0, 0, 0, 0.04);
}

.slash-name {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tertiary);
}

.chip.plan {
  color: rgb(65, 118, 230);
}

.tools {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 8px 6px;
}

.trailing {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.add {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgb(241, 243, 245);
  color: var(--text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.add:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
}

.menu { position: relative; }

.chip {
  max-width: 240px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  background: var(--bg);
  color: var(--secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.caret {
  margin-left: 4px;
  color: var(--caption);
}

.panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 8;
  min-width: 220px;
  max-width: 320px;
  max-height: 320px;
  overflow: auto;
  padding: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.model-panel { min-width: 260px; }
.trailing .panel { left: auto; right: 0; }

.group + .group { margin-top: 6px; }

.group-title {
  padding: 6px 8px 2px;
  font-size: 11px;
  color: var(--caption);
}

.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.option:hover { background: rgba(0, 0, 0, 0.04); }
.option[data-selected] { background: rgb(237, 243, 254); }

.hint {
  font-size: 11px;
  color: var(--tertiary);
  white-space: normal;
}

.empty {
  padding: 10px 8px;
  font-size: 12px;
  color: var(--tertiary);
}

.tools > .send,
.tools > .stop,
.trailing > .send,
.trailing > .stop {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgb(57, 100, 254);
  color: #fff;
  cursor: pointer;
}

.tools > .stop {
  width: auto;
  padding: 0 12px;
  border-radius: 16px;
  background: rgb(15, 17, 21);
  font-size: 13px;
}

.field input:disabled,
.chip:disabled,
.add:disabled,
.tools > button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 21, 0.32);
}

.dialog {
  width: min(420px, calc(100% - 32px));
  padding: 20px;
  border-radius: 16px;
  background: #fff;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
}

.dialog p {
  margin: 10px 0 16px;
  font-size: 13px;
  line-height: 20px;
  color: var(--secondary);
}

.ack {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-actions button {
  height: 32px;
  padding: 0 12px;
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
