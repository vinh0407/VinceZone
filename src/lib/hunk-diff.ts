/**
 * Pure per-hunk line diff engine for selective Accept / Reject hunk review in Monaco Editor.
 */

export type DiffHunk = {
  id: string
  origStart: number // 1-based line in original
  origCount: number
  nextStart: number // 1-based line in proposed
  nextCount: number
  removedLines: string[]
  addedLines: string[]
}

export type HunkDecision = 'accepted' | 'rejected'

type DiffOp =
  | { type: 'equal'; origIdx: number; nextIdx: number; line: string }
  | { type: 'delete'; origIdx: number; line: string }
  | { type: 'insert'; nextIdx: number; line: string }

function computeLineOps(origLines: string[], nextLines: string[]): DiffOp[] {
  const m = origLines.length
  const n = nextLines.length

  // Trim shared prefix & suffix to keep DP matrix tiny and fast even on big files
  let prefix = 0
  while (prefix < m && prefix < n && origLines[prefix] === nextLines[prefix]) {
    prefix++
  }
  let suffix = 0
  while (
    suffix < m - prefix &&
    suffix < n - prefix &&
    origLines[m - 1 - suffix] === nextLines[n - 1 - suffix]
  ) {
    suffix++
  }

  const ops: DiffOp[] = []
  for (let i = 0; i < prefix; i++) {
    ops.push({ type: 'equal', origIdx: i, nextIdx: i, line: origLines[i] })
  }

  const midOrig = origLines.slice(prefix, m - suffix)
  const midNext = nextLines.slice(prefix, n - suffix)
  const mm = midOrig.length
  const nn = midNext.length

  // Fallback for very large changed mid-blocks (> 1400 lines) to stay instant (<5ms)
  if (mm * nn > 900_000) {
    for (let i = 0; i < mm; i++) {
      ops.push({ type: 'delete', origIdx: prefix + i, line: midOrig[i] })
    }
    for (let j = 0; j < nn; j++) {
      ops.push({ type: 'insert', nextIdx: prefix + j, line: midNext[j] })
    }
  } else {
    // Classic LCS table on trimmed middle segment
    const dp: Int32Array[] = Array.from({ length: mm + 1 }, () => new Int32Array(nn + 1))
    for (let i = mm - 1; i >= 0; i--) {
      for (let j = nn - 1; j >= 0; j--) {
        if (midOrig[i] === midNext[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1]
        }
      }
    }

    let i = 0
    let j = 0
    while (i < mm && j < nn) {
      if (midOrig[i] === midNext[j]) {
        ops.push({ type: 'equal', origIdx: prefix + i, nextIdx: prefix + j, line: midOrig[i] })
        i++
        j++
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'delete', origIdx: prefix + i, line: midOrig[i] })
        i++
      } else {
        ops.push({ type: 'insert', nextIdx: prefix + j, line: midNext[j] })
        j++
      }
    }
    while (i < mm) {
      ops.push({ type: 'delete', origIdx: prefix + i, line: midOrig[i] })
      i++
    }
    while (j < nn) {
      ops.push({ type: 'insert', nextIdx: prefix + j, line: midNext[j] })
      j++
    }
  }

  for (let s = 0; s < suffix; s++) {
    const oi = m - suffix + s
    const ni = n - suffix + s
    ops.push({ type: 'equal', origIdx: oi, nextIdx: ni, line: origLines[oi] })
  }

  return ops
}

export function computeDiffHunks(original: string, proposed: string): DiffHunk[] {
  const normOrig = original.replace(/\r\n/g, '\n')
  const normNext = proposed.replace(/\r\n/g, '\n')
  if (normOrig === normNext) return []

  const origLines = normOrig === '' ? [] : normOrig.split('\n')
  const nextLines = normNext === '' ? [] : normNext.split('\n')
  const ops = computeLineOps(origLines, nextLines)

  const hunks: DiffHunk[] = []
  let idx = 0
  let origLine = 1
  let nextLine = 1

  while (idx < ops.length) {
    const op = ops[idx]
    if (op.type === 'equal') {
      origLine++
      nextLine++
      idx++
      continue
    }

    const origStart = origLine
    const nextStart = nextLine
    const removedLines: string[] = []
    const addedLines: string[] = []

    while (idx < ops.length && ops[idx].type !== 'equal') {
      const cur = ops[idx]
      if (cur.type === 'delete') {
        removedLines.push(cur.line)
        origLine++
      } else if (cur.type === 'insert') {
        addedLines.push(cur.line)
        nextLine++
      }
      idx++
    }

    hunks.push({
      id: `hunk-${hunks.length + 1}`,
      origStart,
      origCount: removedLines.length,
      nextStart,
      nextCount: addedLines.length,
      removedLines,
      addedLines,
    })
  }

  return hunks
}

/**
 * Reconstructs file content from original + proposed applying selective Accept/Reject decisions
 * per hunk ID. Any hunk without an explicit decision defaults to 'accepted' (keeps proposed lines).
 */
export function applyHunkDecisions(
  original: string,
  proposed: string,
  decisions: Record<string, HunkDecision>,
): string {
  const normOrig = original.replace(/\r\n/g, '\n')
  const normNext = proposed.replace(/\r\n/g, '\n')
  if (normOrig === normNext) return normNext

  const origLines = normOrig === '' ? [] : normOrig.split('\n')
  const nextLines = normNext === '' ? [] : normNext.split('\n')
  const ops = computeLineOps(origLines, nextLines)

  const out: string[] = []
  let idx = 0
  let hunkCounter = 0

  while (idx < ops.length) {
    if (ops[idx].type === 'equal') {
      out.push(ops[idx].line)
      idx++
      continue
    }

    hunkCounter++
    const hunkId = `hunk-${hunkCounter}`
    const removed: string[] = []
    const added: string[] = []
    while (idx < ops.length && ops[idx].type !== 'equal') {
      const cur = ops[idx]
      if (cur.type === 'delete') removed.push(cur.line)
      else if (cur.type === 'insert') added.push(cur.line)
      idx++
    }

    const decision = decisions[hunkId] ?? 'accepted'
    if (decision === 'rejected') {
      out.push(...removed)
    } else {
      out.push(...added)
    }
  }

  return out.join('\n')
}
