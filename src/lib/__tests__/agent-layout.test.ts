import { describe, expect, it } from 'vitest'
import { computeAgentGridPlan, estimateCostUsd, estimateTokens } from '../agent-layout'

describe('computeAgentGridPlan', () => {
  it('renders 1 agent as full single panel regardless of layout', () => {
    expect(computeAgentGridPlan(1, 'equal')).toEqual({ kind: 'single' })
    expect(computeAgentGridPlan(1, 'focus2')).toEqual({ kind: 'single' })
    expect(computeAgentGridPlan(1, 'focus1')).toEqual({ kind: 'single' })
  })

  it('renders 2 agents as a 50/50 split regardless of layout', () => {
    expect(computeAgentGridPlan(2, 'equal')).toEqual({ kind: 'split-two' })
    expect(computeAgentGridPlan(2, 'focus2')).toEqual({ kind: 'split-two' })
    expect(computeAgentGridPlan(2, 'focus1')).toEqual({ kind: 'split-two' })
  })

  it('renders 3 agents as 3 tall columns in 3:3 and 1 large + 2 stacked in 2:4 and 1:6', () => {
    expect(computeAgentGridPlan(3, 'equal')).toEqual({ kind: 'equal-grid', cols: 3, rows: 1 })
    expect(computeAgentGridPlan(3, 'focus2')).toEqual({
      kind: 'focus-split',
      leftCount: 1,
      rightCols: 1,
      rightRows: 2,
    })
    expect(computeAgentGridPlan(3, 'focus1')).toEqual({
      kind: 'focus-split',
      leftCount: 1,
      rightCols: 1,
      rightRows: 2,
    })
  })

  it('renders 4 agents as 2x2 in 3:3, 2+2 in 2:4, and 1+3 in 1:6', () => {
    expect(computeAgentGridPlan(4, 'equal')).toEqual({ kind: 'equal-grid', cols: 2, rows: 2 })
    expect(computeAgentGridPlan(4, 'focus2')).toEqual({
      kind: 'focus-split',
      leftCount: 2,
      rightCols: 1,
      rightRows: 2,
    })
    expect(computeAgentGridPlan(4, 'focus1')).toEqual({
      kind: 'focus-split',
      leftCount: 1,
      rightCols: 1,
      rightRows: 3,
    })
  })

  it('scales beyond 7 agents without dropping panels', () => {
    expect(computeAgentGridPlan(6, 'equal')).toEqual({ kind: 'equal-grid', cols: 3, rows: 2 })
    expect(computeAgentGridPlan(10, 'equal')).toEqual({ kind: 'equal-grid', cols: 3, rows: 4 })
    expect(computeAgentGridPlan(10, 'focus2')).toEqual({
      kind: 'focus-split',
      leftCount: 2,
      rightCols: 2,
      rightRows: 4,
    })
    expect(computeAgentGridPlan(10, 'focus1')).toEqual({
      kind: 'focus-split',
      leftCount: 1,
      rightCols: 3,
      rightRows: 3,
    })
  })
})

describe('usage estimation helpers', () => {
  it('estimates tokens and non-negative USD cost', () => {
    expect(estimateTokens('')).toBe(1)
    expect(estimateTokens('a'.repeat(400))).toBe(100)
    expect(estimateCostUsd(1000, 500)).toBeCloseTo(0.0075, 6)
  })
})
