import { searchCardFromResult } from './search.js'

const VARIANT_TITLES = {
  search: 'Search',
  read: 'Read',
  bash: 'Bash',
  write: 'Write',
  edit: 'Edit',
  code: 'Code',
  skill: 'Skill',
  others: 'Tool call',
}

const TOOL_VARIANTS = {
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
  skill: 'skill',
}

const TOOL_TITLES = {
  glob: 'Glob',
  grep: 'Grep',
  web_search: 'Search',
  web_fetch: 'Fetch',
  pwsh: 'Pwsh',
  todo_write: '更新任务清单',
}

const SUMMARY_KEYS = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  skill: ['name'],
  others: [],
}

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

function firstLine(text) {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function parseArgs(argsRaw) {
  try {
    return JSON.parse(argsRaw)
  } catch {
    return undefined
  }
}

function pickString(args, keys) {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

function classify(name) {
  return TOOL_VARIANTS[name] ?? 'others'
}

const FILE_PATH_VARIANTS = new Set(['read', 'write', 'edit'])

function deriveFilePath(variant, argsRaw) {
  if (!FILE_PATH_VARIANTS.has(variant)) return undefined
  const parsed = asRecord(parseArgs(argsRaw))
  if (parsed === null) return undefined
  const picked = pickString(parsed, ['path', 'file_path'])
  return picked === undefined ? undefined : firstLine(picked)
}

function todoSummary(argsRaw) {
  const parsed = parseArgs(argsRaw)
  const record = asRecord(parsed)
  if (record === null || !Array.isArray(record.todos)) return null
  const todos = record.todos
  const done = todos.filter((item) => asRecord(item)?.status === 'completed').length
  const active = todos.filter((item) => asRecord(item)?.status === 'in_progress')
  const first = asRecord(active[0])?.content
  const named = typeof first === 'string' && first.trim() !== ''
  const head = `${done}/${todos.length} 已完成`
  return named ? `${head} · ${first}` : head
}

function deriveSummary(variant, argsRaw) {
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null) return firstLine(argsRaw)
  const picked = pickString(parsed, SUMMARY_KEYS[variant] ?? [])
  if (picked !== undefined) return firstLine(picked)
  for (const value of Object.values(parsed)) {
    if (typeof value === 'string' && value !== '') return firstLine(value)
  }
  return firstLine(argsRaw)
}

function deriveBody(variant, argsRaw) {
  if (argsRaw === '') return null
  const parsed = parseArgs(argsRaw)
  if (parsed === undefined) return argsRaw
  if (variant === 'code' && typeof parsed === 'object' && parsed !== null) {
    const code = parsed.code
    if (typeof code === 'string' && code !== '') return code
  }
  return JSON.stringify(parsed, null, 2)
}

function resultViewOf(presented) {
  return presented?.for === 'result' ? presented.view : null
}

function callViewOf(presented) {
  return presented?.for === 'call' ? presented.view : null
}

function isReadLine(value) {
  const record = asRecord(value)
  return record !== null
    && typeof record.number === 'number'
    && typeof record.text === 'string'
}

function readCardFromView(view, event, fallbackLabel) {
  if (view?.card === 'read' && Array.isArray(view.lines) && view.lines.every(isReadLine)) {
    return {
      path: typeof view.path === 'string' ? view.path : fallbackLabel,
      label: (typeof view.title === 'string' && view.title !== '' ? view.title : view.path) ?? fallbackLabel,
      lines: view.lines.map((line) => ({ number: line.number, text: line.text })),
      totalLines: typeof view.totalLines === 'number' ? view.totalLines : view.lines.length,
      lang: typeof view.lang === 'string' ? view.lang : '',
    }
  }
  const meta = asRecord(event.data?.meta)
  if (meta !== null && Array.isArray(meta.lines) && meta.lines.every(isReadLine)) {
    return {
      path: typeof meta.path === 'string' ? meta.path : fallbackLabel,
      label: (typeof meta.path === 'string' ? meta.path : fallbackLabel),
      lines: meta.lines.map((line) => ({ number: line.number, text: line.text })),
      totalLines: typeof meta.totalLines === 'number' ? meta.totalLines : meta.lines.length,
      lang: typeof meta.lang === 'string' ? meta.lang : '',
    }
  }
  return null
}

function promptCwd(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return ''
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const segment = trimmed.split(/[/\\]/).pop()
  return segment === undefined || segment === '' ? cwd : segment
}

function terminalCardFromViews(callView, resultView, prior) {
  if (resultView?.card === 'terminal') {
    return {
      command: resultView.title ?? callView?.title ?? prior?.command ?? '',
      cwd: promptCwd(callView?.cwd ?? prior?.cwd),
      output: typeof resultView.output === 'string' ? resultView.output : '',
      exitCode: typeof resultView.exitCode === 'number' ? resultView.exitCode : undefined,
      signal: typeof resultView.signal === 'string' ? resultView.signal : undefined,
      running: false,
    }
  }
  if (callView?.card === 'terminal') {
    return {
      command: callView.title ?? '',
      cwd: promptCwd(callView.cwd),
      output: '',
      running: true,
    }
  }
  return prior ?? null
}

function terminalFailed(card) {
  if (!card || card.running) return false
  return (card.exitCode !== undefined && card.exitCode !== 0) || card.signal !== undefined
}

function narrowDiffs(diffs) {
  if (!Array.isArray(diffs) || diffs.length === 0) return null
  const out = []
  for (const hunk of diffs) {
    const record = asRecord(hunk)
    if (record === null || typeof record.path !== 'string') return null
    if (record.oldText !== null && typeof record.oldText !== 'string') return null
    if (typeof record.newText !== 'string') return null
    out.push({ path: record.path, oldText: record.oldText, newText: record.newText })
  }
  return out
}

function diffCardFromView(view, prior) {
  if (view?.card === 'diff') {
    const diffs = narrowDiffs(view.diffs)
    return diffs === null ? null : { diffs }
  }
  return prior ?? null
}

function webCardFromView(view) {
  if (view?.card !== 'web') return null
  if (view.kind === 'search') {
    return {
      kind: 'search',
      answer: typeof view.answer === 'string' ? view.answer : '',
      sources: Array.isArray(view.sources)
        ? view.sources.map((source) => ({
          url: typeof source?.url === 'string' ? source.url : '',
          title: typeof source?.title === 'string' ? source.title : '',
          snippet: typeof source?.snippet === 'string' ? source.snippet : '',
          publishedAt: typeof source?.publishedAt === 'string' ? source.publishedAt : '',
        })).filter((source) => source.url !== '')
        : [],
      truncated: view.truncated === true,
    }
  }
  if (view.kind === 'fetch') {
    return {
      kind: 'fetch',
      url: typeof view.url === 'string' ? view.url : '',
      statusCode: typeof view.statusCode === 'number' ? view.statusCode : 0,
      truncated: view.truncated === true,
    }
  }
  return null
}

/**
 * One conversation tool row at call time.
 * @param {string} name
 * @param {string} callId
 * @param {string} argsRaw
 * @param {object | undefined} presented - mux `{ for: 'call', view }`
 */
export function createToolRow(name, callId, argsRaw, presented) {
  const variant = classify(name)
  const toolTitle = TOOL_TITLES[name]
  const title = name === 'skill' ? 'Skill' : (toolTitle ?? VARIANT_TITLES[variant])
  const parsed = parseArgs(argsRaw)
  const parsedRecord = asRecord(parsed)
  const todo = name === 'todo_write' ? todoSummary(argsRaw) : null
  const base = todo ?? deriveSummary(variant, argsRaw)
  const summary = variant === 'others' && name !== '' && toolTitle === undefined
    ? `${name} · ${base}`
    : base
  const row = {
    type: name === 'skill' ? 'skill' : 'tool',
    variant,
    name,
    callId,
    title,
    summary: name === 'skill'
      ? (parsedRecord !== null ? (pickString(parsedRecord, ['name']) ?? base) : base)
      : summary,
    state: 'running',
    output: '',
    errorSummary: null,
    body: name === 'skill' || name === 'todo_write' || variant === 'search' || variant === 'read' || variant === 'bash' || variant === 'write' || variant === 'edit'
      ? null
      : deriveBody(variant, argsRaw),
    filePath: deriveFilePath(variant, argsRaw),
    search: null,
    read: null,
    terminal: null,
    diff: null,
    web: null,
  }
  const callView = callViewOf(presented)
  if (callView?.card === 'terminal') {
    row.terminal = terminalCardFromViews(callView, null, null)
    if (typeof callView.description === 'string' && callView.description !== '') {
      row.summary = callView.description
    }
  }
  if (callView?.card === 'diff') {
    row.diff = diffCardFromView(callView, null)
  }
  return row
}

/**
 * Fold a settled tool/result into the matching row.
 * @param {object} row
 * @param {object} event
 * @param {string} output
 * @param {object | undefined} presented
 * @param {boolean} failed
 */
export function applyToolResult(row, event, output, presented, failed) {
  row.output = output
  row.errorSummary = failed && output ? firstLine(output) : null
  if (failed) {
    row.state = 'error'
    row.search = null
    row.read = null
    row.terminal = null
    row.diff = null
    row.web = null
    return
  }
  const resultView = resultViewOf(presented)
  row.search = searchCardFromResult(event, output, row.name, presented)
  row.read = readCardFromView(resultView, event, row.summary)
  row.terminal = resultView?.card === 'terminal'
    ? terminalCardFromViews(null, resultView, row.terminal)
    : null
  row.diff = resultView?.card === 'diff' ? diffCardFromView(resultView, null) : null
  row.web = webCardFromView(resultView)
  if (row.search?.title) row.summary = row.search.title
  row.state = terminalFailed(row.terminal) ? 'error' : 'ok'
}

export function toolHasCard(row) {
  return Boolean(row.search || row.read || row.terminal || row.diff || row.web)
}

export function toolCanExpand(row) {
  return toolHasCard(row) || Boolean(row.output) || Boolean(row.body)
}

/** Collapsed summary is an openable workspace path (official Read/Write/Edit). */
export function toolFileLink(row) {
  return Boolean(row.filePath) && row.state !== 'error'
}
