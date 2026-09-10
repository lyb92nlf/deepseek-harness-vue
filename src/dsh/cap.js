/**
 * Head/tail height-cap arithmetic shared by search / read / diff cards.
 * Split is `ceil(maxLines / 2)` head rows and the remainder as tail.
 * @param {number} total
 * @param {number} maxLines
 * @param {boolean} expanded
 */
export function headTailCap(total, maxLines, expanded) {
  const hidden = total - maxLines
  const headLines = Math.ceil(maxLines / 2)
  return {
    hidden,
    capped: hidden > 0 && !expanded,
    headLines,
    tailLines: maxLines - headLines,
  }
}

/** Chat-row cap matching dsh-client-ui-tool CHAT_*_MAX_LINES. */
export const CHAT_CARD_MAX_LINES = 8
