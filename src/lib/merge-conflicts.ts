export type MergeConflictBlock = {
  id: string
  startLine: number
  separatorLine: number
  endLine: number
  currentLabel: string
  incomingLabel: string
  currentLines: string[]
  incomingLines: string[]
}

/**
 * Parses standard Git 3-way merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
 * from an editor buffer.
 */
export function parseMergeConflicts(content: string): MergeConflictBlock[] {
  const lines = content.split(/\r?\n/)
  const blocks: MergeConflictBlock[] = []
  let i = 0

  while (i < lines.length) {
    const startMatch = lines[i].match(/^<{7}\s*(.*)$/)
    if (!startMatch) {
      i += 1
      continue
    }
    const startIdx = i
    const currentLabel = startMatch[1]?.trim() || 'HEAD (Current)'
    let sepIdx = -1
    let endIdx = -1

    for (let j = i + 1; j < lines.length; j += 1) {
      if (sepIdx === -1 && /^={7}\s*$/.test(lines[j])) {
        sepIdx = j
      } else if (sepIdx !== -1 && /^>{7}\s*(.*)$/.test(lines[j])) {
        endIdx = j
        break
      }
    }

    if (sepIdx !== -1 && endIdx !== -1) {
      const endMatch = lines[endIdx].match(/^>{7}\s*(.*)$/)
      blocks.push({
        id: `conflict-${startIdx + 1}-${endIdx + 1}`,
        startLine: startIdx + 1,
        separatorLine: sepIdx + 1,
        endLine: endIdx + 1,
        currentLabel,
        incomingLabel: endMatch?.[1]?.trim() || 'Incoming',
        currentLines: lines.slice(startIdx + 1, sepIdx),
        incomingLines: lines.slice(sepIdx + 1, endIdx),
      })
      i = endIdx + 1
    } else {
      i += 1
    }
  }

  return blocks
}

/**
 * Resolves a single Git merge conflict block in `content` by keeping
 * `'current'`, `'incoming'`, or `'both'` sides and removing the markers.
 */
export function resolveMergeConflict(
  content: string,
  conflictId: string,
  choice: 'current' | 'incoming' | 'both',
): string {
  const blocks = parseMergeConflicts(content)
  const target = blocks.find((b) => b.id === conflictId)
  if (!target) return content

  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const replacement =
    choice === 'current'
      ? target.currentLines
      : choice === 'incoming'
        ? target.incomingLines
        : [...target.currentLines, ...target.incomingLines]

  const nextLines = [
    ...lines.slice(0, target.startLine - 1),
    ...replacement,
    ...lines.slice(target.endLine),
  ]
  return nextLines.join(eol)
}
