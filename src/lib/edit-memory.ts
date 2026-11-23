/**
 * VinceZone Edit Memory & Revision Rollback System (REV-001, REV-002, ...)
 *
 * Records automatic snapshots before file edits (from user saves or agent patches)
 * and supports both 1-click UI restore and natural-language rollback prompts.
 */

export type EditRevision = {
  id: string // REV-001, REV-002...
  path: string
  actor: string // e.g. 'User', 'Frontend Agent (FE)', 'PM'
  summary: string
  previousContent: string | null // null when file was newly created
  nextContent: string
  timestamp: string
}

export function formatRevisionId(sequenceNumber: number): string {
  return `REV-${String(sequenceNumber).padStart(3, '0')}`
}

export function createEditRevision(
  existing: EditRevision[],
  input: Omit<EditRevision, 'id' | 'timestamp'> & { timestamp?: string },
): EditRevision {
  const maxSeq = existing.reduce((max, rev) => {
    const match = rev.id.match(/^REV-(\d+)$/i)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return {
    ...input,
    id: formatRevisionId(maxSeq + 1),
    timestamp: input.timestamp || new Date().toISOString(),
  }
}

export type RollbackIntent =
  | { kind: 'revision'; revisionId: string }
  | { kind: 'file'; fileQuery: string }
  | { kind: 'latest' }

/**
 * Detect natural-language rollback requests such as:
 * - "rollback REV-002"
 * - "revert src/app/page.tsx"
 * - "khôi phục file dashboard.tsx"
 * - "hoàn tác code vừa sửa"
 */
export function parseRollbackPrompt(prompt: string): RollbackIntent | null {
  const text = prompt.trim()
  if (!text) return null

  const revMatch = text.match(/\b(REV-\d{1,5})\b/i)
  if (revMatch && /(revert|rollback|restore|undo|khôi phục|hoàn tác|quay lại)/i.test(text)) {
    return { kind: 'revision', revisionId: revMatch[1].toUpperCase() }
  }

  const fileMatch = text.match(
    /(?:revert|rollback|restore|khôi phục|hoàn tác)\s+(?:file\s+|tệp\s+)?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/i,
  )
  if (fileMatch) {
    return { kind: 'file', fileQuery: fileMatch[1] }
  }

  if (
    /^(?:revert|rollback|undo|khôi phục|hoàn tác)(?:\s+(?:last|latest|code|changes?|vừa sửa|gần nhất))?$/i.test(
      text,
    )
  ) {
    return { kind: 'latest' }
  }

  return null
}

export function findRevisionForIntent(
  revisions: EditRevision[],
  intent: RollbackIntent,
): EditRevision | null {
  if (revisions.length === 0) return null

  if (intent.kind === 'revision') {
    return revisions.find((rev) => rev.id.toUpperCase() === intent.revisionId.toUpperCase()) ?? null
  }

  if (intent.kind === 'file') {
    const query = intent.fileQuery.toLowerCase()
    const matches = revisions.filter(
      (rev) => rev.path.toLowerCase() === query || rev.path.toLowerCase().endsWith(`/${query}`),
    )
    return matches[matches.length - 1] ?? null
  }

  return revisions[revisions.length - 1] ?? null
}
