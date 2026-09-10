/**
 * Unary RPC against the local dsh Host (`POST /api/<method>`).
 * The browser must hit the Vite proxy so Host/Origin stay same-origin.
 */

export async function dshCall(method, payload, signal) {
  const rpcId = crypto.randomUUID()
  const res = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method,
      payload,
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`transport failure for /api/${method}: HTTP ${res.status}`)
  }
  const body = await res.json()
  if (body?.type !== 'server-response' || body.rpcId !== rpcId) {
    throw new Error(`malformed server-response for ${method}`)
  }
  if (!body.result?.ok) {
    const err = body.result?.error
    throw new Error(`${err?.code ?? 'error'}: ${err?.message ?? 'request failed'}`)
  }
  return body.result.value
}

export function createSession(payload = {}) {
  return dshCall('session.create', payload)
}

export function listSessions() {
  return dshCall('session.list', {})
}

export function listWorkspaces() {
  return dshCall('workspace.list', {})
}

export function archiveSession(sessionId) {
  return dshCall('workspace.archiveSession', { sessionId })
}

export function sessionHistory(sessionId, extra = {}) {
  return dshCall('session.history', { sessionId, ...extra })
}

export function sessionModels(sessionId) {
  return dshCall('session.models', { sessionId })
}

export function selectModel(sessionId, selection) {
  return dshCall('session.selectModel', { sessionId, ...selection })
}

export function openPath(path) {
  return dshCall('host.openPath', { path })
}

export function prompt(sessionId, content, mode = 'queue') {
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content
  return dshCall('session.prompt', {
    sessionId,
    mode,
    content: blocks,
    clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}

export function forkSession(sessionId, atSeq) {
  return dshCall('session.fork', {
    sessionId,
    ...(typeof atSeq === 'number' ? { atSeq: Math.floor(atSeq) } : {}),
  })
}

export function renameSession(sessionId, title) {
  return dshCall('session.rename', { sessionId, title })
}

export function sessionAttachment(sessionId, attachmentId) {
  return dshCall('session.attachment', { sessionId, attachmentId })
}

/** Typert Remote on the shared `/api` channel (`commands/list`, not fetch-BFF `command.list`). */
export async function dshRemote(endpoint, args, signal) {
  const rpcId = crypto.randomUUID()
  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: endpoint,
      payload: { args },
    }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`transport failure for /api/${endpoint}: HTTP ${res.status}`)
  }
  const body = await res.json()
  if (body?.type !== 'server-response' || body.rpcId !== rpcId) {
    throw new Error(`malformed server-response for ${endpoint}`)
  }
  if (!body.result?.ok) {
    const err = body.result?.error
    throw new Error(`${err?.code ?? 'error'}: ${err?.message ?? 'request failed'}`)
  }
  return body.result.value
}

export function listCommands(sessionId) {
  return dshRemote('commands/list', { agentId: sessionId })
}

export function listSkills(sessionId) {
  return dshCall('skill.list', { sessionId })
}

export function cancel(sessionId) {
  return dshCall('session.cancel', { sessionId })
}

export function updateQueue(sessionId, itemId, action) {
  return dshCall('session.updateQueue', { sessionId, itemId, action })
}

/** Answer a mux approval/question wait. Echo the requested frame's rpcId. */
export async function respond(rpcId, value) {
  const res = await fetch('/api/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-response',
      rpcId,
      result: { ok: true, value },
    }),
  })
  if (!res.ok) throw new Error(`transport failure for /api/respond: HTTP ${res.status}`)
  const body = await res.json()
  if (body?.accepted !== true) {
    throw new Error(body?.reason === 'not-pending' ? '该请求已失效' : '回复未被 Host 接受')
  }
  return body
}
