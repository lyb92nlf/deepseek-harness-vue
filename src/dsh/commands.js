import { listCommands, listSkills } from './rpc.js'

/** Client-only rows the official web registers locally (not on Host `commands/list`). */
const CLIENT_COMMANDS = [
  { name: 'model', description: '选择本会话使用的模型', action: 'model' },
]

/** Host catalog used only if the Typert remote is unreachable. */
const HOST_FALLBACK = [
  { name: 'plan', description: 'Enter or leave plan mode', hint: '[off|message]' },
  { name: 'compact', description: 'Compact older conversation history' },
  { name: 'goal', description: 'set or view the goal for a long-running task', hint: '[<objective>|clear|edit <objective>|pause|resume]' },
  { name: 'permission', description: 'Switch the permission preset (sandbox mode + approval policy)', hint: '<preset>' },
  { name: 'feedback', description: 'record feedback about this session', hint: '<text>' },
  { name: 'export', description: 'Download this Session log as a ZIP archive' },
]

const HINT_ZH = {
  plan: '描述你的任务以生成计划',
  goal: '输入目标，智能体将持续执行',
}

export const EMPTY_CATALOG = { commands: [], skills: [] }

export function hintFor(item) {
  if (!item) return ''
  return HINT_ZH[item.name] ?? item.hint ?? ''
}

function asCommand(item) {
  return {
    source: 'command',
    name: item.name,
    description: item.description ?? '',
    hint: item.input?.hint ?? item.hint,
    action: item.action,
  }
}

function asSkill(item) {
  return {
    source: 'skill',
    name: item.name,
    description: item.modelInvocable === false
      ? `仅用户 · ${item.description ?? ''}`
      : (item.description ?? ''),
  }
}

function mergeCommands(host) {
  const seen = new Set(host.map((item) => item.name))
  const extra = CLIENT_COMMANDS.filter((item) => !seen.has(item.name)).map(asCommand)
  return [...host.map(asCommand), ...extra]
}

/** Query after a leading `/` while the line is still a bare token (no args). */
export function slashQuery(draft) {
  if (!draft.startsWith('/')) return null
  const space = draft.search(/\s/u)
  if (space !== -1) return null
  return draft.slice(1)
}

function fuzzyScore(name, query) {
  if (query === '') return 0
  const lower = name.toLowerCase()
  const q = query.toLowerCase()
  if (lower.startsWith(q)) return 1000 - (lower.length - q.length)
  if (lower.includes(q)) return 500 - lower.indexOf(q)
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i += 1) {
    if (lower[i] === q[qi]) qi += 1
  }
  return qi === q.length ? 100 - (lower.length - q.length) : undefined
}

export function filterGroup(items, query) {
  if (query === null) return items
  const ranked = []
  items.forEach((item, index) => {
    const score = fuzzyScore(item.name, query)
    if (score !== undefined) ranked.push({ item, score, index })
  })
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.map((row) => row.item)
}

/** Leading `/name` claim: Host commands that declare `input` keep a ghost hint. */
export function parseClaim(draft, catalog) {
  const match = draft.match(/^\/([^\s/]+)(\s?)([\s\S]*)$/u)
  if (!match) return null
  const item = catalog.commands.find((row) => row.name === match[1] && hintFor(row))
  if (!item) return null
  if (match[2] === '' && match[3] !== '') return null
  const args = match[3]
  return {
    name: item.name,
    token: `/${item.name}`,
    hint: hintFor(item),
    args,
    showHint: args.trim() === '',
  }
}

export function commandLine(item) {
  return hintFor(item) || item.source === 'skill' ? `/${item.name} ` : `/${item.name}`
}

export async function loadCatalog(sessionId) {
  if (!sessionId) {
    return { commands: mergeCommands(HOST_FALLBACK), skills: [] }
  }
  const [commands, skills] = await Promise.all([
    listCommands(sessionId).then((listed) => {
      const items = Array.isArray(listed) ? listed : []
      return mergeCommands(items)
    }).catch(() => mergeCommands(HOST_FALLBACK)),
    listSkills(sessionId).then((listed) => {
      const items = listed?.skills ?? (Array.isArray(listed) ? listed : [])
      return items.map(asSkill)
    }).catch(() => []),
  ])
  return { commands, skills }
}
