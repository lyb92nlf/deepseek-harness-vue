<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  archiveSession, cancel, createSession, forkSession, listSessions, listWorkspaces, prompt,
  renameSession, respond, selectModel, sessionAttachment, sessionHistory, sessionModels, updateQueue,
} from '../dsh/rpc.js'
import { useMux } from '../dsh/useMux.js'
import { toolCanExpand, toolFileLink } from '../dsh/tools.js'
import { openHostFile } from '../dsh/open-file.js'
import {
  applyWorkspaceFrame,
  blankInWorkspace,
  blankUngrouped,
  deriveSessionGroups,
  loadHistoryPage,
  newSessionTarget,
  readStoredSessionId,
  readViewState,
  UNGROUPED_KEY,
  increasedForkTitle,
  sessionLabel,
  visibleSessions,
  writeStoredSessionId,
  writeViewState,
} from '../dsh/sessions.js'
import SearchCard from './SearchCard.vue'
import ReadCard from './ReadCard.vue'
import TerminalCard from './TerminalCard.vue'
import DiffCard from './DiffCard.vue'
import WebCard from './WebCard.vue'
import { asTodos } from '../dsh/markdown.js'
import { EMPTY_CATALOG, loadCatalog } from '../dsh/commands.js'
import { attachmentUrl, readImageFile } from '../dsh/images.js'
import SessionSidebar from './SessionSidebar.vue'
import ComposerBar from './ComposerBar.vue'
import TodoPanel from './TodoPanel.vue'
import AssistantMarkdown from './AssistantMarkdown.vue'
import TurnStatus from './TurnStatus.vue'
import QueueDock from './QueueDock.vue'
import ApprovalPanel from './ApprovalPanel.vue'
import QuestionPanel from './QuestionPanel.vue'
import MessageActions from './MessageActions.vue'
import StatsLine from './StatsLine.vue'

const draft = ref('')
const sending = ref(false)
const acting = ref(false)
const opening = ref(false)
const expanded = ref({})
const allSessions = ref([])
const workspaces = ref([])
const archivedIds = ref([])
const view = ref(readViewState())
const permissions = ref(null)
const models = ref(null)
const todos = ref([])
const projections = ref({})
const pendingImages = ref([])
const catalog = ref(EMPTY_CATALOG)
const imageUrls = ref({})
const hasMore = ref(false)
const loadingOlder = ref(false)
const transcript = ref(null)
const stickBottom = ref(true)
let openGen = 0
const {
  status, sessionId, error, rows, running, turnStartedAt, queueItems, approval, question, oldestSeq,
  connect, watchSession, resetTranscript, setRunning, replayEntries, prependOlder, onProjection, onHost, onTodos,
  beginSwitch, endSwitch,
} = useMux()

const sessionCwd = computed(() => (
  allSessions.value.find((item) => item.sessionId === sessionId.value)?.cwd
))
const sessions = computed(() => visibleSessions(allSessions.value, sessionId.value, archivedIds.value))
const expandedKeys = computed(() => new Set(
  Object.entries(view.value.expanded).filter(([, on]) => on).map(([key]) => key),
))
const groups = computed(() => deriveSessionGroups(
  allSessions.value,
  workspaces.value,
  sessionId.value,
  archivedIds.value,
  expandedKeys.value,
))

const currentSession = computed(() => (
  allSessions.value.find((item) => item.sessionId === sessionId.value)
))

const sessionTitle = computed(() => {
  const row = currentSession.value
  if (!row) return sessionId.value ? '对话' : '未选择会话'
  const titled = projections.value.title
  return sessionLabel({
    ...row,
    projections: {
      ...(row.projections ?? {}),
      values: {
        ...(row.projections?.values ?? {}),
        ...(typeof titled === 'string' ? { title: titled } : {}),
      },
    },
  })
})

function onTranscriptScroll() {
  const el = transcript.value
  if (!el) return
  stickBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 96
}

function scrollTranscriptToEnd() {
  const el = transcript.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

const statusLabel = computed(() => {
  if (opening.value) return '载入中'
  if (running.value) return '生成中'
  if (status.value === 'connected') return '已连接'
  if (status.value === 'connecting') return '正在连接…'
  if (status.value === 'error') return '连接失败'
  return '未连接'
})

async function refreshList() {
  const [listed, listedWs] = await Promise.all([listSessions(), listWorkspaces()])
  allSessions.value = listed.items ?? []
  workspaces.value = listedWs.items ?? []
  archivedIds.value = listedWs.archivedSessionIds ?? []
}

function persistView() {
  writeViewState(view.value)
}

function setGroupBy(mode) {
  view.value = { ...view.value, groupBy: mode }
  persistView()
}

function toggleGroup(key) {
  const expandedMap = { ...view.value.expanded, [key]: !view.value.expanded[key] }
  view.value = { ...view.value, expanded: expandedMap }
  persistView()
}

function ensureGroupOpen(sessionKey) {
  if (Object.hasOwn(view.value.expanded, sessionKey)) return
  view.value = { ...view.value, expanded: { ...view.value.expanded, [sessionKey]: true } }
  persistView()
}

function applyProjection(frame) {
  if (typeof frame.sessionId !== 'string') return
  if (frame.key === 'title') {
    allSessions.value = allSessions.value.map((item) => {
      if (item.sessionId !== frame.sessionId) return item
      const values = { ...(item.projections?.values ?? {}), title: frame.value }
      return { ...item, projections: { ...(item.projections ?? {}), values } }
    })
  }
  if (frame.key === 'permissions' && frame.sessionId === sessionId.value) {
    permissions.value = frame.value ?? null
  }
  if (frame.key === 'todos' && frame.sessionId === sessionId.value) {
    todos.value = asTodos(frame.value)
  }
  if (frame.sessionId === sessionId.value && typeof frame.key === 'string') {
    projections.value = { ...projections.value, [frame.key]: frame.value }
  }
}

function applyHost(frame) {
  workspaces.value = applyWorkspaceFrame(workspaces.value, frame)
  if (frame.type === 'host/session-status') {
    allSessions.value = allSessions.value.map((item) => (
      item.sessionId === frame.sessionId
        ? { ...item, running: frame.running, blank: frame.running ? false : item.blank }
        : item
    ))
  }
  if (frame.type === 'host/archived-sessions-changed' && Array.isArray(frame.archivedSessionIds)) {
    archivedIds.value = frame.archivedSessionIds
  }
  if (frame.type === 'host/workspace-removed' || frame.type === 'host/workspace-changed') {
    refreshList().catch(() => {})
  }
}

async function openSession(id) {
  if (!id) return
  if (id === sessionId.value && !opening.value) return
  const gen = ++openGen
  opening.value = true
  expanded.value = {}
  permissions.value = null
  models.value = null
  todos.value = []
  projections.value = {}
  pendingImages.value = []
  catalog.value = EMPTY_CATALOG
  hasMore.value = false
  stickBottom.value = true
  beginSwitch()
  watchSession(id, Boolean(allSessions.value.find((item) => item.sessionId === id)?.running))
  resetTranscript()
  writeStoredSessionId(id)
  try {
    const [loaded] = await Promise.all([
      loadHistoryPage(id, sessionHistory),
      sessionModels(id).then((value) => {
        if (gen === openGen) models.value = value
      }).catch(() => {
        if (gen === openGen) models.value = null
      }),
      loadCatalog(id).then((value) => {
        if (gen === openGen) catalog.value = value
      }),
    ])
    if (gen !== openGen) return
    replayEntries(loaded.events)
    hasMore.value = loaded.hasMore
    const values = loaded.projections?.values ?? {}
    projections.value = values
    permissions.value = values.permissions ?? permissions.value
    if ('todos' in values) todos.value = asTodos(values.todos)
    await refreshList()
    if (!permissions.value) {
      const row = allSessions.value.find((item) => item.sessionId === id)
      permissions.value = row?.projections?.values?.permissions ?? null
    }
    const groupKey = workspaces.value.find((item) => item.sessionIds?.includes(id))?.workspaceId ?? UNGROUPED_KEY
    ensureGroupOpen(groupKey)
  } finally {
    if (gen === openGen) {
      endSwitch()
      opening.value = false
    }
  }
}

async function openBlank(workspaceId) {
  if (workspaceId) {
    const workspace = workspaces.value.find((item) => item.workspaceId === workspaceId)
    const existing = workspace ? blankInWorkspace(allSessions.value, workspace, archivedIds.value) : undefined
    if (existing) {
      if (existing.sessionId !== sessionId.value) await openSession(existing.sessionId)
      return
    }
    const created = await createSession({ workspaceId })
    await openSession(created.sessionId)
    return
  }
  const current = allSessions.value.find((item) => item.sessionId === sessionId.value)
  const inWorkspace = workspaces.value.some((item) => item.sessionIds?.includes(sessionId.value))
  if (current?.blank && !inWorkspace) return
  const loose = blankUngrouped(allSessions.value, workspaces.value, archivedIds.value)
  if (loose) {
    if (loose.sessionId !== sessionId.value) await openSession(loose.sessionId)
    return
  }
  const created = await createSession()
  await openSession(created.sessionId)
}

async function startSession(workspaceId) {
  await openBlank(newSessionTarget(workspaces.value, allSessions.value, sessionId.value, workspaceId))
}

async function createInGroup(workspaceId) {
  await openBlank(workspaceId)
}

async function renameListed(id, title) {
  try {
    await renameSession(id, title)
    await refreshList()
    if (id === sessionId.value) {
      projections.value = { ...projections.value, title }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function forkListed(id) {
  const row = allSessions.value.find((item) => item.sessionId === id)
  const sourceTitle = row ? sessionLabel(row) : ''
  try {
    const created = await forkSession(id)
    const childId = created?.sessionId
    if (!childId) throw new Error('分叉未返回新会话')
    if (sourceTitle && sourceTitle !== '新会话') {
      try {
        await renameSession(childId, increasedForkTitle(sourceTitle))
      } catch {
        // Child is usable with the inherited title if rename is refused.
      }
    }
    await refreshList()
    await openSession(childId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message.includes('fork-unavailable')
      ? '没有已完成的轮次，无法分叉'
      : message
  }
}

async function archiveListed(id) {
  try {
    const result = await archiveSession(id)
    archivedIds.value = result?.archivedSessionIds ?? [...archivedIds.value, id]
    await refreshList()
    if (id !== sessionId.value) return
    const next = visibleSessions(allSessions.value, '', archivedIds.value)[0]
    if (next) await openSession(next.sessionId)
    else await startSession()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

watch(rows, async () => {
  for (const row of rows) {
    if (row.type !== 'user') continue
    for (const id of row.images ?? []) ensureImage(id)
  }
  if (loadingOlder.value) return
  await nextTick()
  if (stickBottom.value) scrollTranscriptToEnd()
}, { deep: true })

onMounted(async () => {
  onProjection(applyProjection)
  onHost(applyHost)
  onTodos((list) => { todos.value = asTodos(list) })
  try {
    await connect()
    await refreshList()
    const stored = readStoredSessionId()
    const topLevel = allSessions.value.filter((item) => item.origin !== 'subagent' && !item.parentSessionId)
    const storedHit = topLevel.find((item) => item.sessionId === stored)
    const newest = [...topLevel].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
    if (storedHit) await openSession(storedHit.sessionId)
    else if (newest) await openSession(newest.sessionId)
    else await startSession()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
})

function toggleSkill(index) {
  expanded.value = { ...expanded.value, [index]: !expanded.value[index] }
}

function canExpand(row) {
  return toolCanExpand(row)
}

function fileLink(row) {
  return toolFileLink(row)
}

function openFile(path) {
  void openHostFile(path, sessionCwd.value)
}

function rowSummary(row) {
  if (row.state === 'stopped') return '已停止'
  if (row.state === 'error' && row.errorSummary) return row.errorSummary
  return row.summary
}

async function send() {
  const text = draft.value.trim()
  const images = pendingImages.value
  if ((!text && !images.length) || sending.value || !sessionId.value || approval.value || question.value) return
  sending.value = true
  try {
    const content = [
      ...images.map((image) => ({
        type: 'image',
        mediaType: image.mediaType,
        data: image.data,
        name: image.name,
      })),
      ...(text ? [{ type: 'text', text }] : []),
    ]
    const result = await prompt(sessionId.value, content)
    draft.value = ''
    pendingImages.value = []
    if (!result?.command) setRunning(true)
    refreshList().catch(() => {})
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    sending.value = false
  }
}

async function addFiles(files) {
  try {
    const next = [...pendingImages.value]
    for (const file of files) {
      next.push(await readImageFile(file, projections.value.imageLimits, next))
    }
    pendingImages.value = next
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function removeImage(index) {
  pendingImages.value = pendingImages.value.filter((_, i) => i !== index)
}

async function exitPlan() {
  if (!sessionId.value) return
  try {
    await prompt(sessionId.value, '/plan off')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function loadOlder() {
  if (!sessionId.value || !hasMore.value || loadingOlder.value || oldestSeq.value == null) return
  loadingOlder.value = true
  const el = transcript.value
  const before = el?.scrollHeight ?? 0
  try {
    const page = await loadHistoryPage(sessionId.value, sessionHistory, { beforeSeq: oldestSeq.value })
    prependOlder(page.events)
    hasMore.value = page.hasMore
    await nextTick()
    if (el) el.scrollTop += el.scrollHeight - before
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loadingOlder.value = false
  }
}

async function forkAt(seq) {
  if (!sessionId.value || typeof seq !== 'number') return
  const sourceTitle = sessionTitle.value
  try {
    const created = await forkSession(sessionId.value, Math.floor(seq))
    const childId = created?.sessionId
    if (!childId) throw new Error('分叉未返回新会话')
    if (sourceTitle && sourceTitle !== '新会话' && sourceTitle !== '对话' && sourceTitle !== '未选择会话') {
      try {
        await renameSession(childId, increasedForkTitle(sourceTitle))
      } catch {
        // Child is usable with the inherited title if rename is refused.
      }
    }
    await refreshList()
    await openSession(childId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message.includes('fork-unavailable')
      ? '这一轮还没结束，无法从这里分叉'
      : message
  }
}

async function ensureImage(attachmentId) {
  if (!attachmentId || imageUrls.value[attachmentId] || !sessionId.value) return
  try {
    const result = await sessionAttachment(sessionId.value, attachmentId)
    const url = attachmentUrl(result)
    if (url) imageUrls.value = { ...imageUrls.value, [attachmentId]: url }
  } catch {
    // Missing attachments stay unrendered, matching the official row.
  }
}

async function stop() {
  if (!sessionId.value || sending.value) return
  try {
    await cancel(sessionId.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function removeQueued(itemId) {
  if (!sessionId.value) return
  try {
    await updateQueue(sessionId.value, itemId, { kind: 'remove' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function decideApproval(outcome) {
  const wait = approval.value
  if (!wait || acting.value) return
  acting.value = true
  try {
    await respond(wait.rpcId, {
      sessionId: wait.sessionId,
      approvalId: wait.approvalId,
      outcome,
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    acting.value = false
  }
}

async function answerQuestion(answer) {
  const wait = question.value
  if (!wait || acting.value) return
  acting.value = true
  try {
    await respond(wait.rpcId, { sessionId: wait.sessionId, answer })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    acting.value = false
  }
}

async function changePermission(preset) {
  if (!sessionId.value) return
  try {
    await prompt(sessionId.value, `/permission ${preset}`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function changeModel(selection) {
  if (!sessionId.value) return
  try {
    const result = await selectModel(sessionId.value, selection)
    models.value = { ...(models.value ?? { groups: [], failures: [] }), current: result.selected, routable: true }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

</script>

<template>
  <div class="shell">
    <SessionSidebar
      :groups="groups"
      :sessions="sessions"
      :group-by="view.groupBy"
      :current-id="sessionId"
      @select="openSession"
      @create="startSession()"
      @create-in="createInGroup"
      @toggle-group="toggleGroup"
      @set-group-by="setGroupBy"
      @rename="renameListed"
      @fork="forkListed"
      @archive="archiveListed"
    />
    <div class="page">
    <header class="top">
      <h1 class="session-title">{{ sessionTitle }}</h1>
      <div class="status" :data-state="status">{{ statusLabel }}</div>
    </header>

    <p v-if="error" class="banner">{{ error }}</p>

    <div ref="transcript" class="transcript" @scroll.passive="onTranscriptScroll">
    <div class="column">
      <div v-if="hasMore" class="older">
        <button type="button" :disabled="loadingOlder" @click="loadOlder">
          {{ loadingOlder ? '载入中…' : '加载更早' }}
        </button>
      </div>
      <template v-for="(row, index) in rows" :key="index">
        <div v-if="row.type === 'user'" class="user-row" data-time-hover-root>
          <div class="bubble">
            <div v-if="row.images?.length" class="user-images">
              <img
                v-for="id in row.images"
                :key="id"
                :src="imageUrls[id]"
                alt=""
              />
            </div>
            <span v-if="row.text">{{ row.text }}</span>
          </div>
          <MessageActions :text="row.text" />
        </div>

        <div
          v-else-if="row.type === 'context'"
          class="context"
          :data-open="expanded[index] || undefined"
          @click="toggleSkill(index)"
        >
          <div class="context-row">
            <span class="leading">☰</span>
            <span class="title">{{ row.title }}</span>
            <template v-if="row.label">
              <span class="sep" />
              <span class="summary">{{ row.label }}</span>
            </template>
          </div>
          <div v-if="expanded[index]" class="context-body" @click.stop>
            <ul v-if="row.files.length" class="context-files">
              <li v-for="file in row.files" :key="file.path">
                <button type="button" class="file-link" @click.stop="openFile(file.path)">{{ file.path }}</button>
                <span class="file-action">{{ file.actionLabel }}</span>
              </li>
            </ul>
            <ul v-if="row.entries.length" class="context-entries">
              <li v-for="entry in row.entries" :key="entry.name">
                <code>{{ entry.name }}</code>
                <span>{{ entry.description }}</span>
              </li>
            </ul>
            <pre v-if="row.text">{{ row.text }}</pre>
          </div>
        </div>

        <div
          v-else-if="row.type === 'skill' || row.type === 'tool'"
          class="skill-card"
          :data-state="row.state"
        >
          <div
            class="skill-row"
            :data-expandable="canExpand(row) || undefined"
            @click="canExpand(row) && toggleSkill(index)"
          >
            <span class="leading">{{ row.type === 'skill' ? '✦' : '▸' }}</span>
            <span class="title">{{ row.title }}</span>
            <template v-if="rowSummary(row)">
              <span class="sep" />
              <button
                v-if="fileLink(row)"
                type="button"
                class="file-link summary-link"
                @click.stop="openFile(row.filePath)"
              >{{ rowSummary(row) }}</button>
              <span v-else class="summary" :class="{ error: row.state === 'error' }">
                {{ rowSummary(row) }}
              </span>
            </template>
          </div>
          <div v-if="expanded[index] && row.search" class="body-wrap">
            <SearchCard :card="row.search" @open="openFile" />
          </div>
          <div v-else-if="expanded[index] && row.read" class="body-wrap">
            <ReadCard :card="row.read" :file-path="row.filePath" @open="openFile" />
          </div>
          <div v-else-if="expanded[index] && row.terminal" class="body-wrap">
            <TerminalCard :card="row.terminal" />
          </div>
          <div v-else-if="expanded[index] && row.diff" class="body-wrap">
            <DiffCard :card="row.diff" @open="openFile" />
          </div>
          <div v-else-if="expanded[index] && row.web" class="body-wrap">
            <WebCard :card="row.web" />
          </div>
          <div v-else-if="expanded[index] && (row.body || row.output)" class="body-wrap">
            <section class="instructions-card">
              <div v-if="row.body" class="io-section">
                <span class="io-label">IN</span>
                <pre class="instructions">{{ row.body }}</pre>
              </div>
              <div v-if="row.body && row.output" class="io-divider" />
              <div v-if="row.output" class="io-section">
                <span class="io-label">{{ row.type === 'skill' ? '说明' : 'OUT' }}</span>
                <pre class="instructions" :class="{ error: row.state === 'error' }">{{ row.output }}</pre>
              </div>
            </section>
          </div>
        </div>

        <div v-else-if="row.type === 'think'" class="think" :data-state="row.running ? 'running' : 'ok'">
          <div class="think-row">Think</div>
          <div v-if="!row.running && row.text" class="think-body">{{ row.text }}</div>
        </div>

        <div v-else-if="row.type === 'notice'" class="notice" :data-kind="row.kind" :data-failed="row.failed || undefined">
          <div class="notice-title">{{ row.title }}</div>
          <div v-if="row.detail" class="notice-detail">{{ row.detail }}</div>
        </div>

        <AssistantMarkdown
          v-else-if="row.type === 'answer'"
          :text="row.text"
          :streaming="row.streaming"
          :produced="row.produced"
          :time="row.time"
          :run-ms="row.runMs"
          :ttft-ms="row.ttftMs"
          :tokens-per-second="row.tokensPerSecond"
          :interrupted="row.interrupted"
          :seq="row.seq"
          :can-fork="Boolean(row.forkable && row.seq != null)"
          @open="openFile"
          @fork="forkAt"
        />
      </template>
      <TurnStatus v-if="running && !opening" :start-time="turnStartedAt" />
      <p v-if="opening" class="hint">载入历史…</p>
    </div>
    </div>

    <div class="dock">
    <TodoPanel :todos="todos" />
    <ApprovalPanel
      v-if="approval"
      :wait="approval"
      :busy="acting"
      @allow="decideApproval('allowed-once')"
      @reject="decideApproval('rejected')"
    />
    <QuestionPanel
      v-if="question"
      :wait="question"
      :busy="acting"
      @submit="answerQuestion"
    />
    <QueueDock :items="queueItems" @remove="removeQueued" />
    <ComposerBar
      v-model:draft="draft"
      :disabled="opening || status !== 'connected' || !sessionId"
      :sending="sending"
      :running="running"
      :locked="Boolean(approval || question)"
      :permissions="permissions"
      :models="models"
      :images="pendingImages"
      :catalog="catalog"
      :plan="projections.plan"
      :pressure="projections.contextPressure"
      :breakdown="projections.contextBreakdown"
      :can-image="true"
      @send="send"
      @stop="stop"
      @permission="changePermission"
      @model="changeModel"
      @add-files="addFiles"
      @remove-image="removeImage"
      @exit-plan="exitPlan"
    />
    <StatsLine :stats="projections.sessionStats" :usage="projections.tokenUsage" />
    </div>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  max-height: 100dvh;
  align-items: stretch;
  overflow: hidden;
}

.page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.top {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 48px;
  padding: 12px 20px 10px;
  border-bottom: 1px solid var(--border);
}

.session-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
}

.status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--tertiary);
}

.status[data-state='connected'] { color: rgb(34, 197, 94); }
.status[data-state='error'] { color: var(--error); }

.banner {
  flex: none;
  max-width: 736px;
  width: calc(100% - 32px);
  margin: 8px auto 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgb(254, 242, 242);
  color: var(--error);
  font-size: 13px;
  line-height: 20px;
}

.transcript {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.column {
  padding: 16px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 736px;
  width: 100%;
  margin: 0 auto;
}

.dock {
  flex: none;
}

.user-row {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.older {
  display: flex;
  justify-content: center;
}

.older button {
  height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  background: #fff;
  color: var(--secondary);
  cursor: pointer;
}

.user-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.user-images img {
  max-width: 160px;
  max-height: 120px;
  object-fit: cover;
  border-radius: 10px;
}

.bubble {
  max-width: min(525px, 82%);
  background: var(--bubble);
  border-radius: 22px;
  padding: 10px 16px;
  font-size: 16px;
  line-height: 24px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.context { min-width: 0; cursor: pointer; }
.context-row {
  display: flex;
  align-items: center;
  height: 24px;
  min-width: 0;
}
.context-body {
  box-sizing: border-box;
  width: calc(100% - 22px);
  max-height: 141px;
  margin: 4px 0 0 22px;
  overflow: auto;
  padding: 10px 16px 12px 12px;
  border-radius: 8px;
  background: var(--code-bg);
  color: var(--tertiary);
  font-size: 11px;
  line-height: 16px;
}
.context-files,
.context-entries {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.context-files li,
.context-entries li {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.file-action { color: var(--caption); }

.file-link {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--caption);
  text-underline-offset: 3px;
  cursor: pointer;
}

.file-link:hover {
  color: var(--text);
  text-decoration-color: currentColor;
}

.summary-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 24px;
  color: var(--tertiary);
}
.context-entries code {
  flex: none;
  font-family: ui-monospace, monospace;
}
.context-body pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.skill-card { display: flex; flex-direction: column; }

.skill-row {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: 24px;
}

.skill-row[data-expandable] { cursor: pointer; }

.skill-card[data-state='running'] .skill-row::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 300px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--bg) 60%, transparent) 55%,
    transparent
  );
  animation: sweep 2.6s ease-out infinite;
  pointer-events: none;
}

@keyframes sweep {
  0% { left: -300px; }
  90%, 100% { left: 100%; }
}

.leading {
  width: 16px;
  margin-right: 6px;
  color: var(--tertiary);
  font-size: 12px;
  text-align: center;
}

.title {
  flex: none;
  font-size: 14px;
  line-height: 24px;
  color: var(--secondary);
}

.sep {
  flex: none;
  width: 2px;
  height: 2px;
  border-radius: 1px;
  margin: 0 8px;
  background: var(--caption);
}

.summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 24px;
  color: var(--tertiary);
}

.summary.error { color: var(--error); }

.notice {
  font-size: 14px;
  line-height: 22px;
  color: var(--secondary);
}

.notice[data-kind='error'],
.notice[data-failed] { color: var(--error); }

.notice-title { font-weight: 600; }

.notice-detail {
  margin-top: 4px;
  font-size: 13px;
  color: var(--tertiary);
}

.hint {
  font-size: 13px;
  color: var(--tertiary);
}

.instructions-card {
  max-height: 260px;
  margin: 4px 0 4px 4px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--code-bg);
}

.io-section {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 14px;
  align-items: baseline;
  padding: 12px 16px;
  max-height: 150px;
  overflow-y: auto;
}

.io-label {
  color: var(--caption);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.io-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
}

.instructions-header {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--code-banner);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--caption);
}

.instructions {
  margin: 0;
  padding: 0;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 18px;
  color: var(--secondary);
}

.instructions.error { color: var(--error); }

.think-row {
  position: relative;
  overflow: hidden;
  height: 24px;
  font-size: 14px;
  color: var(--secondary);
}

.think[data-state='running'] .think-row::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 300px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--bg) 60%, transparent) 55%,
    transparent
  );
  animation: sweep 2.6s ease-out infinite;
}

.think-body {
  padding: 4px 0 0 22px;
  font-size: 14px;
  line-height: 24px;
  color: var(--tertiary);
  white-space: pre-wrap;
}

@media (prefers-reduced-motion: reduce) {
  .skill-card[data-state='running'] .skill-row::after,
  .think[data-state='running'] .think-row::after {
    animation: none;
    display: none;
  }
}
</style>
