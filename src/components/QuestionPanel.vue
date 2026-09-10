<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  wait: { type: Object, required: true },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['submit'])

const draft = reactive({})

function reset() {
  for (const key of Object.keys(draft)) delete draft[key]
  for (const item of props.wait.questions ?? []) {
    draft[item.id] = { selected: [], custom: '' }
  }
}

watch(() => props.wait.rpcId, reset, { immediate: true })

function toggle(id, label, multi) {
  const row = draft[id]
  if (!row) return
  if (!multi) {
    row.selected = [label]
    return
  }
  row.selected = row.selected.includes(label)
    ? row.selected.filter((item) => item !== label)
    : [...row.selected, label]
}

function ready() {
  return (props.wait.questions ?? []).every((item) => {
    const row = draft[item.id]
    if (!row) return false
    return row.selected.length > 0 || row.custom.trim() !== ''
  })
}

function submit() {
  if (!ready()) return
  emit('submit', {
    answers: (props.wait.questions ?? []).map((item) => {
      const row = draft[item.id]
      return {
        id: item.id,
        selected: row.selected,
        ...(row.custom.trim() ? { custom: row.custom.trim() } : {}),
      }
    }),
  })
}
</script>

<template>
  <div class="panel">
    <div class="title">提问</div>
    <section v-for="item in (wait.questions ?? [])" :key="item.id" class="question">
      <div class="q">{{ item.header ? `${item.header} · ` : '' }}{{ item.question }}</div>
      <p v-if="item.detail" class="detail">{{ item.detail }}</p>
      <div v-if="item.options?.length" class="options">
        <button
          v-for="option in item.options"
          :key="option.label"
          type="button"
          class="option"
          :data-selected="draft[item.id]?.selected.includes(option.label) || undefined"
          @click="toggle(item.id, option.label, item.multiSelect === true)"
        >
          <span>{{ option.label }}</span>
          <span v-if="option.description" class="hint">{{ option.description }}</span>
        </button>
      </div>
      <input
        v-if="!item.options?.length || item.multiSelect"
        :value="draft[item.id]?.custom"
        placeholder="其他补充"
        @input="draft[item.id] && (draft[item.id].custom = $event.target.value)"
      />
    </section>
    <div class="actions">
      <button type="button" :disabled="busy || !ready()" @click="submit">提交回答</button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  max-width: 736px;
  width: 100%;
  margin: 0 auto 8px;
  padding: 14px 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: #fff;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.question + .question { margin-top: 14px; }

.q {
  font-size: 14px;
  font-weight: 600;
}

.detail {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--secondary);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.option[data-selected] { background: rgb(237, 243, 254); }

.hint {
  font-size: 11px;
  color: var(--tertiary);
}

input {
  width: 100%;
  margin-top: 8px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 10px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.actions button {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: rgb(65, 118, 230);
  color: #fff;
  cursor: pointer;
}

.actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
