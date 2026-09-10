import { formatTokensPerSecond } from './deliverables.js'

export function formatTokens(n) {
  const scaled = (v) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

export function formatStatsDuration(ms) {
  const s = ms / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

export function billedInputTokens(usage) {
  if (!usage) return 0
  return (usage.uncachedInputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
}

export function contextOccupancy(pressure) {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}

export function statsLine(stats, usage) {
  if (!stats || !(stats.steps > 0 || billedInputTokens(usage) > 0 || (usage?.outputTokens ?? 0) > 0)) {
    if (!stats || stats.steps <= 0) {
      if (usage && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
        return tokenGroup(usage)
      }
      return ''
    }
  }
  const groups = []
  if (stats?.steps > 0) {
    groups.push(`${stats.turns} 轮 · ${stats.steps} 步`)
    const durations = []
    if (stats.llmMs > 0) durations.push(`LLM ${formatStatsDuration(stats.llmMs)}`)
    if (stats.toolMs > 0) durations.push(`工具调用 ${formatStatsDuration(stats.toolMs)}`)
    if (durations.length) groups.push(durations.join(' · '))
    const speeds = []
    if (stats.ttftSteps > 0) {
      speeds.push(`首 token 平均 ${formatStatsDuration(stats.ttftMs / stats.ttftSteps)}`)
    }
    if (stats.decodeMs > 0) {
      speeds.push(`${formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s`)
    }
    if (speeds.length) groups.push(speeds.join(' · '))
  }
  if (usage && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
    groups.push(tokenGroup(usage))
  }
  return groups.join(' | ')
}

function tokenGroup(usage) {
  const input = billedInputTokens(usage)
  const cache = input === 0 ? null : Math.round((usage.cacheReadTokens ?? 0) / input * 100)
  const tokens = `输入 ${formatTokens(input)} tok · 输出 ${formatTokens(usage.outputTokens ?? 0)} tok`
  return cache == null ? tokens : `缓存命中 ${cache}% | ${tokens}`
}
