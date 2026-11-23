import type { AgentLayout } from '@/components/ide/agent-types'

export type AgentGridPlan =
  | { kind: 'single' }
  | { kind: 'split-two' }
  | { kind: 'equal-grid'; cols: number; rows: number }
  | { kind: 'focus-split'; leftCount: number; rightCols: number; rightRows: number }

/**
 * Computes an adaptive, unlimited multi-agent chat grid layout:
 * - 1 agent -> full 100% canvas
 * - 2 agents -> 50/50 split
 * - 3 agents:
 *   - 3:3 (equal) -> 3 tall full-height columns
 *   - 2:4 (focus2) or 1:6 (focus1) -> 1 large left panel + 2 stacked right panels
 * - 4 agents:
 *   - 3:3 (equal) -> 2x2 grid
 *   - 2:4 (focus2) -> 2 large left panels + 2 stacked right panels
 *   - 1:6 (focus1) -> 1 large left panel + 3 right panels
 * - N >= 5 agents -> expands dynamically with no upper cap
 */
export function computeAgentGridPlan(count: number, layout: AgentLayout): AgentGridPlan {
  if (count <= 1) return { kind: 'single' }
  if (count === 2) return { kind: 'split-two' }

  if (count === 3) {
    if (layout === 'equal') return { kind: 'equal-grid', cols: 3, rows: 1 }
    return { kind: 'focus-split', leftCount: 1, rightCols: 1, rightRows: 2 }
  }

  if (count === 4) {
    if (layout === 'equal') return { kind: 'equal-grid', cols: 2, rows: 2 }
    if (layout === 'focus2') return { kind: 'focus-split', leftCount: 2, rightCols: 1, rightRows: 2 }
    return { kind: 'focus-split', leftCount: 1, rightCols: 1, rightRows: 3 }
  }

  if (layout === 'equal') {
    const cols = 3
    const rows = Math.ceil(count / cols)
    return { kind: 'equal-grid', cols, rows }
  }

  if (layout === 'focus2') {
    const rightCount = count - 2
    const rightCols = rightCount <= 2 ? 1 : 2
    const rightRows = Math.ceil(rightCount / rightCols)
    return { kind: 'focus-split', leftCount: 2, rightCols, rightRows }
  }

  // focus1 (1:6+ unlimited)
  const rightCount = count - 1
  const rightCols = rightCount <= 3 ? 1 : rightCount <= 4 ? 2 : 3
  const rightRows = Math.ceil(rightCount / rightCols)
  return { kind: 'focus-split', leftCount: 1, rightCols, rightRows }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  return Number(((promptTokens * 0.0000025 + completionTokens * 0.00001)).toFixed(6))
}
