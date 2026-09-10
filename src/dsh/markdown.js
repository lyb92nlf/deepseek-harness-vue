import { lexer } from 'marked'
import { resolveMention } from './deliverables.js'

function escape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeHref(href) {
  if (typeof href !== 'string') return ''
  const trimmed = href.trim()
  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) return trimmed
  return ''
}

function inline(tokens, produced) {
  if (!Array.isArray(tokens)) return escape(tokens ?? '')
  return tokens.map((token) => {
    switch (token.type) {
      case 'escape':
      case 'text':
        return token.tokens ? inline(token.tokens, produced) : escape(token.text)
      case 'strong':
        return `<strong>${inline(token.tokens, produced)}</strong>`
      case 'em':
        return `<em>${inline(token.tokens, produced)}</em>`
      case 'codespan': {
        const path = resolveMention(token.text, produced)
        if (path) {
          return `<code><button type="button" class="md-file" data-file="${escape(path)}" title="${escape(path)}">${escape(token.text)}</button></code>`
        }
        return `<code>${escape(token.text)}</code>`
      }
      case 'del':
        return `<del>${inline(token.tokens, produced)}</del>`
      case 'br':
        return '<br>'
      case 'link': {
        const href = safeHref(token.href)
        const body = token.tokens ? inline(token.tokens, produced) : escape(token.text)
        return href ? `<a href="${escape(href)}" target="_blank" rel="noreferrer">${body}</a>` : body
      }
      case 'image':
        return `<span class="md-image-alt">${escape(token.text || token.href || '')}</span>`
      default:
        return token.tokens ? inline(token.tokens, produced) : escape(token.text ?? '')
    }
  }).join('')
}

function list(token, produced) {
  const tag = token.ordered ? 'ol' : 'ul'
  const start = token.ordered && token.start > 1 ? ` start="${token.start}"` : ''
  const items = (token.items ?? []).map((item) => {
    const body = blocks(item.tokens ?? [], produced)
    return `<li>${body}</li>`
  }).join('')
  return `<${tag}${start}>${items}</${tag}>`
}

function table(token, produced) {
  const head = (token.header ?? []).map((cell) => `<th>${inline(cell.tokens, produced)}</th>`).join('')
  const body = (token.rows ?? []).map((row) => {
    const cells = row.map((cell) => `<td>${inline(cell.tokens, produced)}</td>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

function blocks(tokens, produced) {
  return (tokens ?? []).map((token) => {
    switch (token.type) {
      case 'space':
        return ''
      case 'heading':
        return `<h${token.depth}>${inline(token.tokens, produced)}</h${token.depth}>`
      case 'paragraph':
        return `<p>${inline(token.tokens, produced)}</p>`
      case 'text':
        return token.tokens ? `<p>${inline(token.tokens, produced)}</p>` : `<p>${escape(token.text)}</p>`
      case 'list':
        return list(token, produced)
      case 'code': {
        const lang = token.lang ? ` data-lang="${escape(token.lang)}"` : ''
        return `<pre class="md-code"${lang}><code>${escape(token.text)}</code></pre>`
      }
      case 'blockquote':
        return `<blockquote>${blocks(token.tokens, produced)}</blockquote>`
      case 'hr':
        return '<hr>'
      case 'table':
        return table(token, produced)
      case 'html':
        return `<p>${escape(token.text)}</p>`
      default:
        return token.tokens ? blocks(token.tokens, produced) : ''
    }
  }).join('')
}

/** GFM markdown → escaped HTML (no raw HTML passthrough). */
export function renderMarkdown(text, produced) {
  if (!text) return ''
  return blocks(lexer(text, { gfm: true }), produced)
}

export function asTodos(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item.content !== 'string' || item.content.trim() === '') return []
    const status = item.status === 'completed' || item.status === 'in_progress' ? item.status : 'pending'
    return [{ content: item.content, status }]
  })
}

export function todoProgress(todos) {
  const done = todos.filter((item) => item.status === 'completed').length
  const active = todos.filter((item) => item.status === 'in_progress').length
  const pending = todos.length - done - active
  return [
    done > 0 ? `${done} 已完成` : '',
    active > 0 ? `${active} 进行中` : '',
    pending > 0 ? `${pending} 待处理` : '',
  ].filter(Boolean).join(' · ')
}
