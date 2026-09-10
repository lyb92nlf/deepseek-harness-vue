import { CHAT_CARD_MAX_LINES, headTailCap } from './cap.js'

export const CHAT_SEARCH_MAX_LINES = CHAT_CARD_MAX_LINES
export { headTailCap }

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

function firstLine(text) {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

/**
 * Args-derived summary for grep/glob: `pattern` (or `query`) from the call JSON.
 * @param {string} argsRaw
 * @returns {string}
 */
export function searchSummaryFromArgs(argsRaw) {
  try {
    const parsed = JSON.parse(argsRaw)
    if (parsed && typeof parsed === 'object') {
      for (const key of ['pattern', 'query']) {
        const value = parsed[key]
        if (typeof value === 'string' && value !== '') return firstLine(value)
      }
    }
  } catch {
    // Streaming / truncated JSON: fall through to the raw string.
  }
  return typeof argsRaw === 'string' ? firstLine(argsRaw) : ''
}

function isLineMatch(value) {
  const record = asRecord(value)
  return record !== null
    && typeof record.lineNumber === 'number'
    && typeof record.line === 'string'
}

function isFileGroup(value) {
  const record = asRecord(value)
  return record !== null
    && typeof record.path === 'string'
    && Array.isArray(record.matches)
    && record.matches.every(isLineMatch)
}

/**
 * Narrow `tool/result` meta to a search card, the same fields SearchBlock draws.
 * @param {unknown} meta
 * @returns {{ kind: 'paths', paths: string[], truncated: boolean, total: number }
 *   | { kind: 'matches', files: { path: string, matches: { lineNumber: number, line: string }[] }[], truncated: boolean, total: number }
 *   | null}
 */
export function searchViewFromMeta(meta) {
  const record = asRecord(meta)
  if (record === null) return null
  const { truncated, total } = record
  if (typeof truncated !== 'boolean' || typeof total !== 'number') return null
  if (record.shape === 'matches') {
    if (!Array.isArray(record.files) || !record.files.every(isFileGroup)) return null
    return { kind: 'matches', files: record.files, truncated, total }
  }
  if (record.shape === 'paths') {
    if (!Array.isArray(record.paths) || !record.paths.every((path) => typeof path === 'string')) return null
    return { kind: 'paths', paths: record.paths, truncated, total }
  }
  return null
}

function pathsFromOutput(output) {
  if (!output || output === 'No files found') {
    return { kind: 'paths', paths: [], truncated: false, total: 0 }
  }
  const paths = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    if (line.startsWith('(Showing ') || line.startsWith('Full sorted')) break
    paths.push(line)
  }
  return { kind: 'paths', paths, truncated: false, total: paths.length }
}

function cardFromSearchView(resultView, output) {
  if (resultView?.card !== 'search') return null
  const truncated = resultView.truncated
  const total = resultView.total
  if (typeof truncated !== 'boolean' || typeof total !== 'number') return null
  const recovery = truncated && output ? output : undefined
  const title = typeof resultView.title === 'string' ? resultView.title : undefined
  if (resultView.shape === 'matches') {
    if (!Array.isArray(resultView.files) || !resultView.files.every(isFileGroup)) return null
    return { kind: 'matches', files: resultView.files, truncated, total, recovery, title }
  }
  if (resultView.shape === 'paths') {
    if (!Array.isArray(resultView.paths) || !resultView.paths.every((path) => typeof path === 'string')) return null
    return { kind: 'paths', paths: resultView.paths, truncated, total, recovery, title }
  }
  return null
}

/**
 * Search-card model for a settled glob/grep result.
 * Prefers the mux `view` (what the official UI draws), then `tool/result` meta, then glob text.
 * @param {object} event - session `tool/result` event
 * @param {string} output - flattened result text
 * @param {string} toolName
 * @param {object | undefined} presented - mux `view` (`{ for: 'result', view }`)
 * @returns {object | null}
 */
export function searchCardFromResult(event, output, toolName, presented) {
  if (event.data?.error) return null
  const fromView = presented?.for === 'result' ? cardFromSearchView(presented.view, output) : null
  if (fromView !== null) return fromView
  const meta = searchViewFromMeta(event.data?.meta)
  if (meta !== null) {
    return {
      ...meta,
      recovery: meta.truncated && output ? output : undefined,
      title: undefined,
    }
  }
  if (toolName !== 'glob') return null
  const fallback = pathsFromOutput(output)
  return { ...fallback, recovery: undefined, title: undefined }
}

/**
 * Flatten a search card into render rows (file header + matches, or one path each).
 * @param {object} card
 * @param {Record<string, boolean>} collapsed
 */
export function searchRows(card, collapsed) {
  if (card.kind === 'paths') return card.paths.map((path) => ({ type: 'path', path }))
  const rows = []
  card.files.forEach((file, index) => {
    const isCollapsed = Boolean(collapsed[index])
    rows.push({
      type: 'file',
      path: file.path,
      count: file.matches.length,
      index,
      collapsed: isCollapsed,
    })
    if (isCollapsed) return
    for (const match of file.matches) {
      rows.push({
        type: 'match',
        lineNumber: match.lineNumber,
        line: match.line,
        fileIndex: index,
        key: `${index}:${match.lineNumber}`,
      })
    }
  })
  return rows
}

/**
 * Clipboard text for the whole structured result, ignoring the height cap.
 * @param {object} card
 * @returns {string}
 */
export function searchCopyText(card) {
  if (card.kind === 'paths') return card.paths.join('\n')
  return card.files
    .map((file) => [file.path, ...file.matches.map((match) => `${match.lineNumber}: ${match.line}`)].join('\n'))
    .join('\n\n')
}

/**
 * Banner summary: `N 个路径` / `N 处匹配 · K 个文件`, or `显示 X / 共 N …` when capped.
 * @param {object} card
 * @returns {string}
 */
export function searchSummaryText(card) {
  const shown = card.kind === 'paths'
    ? card.paths.length
    : card.files.reduce((sum, file) => sum + file.matches.length, 0)
  const count = card.truncated ? `显示 ${shown} / 共 ${card.total}` : `${shown}`
  return card.kind === 'paths'
    ? `${count} 个路径`
    : `${count} 处匹配 · ${card.files.length} 个文件`
}
