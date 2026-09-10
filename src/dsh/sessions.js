export const HISTORY_PAGE = 50
const HISTORY_PAGES_MAX = 20
export const SESSION_STORAGE_KEY = 'dsh-vue-chat.sessionId'
export const VIEW_STORAGE_KEY = 'dsh-vue-chat.workspace.view'
export const UNGROUPED_KEY = ''

function basename(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return ''
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const part = trimmed.split(/[/\\]/).pop()
  return part ?? ''
}

/**
 * Sidebar label: blank rows are "新会话"; otherwise durable title, cwd basename, then short id.
 * @param {object} item - session.list row
 */
export function sessionLabel(item) {
  if (item.blank) return '新会话'
  const title = item.projections?.values?.title
  if (typeof title === 'string' && title.trim() !== '') return title
  if (typeof item.title === 'string' && item.title.trim() !== '') return item.title
  const base = basename(item.cwd)
  if (base !== '') return base
  const id = item.sessionId ?? ''
  return id.length > 8 ? id.slice(0, 8) : id
}

function isTopLevel(item) {
  return item.origin !== 'subagent'
}

/** Official sidebar order: children sit under their parent; forks are ordinary rows, not subagents. */
export function flattenLineage(items) {
  const byId = new Map(items.map((item) => [item.sessionId, item]))
  const children = new Map()
  const roots = []
  for (const item of items) {
    if (item.parentSessionId && byId.has(item.parentSessionId)) {
      const list = children.get(item.parentSessionId) ?? []
      list.push(item)
      children.set(item.parentSessionId, list)
    } else {
      roots.push(item)
    }
  }
  roots.sort(byRecency)
  for (const list of children.values()) list.sort(byRecency)
  const out = []
  const visited = new Set()
  const walk = (item, depth) => {
    if (visited.has(item.sessionId)) return
    visited.add(item.sessionId)
    out.push({ ...item, depth })
    for (const child of children.get(item.sessionId) ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  for (const item of items) {
    if (!visited.has(item.sessionId)) walk(item, 0)
  }
  return out
}

/** Same numbering as the official `increaseTitle` fork rename. */
export function increasedForkTitle(title) {
  const ascii = /^(.*?)\((\d+)\)$/u.exec(title)
  if (ascii?.[1] !== undefined && ascii[2] !== undefined) {
    return `${ascii[1]}(${Number(ascii[2]) + 1})`
  }
  const fullWidth = /^(.*?)（(\d+)）$/u.exec(title)
  if (fullWidth?.[1] !== undefined && fullWidth[2] !== undefined) {
    return `${fullWidth[1]}（${Number(fullWidth[2]) + 1}）`
  }
  return `${title} (1)`
}

function isVisible(item, currentId, archived) {
  return isTopLevel(item)
    && !archived.has(item.sessionId)
    && (!item.blank || item.sessionId === currentId)
}

function byRecency(a, b) {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
}

/** Top-level sessions only; hide unselected blanks the way the official sidebar does. */
export function visibleSessions(items, currentId, archivedIds = []) {
  const archived = new Set(archivedIds)
  return flattenLineage(
    items.filter((item) => isVisible(item, currentId, archived)),
  )
}

/** Workspace that currently owns this session, if any. */
export function workspaceOf(sessionId, workspaces) {
  return workspaces.find((workspace) => workspace.sessionIds?.includes(sessionId))
}

/** Most recently active workspace, Host order as the tie-break. */
export function recentWorkspaceId(workspaces, sessions) {
  const byId = new Map(sessions.map((item) => [item.sessionId, item]))
  let selected
  let selectedTime = Number.NEGATIVE_INFINITY
  for (const workspace of workspaces) {
    let latest = Number.NEGATIVE_INFINITY
    for (const id of workspace.sessionIds ?? []) {
      const item = byId.get(id)
      if (item) latest = Math.max(latest, item.updatedAt ?? 0)
    }
    if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt ?? '') || 0
    if (selected === undefined || latest > selectedTime) {
      selected = workspace.workspaceId
      selectedTime = latest
    }
  }
  return selected
}

/** Reusable blank in a workspace, matching official connectWorkspace. */
export function blankInWorkspace(sessions, workspace, archivedIds = []) {
  const archived = new Set(archivedIds)
  return sessions.find((item) => (
    item.blank
    && item.cwd === workspace.path
    && workspace.sessionIds?.includes(item.sessionId)
    && !archived.has(item.sessionId)
  ))
}

/** Reusable ungrouped blank (not listed on any workspace). */
export function blankUngrouped(sessions, workspaces, archivedIds = []) {
  const archived = new Set(archivedIds)
  const accounted = new Set(workspaces.flatMap((workspace) => workspace.sessionIds ?? []))
  return sessions.find((item) => (
    item.blank
    && isTopLevel(item)
    && !accounted.has(item.sessionId)
    && !archived.has(item.sessionId)
  ))
}

/**
 * Official New Session target: explicit workspace, else the current session's
 * workspace, else the most recently active workspace.
 */
export function newSessionTarget(workspaces, sessions, currentId, explicitId) {
  if (explicitId) return explicitId
  const current = currentId ? workspaceOf(currentId, workspaces) : undefined
  return current?.workspaceId ?? recentWorkspaceId(workspaces, sessions)
}

/** Group sessions the way the official sidebar does (workspace sections + 未分组). */
export function deriveSessionGroups(items, workspaces, currentId, archivedIds, expandedKeys) {
  const archived = new Set(archivedIds)
  const accounted = new Set()
  const groups = []
  for (const workspace of workspaces) {
    const members = []
    for (const id of workspace.sessionIds ?? []) {
      const item = items.find((session) => session.sessionId === id)
      if (!item) continue
      accounted.add(id)
      if (isVisible(item, currentId, archived)) members.push(item)
    }
    const ordered = flattenLineage(members)
    const key = workspace.workspaceId
    const expanded = expandedKeys.has(key)
    groups.push({
      key,
      workspaceId: key,
      label: workspace.title || workspace.path || key,
      sessionCount: ordered.length,
      containsCurrent: ordered.some((item) => item.sessionId === currentId),
      expanded,
      sessions: expanded ? ordered : [],
    })
  }
  const stray = flattenLineage(
    items.filter((item) => isVisible(item, currentId, archived) && !accounted.has(item.sessionId)),
  )
  if (stray.length > 0) {
    const expanded = expandedKeys.has(UNGROUPED_KEY)
    groups.push({
      key: UNGROUPED_KEY,
      workspaceId: undefined,
      label: '未分组',
      sessionCount: stray.length,
      containsCurrent: stray.some((item) => item.sessionId === currentId),
      expanded,
      sessions: expanded ? stray : [],
    })
  }
  return groups
}

export function applyWorkspaceFrame(workspaces, frame) {
  if (frame.type === 'host/workspace-changed' && frame.workspace) {
    const next = frame.workspace
    const index = workspaces.findIndex((item) => item.workspaceId === next.workspaceId)
    if (index === -1) return [...workspaces, next]
    return workspaces.map((item, i) => (i === index ? next : item))
  }
  if (frame.type === 'host/workspace-removed') {
    return workspaces.filter((item) => item.workspaceId !== frame.workspaceId)
  }
  if (frame.type === 'host/workspace-order-changed' && Array.isArray(frame.workspaceIds)) {
    const byId = new Map(workspaces.map((item) => [item.workspaceId, item]))
    const ordered = frame.workspaceIds.map((id) => byId.get(id)).filter(Boolean)
    for (const item of workspaces) {
      if (!frame.workspaceIds.includes(item.workspaceId)) ordered.push(item)
    }
    return ordered
  }
  return workspaces
}

export function readViewState() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY)
    if (!raw) return { groupBy: 'workspace', expanded: {} }
    const parsed = JSON.parse(raw)
    return {
      groupBy: parsed.groupBy === 'flat' ? 'flat' : 'workspace',
      expanded: parsed.expanded && typeof parsed.expanded === 'object' ? parsed.expanded : {},
    }
  } catch {
    return { groupBy: 'workspace', expanded: {} }
  }
}

export function writeViewState(state) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private mode: grouping still works in-memory.
  }
}

/**
 * Walk history pages backwards until the log head.
 * @param {string} sessionId
 * @param {(sessionId: string, extra?: object) => Promise<{ events: object[], hasMore: boolean }>} historyFn
 */
export async function loadHistoryPage(sessionId, historyFn, extra = {}) {
  const page = await historyFn(sessionId, { maxMessages: HISTORY_PAGE, ...extra })
  return {
    events: page.events ?? [],
    hasMore: Boolean(page.hasMore),
    projections: page.projections,
  }
}

export async function loadAllHistory(sessionId, historyFn) {
  const first = await historyFn(sessionId, { maxMessages: HISTORY_PAGE })
  const events = [...(first.events ?? [])]
  let hasMore = Boolean(first.hasMore)
  let pages = 1
  while (hasMore && events[0]?.event?.seq !== undefined && pages < HISTORY_PAGES_MAX) {
    const older = await historyFn(sessionId, {
      maxMessages: HISTORY_PAGE,
      beforeSeq: events[0].event.seq,
    })
    if (!(older.events ?? []).length) break
    events.unshift(...(older.events ?? []))
    hasMore = Boolean(older.hasMore)
    pages += 1
  }
  return { events, projections: first.projections }
}

export function relativeTime(updatedAt, now = Date.now()) {
  const delta = Math.max(0, now - updatedAt)
  if (delta < 45_000) return '刚刚'
  const minutes = Math.round(delta / 60_000)
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}天前`
  return `${Math.round(days / 30)}个月前`
}

export function readStoredSessionId() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeStoredSessionId(id) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, id)
  } catch {
    // Private mode / disabled storage: selection still works in-memory.
  }
}
