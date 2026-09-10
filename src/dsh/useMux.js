import { onUnmounted, reactive, ref } from 'vue'
import { contextRow } from './context.js'
import {
  addProduced, emptyTurnState, noteAssistantUsage, noteStepStart, noteToken, producedPaths,
  turnMetrics,
} from './deliverables.js'
import { imageRefsFromContent } from './images.js'
import { applyToolResult, createToolRow } from './tools.js'

function textFromContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/**
 * Open the mux downlink and fold session/event frames into a simple transcript.
 * @returns chat state plus connect / reset helpers.
 */
export function useMux() {
  const status = ref('idle')
  const sessionId = ref('')
  const error = ref('')
  const rows = reactive([])
  const running = ref(false)
  const turnStartedAt = ref(null)
  const queueItems = reactive([])
  const approval = ref(null)
  const question = ref(null)
  const oldestSeq = ref(null)

  let socket
  let watchedSessionId = ''
  let lastSeq = -1
  let projectionHandler = null
  let hostHandler = null
  let todosHandler = null
  let replay = false
  let loading = false
  let liveBuffer = []
  let turn = emptyTurnState()

  function setRunning(value, startedAt) {
    running.value = Boolean(value)
    turnStartedAt.value = value ? (startedAt ?? turnStartedAt.value ?? Date.now()) : null
  }

  function resetLive() {
    queueItems.splice(0, queueItems.length)
    approval.value = null
    question.value = null
  }

  function resetTranscript() {
    rows.splice(0, rows.length)
    lastSeq = -1
    oldestSeq.value = null
    turn = emptyTurnState()
    resetLive()
  }

  function notice(kind, fields) {
    rows.push({ type: 'notice', kind, running: false, ...fields })
  }

  function lastNotice(kind, id) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].type === 'notice' && rows[i].kind === kind && (id == null || rows[i].id === id)) {
        return rows[i]
      }
    }
    return undefined
  }

  function failureText(failure) {
    if (!failure || typeof failure !== 'object') return ''
    if (typeof failure.message === 'string' && failure.message !== '') return failure.message
    if (typeof failure.code === 'string' && failure.code !== '') return failure.code
    return ''
  }

  function markTurnStopped() {
    const think = lastOfType('think')
    if (think) think.running = false
    const answer = lastAnswerOfTurn(turn.number)
    if (answer) {
      answer.streaming = false
      answer.interrupted = true
    }
    for (const row of rows) {
      if ((row.type === 'tool' || row.type === 'skill') && row.state === 'running') {
        row.state = 'stopped'
        row.errorSummary = '已停止'
      }
    }
  }

  function ensureTurn(event) {
    const number = event.data?.turn
    if (number == null) return
    if (turn.number === number) return
    turn = emptyTurnState()
    turn.number = number
    turn.startTime = event.time
  }

  function lastAnswerOfTurn(number) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].type === 'answer' && rows[i].turn === number) return rows[i]
    }
    return undefined
  }

  function attachProduced() {
    if (turn.number == null) return
    for (const row of rows) {
      if (row.type === 'answer' && row.turn === turn.number) row.produced = []
    }
    const answer = lastAnswerOfTurn(turn.number)
    if (answer && !answer.streaming) answer.produced = [...turn.produced]
  }

  function attachTurnTail() {
    const answer = lastAnswerOfTurn(turn.number)
    if (!answer) return
    Object.assign(answer, turnMetrics(turn))
    if (!answer.streaming) answer.produced = [...turn.produced]
    answer.forkable = true
  }

  function resultCallId(event) {
    const message = event.data?.message
    const block = Array.isArray(message?.content) ? message.content[0] : undefined
    return String(block?.toolCallId ?? message?.source?.callId ?? event.data?.callId ?? '')
  }

  function emptyAnswer(text, streaming, extra = {}) {
    return {
      type: 'answer',
      text,
      streaming,
      turn: turn.number,
      produced: [],
      ...extra,
    }
  }

  function lastOfType(type) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].type === type) return rows[i]
    }
    return undefined
  }

  function assistantParts(message) {
    const content = message?.content
    let think = ''
    let text = ''
    if (!Array.isArray(content)) return { think, text }
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') text += block.text
      if ((block?.type === 'reasoning' || block?.type === 'thinking') && typeof block.text === 'string') {
        think += block.text
      }
    }
    return { think, text }
  }

  function applyEvent(event, presented) {
    if (typeof event.seq === 'number') {
      if (oldestSeq.value == null || event.seq < oldestSeq.value) oldestSeq.value = event.seq
      if (event.seq <= lastSeq) return
      lastSeq = event.seq
    }
    switch (event.type) {
      case 'user/message': {
        const sourceKind = event.data?.source?.kind
        if (sourceKind !== 'user') {
          rows.push(contextRow(event))
          break
        }
        const text = textFromContent(event.data?.content)
        const images = imageRefsFromContent(event.data?.content)
        const last = lastOfType('user')
        if (!replay && last && last.text === text && (last.images?.length ?? 0) === images.length) return
        if (text || images.length) {
          rows.push({
            type: 'user',
            text,
            images,
            seq: event.seq,
            time: event.time,
          })
        }
        break
      }
      case 'tool/call': {
        ensureTurn(event)
        const callId = String(event.data?.callId ?? '')
        if (callId) turn.calls.set(callId, presented?.for === 'call' ? presented.view : null)
        rows.push(createToolRow(
          event.data?.name ?? '',
          event.data?.callId ?? '',
          event.data?.arguments ?? '',
          presented,
        ))
        break
      }
      case 'tool/result': {
        const message = event.data?.message
        const block = Array.isArray(message?.content) ? message.content[0] : undefined
        const callId = resultCallId(event)
        const inner = block?.type === 'tool-result' ? block.content : message?.content
        const output = textFromContent(inner)
        const failed = Boolean(event.data?.error) || Boolean(block?.isError)
        const row = [...rows].reverse().find((item) => (
          (item.type === 'skill' || item.type === 'tool')
          && (callId === '' || item.callId === callId)
          && item.state === 'running'
        ))
        if (row) applyToolResult(row, event, output, presented, failed)
        if (!failed) {
          ensureTurn(event)
          turn.produced = addProduced(turn.produced, producedPaths(turn.calls.get(callId) ?? null))
          attachProduced()
        }
        break
      }
      case 'assistant/chunk': {
        ensureTurn(event)
        const chunk = event.data?.chunk
        noteToken(turn, event, chunk)
        if (chunk?.type === 'reasoning-delta' && typeof chunk.text === 'string') {
          const think = lastOfType('think')
          if (think && think.running) think.text += chunk.text
          else rows.push({ type: 'think', text: chunk.text, running: true })
          return
        }
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
          const think = lastOfType('think')
          if (think) think.running = false
          const answer = lastOfType('answer')
          if (answer && answer.streaming) answer.text += chunk.text
          else rows.push(emptyAnswer(chunk.text, true))
        }
        break
      }
      case 'todo/write':
        todosHandler?.(Array.isArray(event.data?.todos) ? event.data.todos : null)
        break
      case 'turn/start':
        turn = emptyTurnState()
        turn.number = event.data?.turn ?? null
        turn.startTime = event.time
        if (!replay) setRunning(true, event.time)
        todosHandler?.(null)
        break
      case 'step/start':
        ensureTurn(event)
        noteStepStart(turn, event)
        break
      case 'turn/end': {
        ensureTurn(event)
        turn.endTime = event.time
        attachTurnTail()
        const reason = event.data?.reason
        const kind = reason?.kind
        if (kind === 'aborted' || kind === 'interrupted') markTurnStopped()
        if (kind === 'error') {
          notice('error', { title: '本轮运行失败', detail: failureText(reason.error) })
        }
        if (kind === 'max-tokens') {
          notice('max-tokens', {
            title: '已达到输出 token 上限',
            detail: '回答被截断，已有输出保留在对话中。发送“继续”可让模型接着输出。',
          })
        }
        if (!replay && !queueItems.some((item) => item.placement === 'queued' || item.placement === 'steering')) {
          setRunning(false)
        }
        break
      }
      case 'compaction/start':
        notice('compaction', {
          id: event.data?.compactionId,
          title: '正在压缩…',
          running: true,
        })
        break
      case 'compaction/summary': {
        const items = event.data?.shadowedSeqs?.length ?? 0
        const tokens = event.data?.shadowedTokenCount ?? 0
        const title = `已压缩 ${items} 条历史记录（约 ${tokens} tokens）`
        const row = lastNotice('compaction', event.data?.compactionId)
        if (row) {
          row.title = title
          row.running = false
        } else {
          notice('compaction', { id: event.data?.compactionId, title })
        }
        break
      }
      case 'compaction/end': {
        const row = lastNotice('compaction', event.data?.compactionId)
        if (event.data?.error) {
          if (row) {
            row.title = '压缩失败'
            row.detail = event.data.error
            row.running = false
          } else {
            notice('compaction', { title: '压缩失败', detail: event.data.error })
          }
        } else if (row?.running) {
          row.title = '上下文已压缩'
          row.running = false
        }
        break
      }
      case 'llm/retry': {
        const max = event.data?.maxRetries
        const retry = event.data?.retry
        const title = typeof max === 'number'
          ? `等待重试模型请求（${retry}/${max}）`
          : '等待重试模型请求'
        notice('retry', {
          id: event.data?.retryId,
          title,
          detail: failureText(event.data?.failure),
          running: true,
        })
        break
      }
      case 'llm/retry-started': {
        const row = lastNotice('retry', event.data?.retryId)
        if (row) row.title = '正在重试模型请求'
        break
      }
      case 'command/run':
        notice('command', {
          id: event.data?.commandId,
          title: event.data?.name ? `/${event.data.name}` : '命令',
          detail: '执行中…',
          running: true,
        })
        break
      case 'command/done': {
        const row = lastNotice('command', event.data?.commandId)
        const failed = event.data?.kind === 'error'
        if (row) {
          row.detail = event.data?.text || (failed ? '命令失败' : '已完成')
          row.running = false
          row.failed = failed
        } else {
          notice('command', {
            title: failed ? '命令失败' : '已完成',
            detail: event.data?.text,
            failed,
          })
        }
        break
      }
      case 'assistant/message': {
        ensureTurn(event)
        noteAssistantUsage(turn, event)
        const think = lastOfType('think')
        if (think) think.running = false
        const answer = lastOfType('answer')
        if (answer?.streaming) {
          answer.streaming = false
          answer.seq = event.seq
          attachProduced()
          break
        }
        const parts = assistantParts(event.data?.message)
        if (parts.think && !think) rows.push({ type: 'think', text: parts.think, running: false })
        if (parts.text) {
          const next = emptyAnswer(parts.text, false, { seq: event.seq })
          rows.push(next)
          attachProduced()
        }
        break
      }
      default:
        break
    }
  }

  function handleMessage(event) {
    if (typeof event.data !== 'string') return
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    if (msg?.type !== 'server-request' || !msg.payload) return
    const frame = msg.payload
    const rpcId = msg.rpcId
    if (frame.type === 'session/projection') {
      projectionHandler?.(frame)
      return
    }
    if (frame.type === 'host/session-status') {
      if (!watchedSessionId || frame.sessionId === watchedSessionId) {
        setRunning(frame.running)
      }
      hostHandler?.(frame)
      return
    }
    if (typeof frame.type === 'string' && frame.type.startsWith('host/')) {
      hostHandler?.(frame)
      return
    }
    if (frame.type === 'session/queue') {
      if (!watchedSessionId || frame.sessionId === watchedSessionId) {
        queueItems.splice(0, queueItems.length, ...(Array.isArray(frame.items) ? frame.items : []))
      }
      return
    }
    if (frame.type === 'approval/requested') {
      if (!watchedSessionId || frame.sessionId === watchedSessionId) {
        approval.value = {
          rpcId,
          sessionId: frame.sessionId,
          approvalId: frame.approvalId,
          toolName: frame.toolName,
          reason: frame.reason,
          callId: frame.callId,
        }
      }
      return
    }
    if (frame.type === 'approval/resolved') {
      if (approval.value?.approvalId === frame.approvalId) approval.value = null
      return
    }
    if (frame.type === 'question/requested') {
      if (!watchedSessionId || frame.sessionId === watchedSessionId) {
        question.value = {
          rpcId,
          sessionId: frame.sessionId,
          questions: Array.isArray(frame.questions) ? frame.questions : [],
        }
      }
      return
    }
    if (frame.type === 'question/resolved') {
      if (question.value && (question.value.rpcId === frame.questionRpcId || question.value.rpcId === rpcId)) {
        question.value = null
      }
      return
    }
    if (frame.type !== 'session/event') return
    if (watchedSessionId && frame.sessionId !== watchedSessionId) return
    if (loading) {
      liveBuffer.push({ event: frame.event, view: frame.view })
      return
    }
    applyEvent(frame.event, frame.view)
  }

  async function probeHost() {
    try {
      // Probe a unary RPC, not GET /api/events.mux: that path is WebSocket-only
      // and a plain GET always returns 426 (Upgrade Required) in the console.
      const res = await fetch('/api/session.list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'session.list',
          payload: {},
        }),
      })
      if (res.status === 403) {
        throw new Error('Host 拒绝了 /api（403）。请用和地址栏相同的主机名打开页面（localhost 不要混用 127.0.0.1）。')
      }
      if (res.status === 404) {
        throw new Error('代理未打到 dsh web（404）。确认已运行 pnpm dsh --profile web，默认端口 3080。')
      }
      if (!res.ok) {
        throw new Error(`无法访问 /api（HTTP ${res.status}）。请先启动 pnpm dsh --profile web。`)
      }
    } catch (err) {
      if (err instanceof Error && /403|404|拒绝|HTTP/.test(err.message)) throw err
      throw new Error('无法访问 /api。请先在 deepseek-harness 里启动：pnpm dsh --profile web（默认 http://127.0.0.1:3080）。')
    }
  }

  async function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve()
    }
    status.value = 'connecting'
    error.value = ''
    await probeHost()
    const url = new URL('/api/events.mux', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(url)
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        status.value = 'connected'
        resolve()
      }
      const fail = (message) => {
        status.value = 'error'
        error.value = message
        reject(new Error(message))
      }
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('open', onOpen, { once: true })
      socket.addEventListener('error', () => {
        fail('无法升级 /api/events.mux WebSocket。请重启 npm run dev 后再试。')
      }, { once: true })
      socket.addEventListener('close', (event) => {
        if (status.value === 'connecting' && event.code === 1006) return
        if (status.value === 'connected') status.value = 'idle'
      })
    })
  }

  function watchSession(id, alreadyRunning = false) {
    watchedSessionId = id
    sessionId.value = id
    turnStartedAt.value = null
    setRunning(alreadyRunning)
    resetLive()
  }

  function beginSwitch() {
    loading = true
    liveBuffer = []
  }

  function endSwitch() {
    loading = false
    const buffered = liveBuffer
    liveBuffer = []
    for (const item of buffered) applyEvent(item.event, item.view)
  }

  function replayEntries(entries) {
    replay = true
    try {
      for (const entry of entries) {
        applyEvent(entry.event, entry.view)
      }
    } finally {
      replay = false
    }
  }

  function prependOlder(entries) {
    if (!entries.length) return
    const savedLast = lastSeq
    const savedTurn = turn
    const existing = rows.splice(0, rows.length)
    lastSeq = -1
    replay = true
    try {
      turn = emptyTurnState()
      for (const entry of entries) applyEvent(entry.event, entry.view)
      const older = rows.splice(0, rows.length)
      rows.push(...older, ...existing)
    } finally {
      lastSeq = savedLast
      turn = savedTurn
      replay = false
    }
  }

  function onProjection(handler) {
    projectionHandler = handler
  }

  function onHost(handler) {
    hostHandler = handler
  }

  function onTodos(handler) {
    todosHandler = handler
  }

  onUnmounted(() => {
    socket?.close()
  })

  return {
    status, sessionId, error, rows, running, turnStartedAt, queueItems, approval, question, oldestSeq,
    connect, watchSession, resetTranscript, resetLive, setRunning, replayEntries, prependOlder,
    onProjection, onHost, onTodos, beginSwitch, endSwitch,
  }
}
