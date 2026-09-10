/** Trailing path segment for chips and mention matching. */
export function basename(path) {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

/**
 * Paths a call view reports having created or changed.
 * Diff cards and generic edit cards contribute; reads/deletes/terminals do not.
 */
export function producedPaths(view) {
  if (!view || typeof view !== 'object') return []
  const locations = Array.isArray(view.locations) ? view.locations : []
  const paths = locations
    .map((item) => (typeof item?.path === 'string' ? item.path : ''))
    .filter((path) => path !== '')
  if (view.card === 'diff') return paths
  if (view.card === 'generic' && view.kind === 'edit') return paths
  return []
}

export function addProduced(list, paths) {
  const seen = new Set(list)
  const next = [...list]
  for (const path of paths) {
    if (seen.has(path)) continue
    seen.add(path)
    next.push(path)
  }
  return next
}

/** Resolve an inline-code token to a produced path (exact, or unique basename). */
export function resolveMention(value, paths) {
  if (!Array.isArray(paths) || paths.length === 0) return undefined
  if (paths.includes(value)) return value
  const matches = paths.filter((path) => basename(path) === value)
  return matches.length === 1 ? matches[0] : undefined
}

export function formatMessageClock(time, now = Date.now()) {
  const d = new Date(time)
  const n = new Date(now)
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) {
    return clock
  }
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
}

export function formatRunDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, '0')}秒` : `${seconds}秒`
}

export function formatLatencySeconds(ms) {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? String(Math.round(s * 10) / 10) : String(Math.round(s))
}

export function formatTokensPerSecond(tps) {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

export function emptyTurnState() {
  return {
    number: null,
    startTime: null,
    endTime: null,
    produced: [],
    calls: new Map(),
    firstStep: null,
    firstStepStartTime: null,
    firstStepFirstTokenTime: null,
    decodeMs: 0,
    outputTokens: 0,
    sampled: false,
    step: null,
    stepStartTime: null,
    stepFirstTokenTime: null,
    lastAssistantTime: null,
  }
}

export function usageOutputTokens(usage) {
  if (typeof usage !== 'object' || usage == null) return null
  const value = usage.outputTokens
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** Non-empty text / reasoning / tool-call deltas count as the first token. */
export function isTokenDelta(chunk) {
  if (!chunk) return false
  if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return chunk.text !== ''
  if (chunk.type === 'tool-call-delta') return (chunk.argumentsDelta ?? '') !== '' || chunk.name !== undefined
  return false
}

export function noteStepStart(state, event) {
  const step = event.data?.step
  state.step = step
  state.stepStartTime = event.time
  state.stepFirstTokenTime = null
  if (state.firstStep == null || step < state.firstStep) {
    state.firstStep = step
    state.firstStepStartTime = event.time
    state.firstStepFirstTokenTime = null
  }
}

export function noteToken(state, event, chunk) {
  if (!isTokenDelta(chunk)) return
  if (state.stepFirstTokenTime == null) state.stepFirstTokenTime = event.time
  if (state.step === state.firstStep && state.firstStepFirstTokenTime == null) {
    state.firstStepFirstTokenTime = event.time
  }
  if (state.firstStep == null && state.firstStepFirstTokenTime == null) {
    if (state.firstStepStartTime == null && state.startTime != null) {
      state.firstStepStartTime = state.startTime
    }
    state.firstStepFirstTokenTime = event.time
  }
}

export function noteAssistantUsage(state, event) {
  state.lastAssistantTime = event.time
  const tokens = usageOutputTokens(event.data?.usage)
  if (state.stepFirstTokenTime != null && tokens != null) {
    state.decodeMs += Math.max(0, event.time - state.stepFirstTokenTime)
    state.outputTokens += tokens
    state.sampled = true
  }
}

export function turnMetrics(state) {
  const metrics = {}
  if (state.lastAssistantTime != null) metrics.time = state.lastAssistantTime
  if (state.startTime != null && state.endTime != null) {
    metrics.runMs = Math.max(0, state.endTime - state.startTime)
  }
  if (state.firstStepStartTime != null && state.firstStepFirstTokenTime != null) {
    metrics.ttftMs = Math.max(0, state.firstStepFirstTokenTime - state.firstStepStartTime)
  }
  if (state.sampled && state.decodeMs > 0) {
    metrics.tokensPerSecond = state.outputTokens / (state.decodeMs / 1000)
  }
  return metrics
}

export function formatAnswerChrome(row, now = Date.now()) {
  if (row?.streaming) return ''
  const parts = []
  if (typeof row?.time === 'number') parts.push(formatMessageClock(row.time, now))
  if (typeof row?.runMs === 'number') parts.push(`用时 ${formatRunDuration(row.runMs)}`)
  if (typeof row?.ttftMs === 'number') parts.push(`首 token ${formatLatencySeconds(row.ttftMs)}秒`)
  if (typeof row?.tokensPerSecond === 'number') {
    parts.push(`${formatTokensPerSecond(row.tokensPerSecond)} tok/s`)
  }
  return parts.join(' · ')
}
