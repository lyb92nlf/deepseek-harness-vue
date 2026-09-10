<script setup>
defineProps({
  wait: { type: Object, required: true },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['allow', 'reject'])
</script>

<template>
  <div class="panel">
    <div class="title">等待审批</div>
    <p>工具 {{ wait.toolName }} 请求越权执行{{ wait.reason ? `：${wait.reason}` : '' }}</p>
    <div class="actions">
      <button type="button" class="ghost" :disabled="busy" @click="emit('reject')">拒绝</button>
      <button type="button" :disabled="busy" @click="emit('allow')">允许一次</button>
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

p {
  margin: 8px 0 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

button {
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: rgb(65, 118, 230);
  color: #fff;
  cursor: pointer;
}

.ghost {
  background: transparent;
  color: var(--secondary);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
