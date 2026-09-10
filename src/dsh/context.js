/** Project durable user/message sources the way dsh-client-runtime does. */

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

function readString(record, key) {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function collect(source, member, field) {
  const list = source[member]
  if (!Array.isArray(list)) return []
  const seen = []
  for (const entry of list) {
    const record = asRecord(entry)
    const value = record === null ? null : readString(record, field)
    if (value !== null && !seen.includes(value)) seen.push(value)
  }
  return seen
}

export function contextProvenance(source) {
  const record = asRecord(source)
  const kind = record === null ? null : readString(record, 'kind')
  if (record === null || kind === null) return { role: 'inject', label: null }
  switch (kind) {
    case 'session-reference':
      return { role: 'recall', label: collect(record, 'references', 'label').join(', ') || kind }
    case 'agent-instructions':
      return { role: 'inject', label: collect(record, 'changes', 'path').join(', ') || kind }
    case 'plugin':
      return { role: 'inject', label: readString(record, 'plugin') ?? kind }
    case 'skill-invocation':
      return { role: 'inject', label: readString(record, 'name') ?? kind }
    default:
      return { role: 'inject', label: kind }
  }
}

function instructionFiles(source) {
  const record = asRecord(source)
  const list = record === null ? undefined : record.changes
  if (!Array.isArray(list)) return []
  const files = []
  const seen = new Set()
  const baseline = record.baseline === true
  for (const entry of list) {
    const change = asRecord(entry)
    if (change === null) continue
    const path = change.path
    if (typeof path !== 'string' || path === '' || seen.has(path)) continue
    seen.add(path)
    const action = change.action
    let actionLabel = '已载入'
    if (action === 'remove') actionLabel = '已移除'
    else if (!baseline) actionLabel = action === 'set' ? '已添加' : '已更新'
    files.push({ path, actionLabel })
  }
  return files
}

function catalogEntries(source) {
  const record = asRecord(source)
  const list = record === null ? undefined : record.entries
  if (!Array.isArray(list)) return []
  const entries = []
  for (const item of list) {
    const entry = asRecord(item)
    if (entry === null) continue
    if (typeof entry.name !== 'string' || entry.name === '') continue
    entries.push({
      name: entry.name,
      description: typeof entry.description === 'string' ? entry.description : '',
    })
  }
  return entries
}

export function contextRow(event) {
  const source = event.data?.source
  const provenance = contextProvenance(source)
  const form = asRecord(source)?.form
  return {
    type: 'context',
    title: provenance.role === 'recall' ? '上下文召回' : '上下文注入',
    label: provenance.label,
    files: form === 'instructions' ? instructionFiles(source) : [],
    entries: form === 'catalog' ? catalogEntries(source) : [],
    text: Array.isArray(event.data?.content)
      ? event.data.content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
      : '',
  }
}
