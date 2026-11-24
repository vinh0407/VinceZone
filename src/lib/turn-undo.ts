import type { Message, WorkspaceFile } from '@/components/ide/agent-types'
import type { EditRevision } from './edit-memory'
import { rollbackPatchInFiles } from './file-tree'

export type TurnUndoPlan = {
  found: boolean
  restoredPrompt: string
  nextMessages: Message[]
  revisionsToRollback: EditRevision[]
  nextRevisions: EditRevision[]
  nextFiles: WorkspaceFile[]
  diskWrites: Array<{ path: string; content: string }>
  diskDeletes: string[]
}

/**
 * Computes a complete, deterministic rollback plan when the user clicks "Undo" on a
 * previously sent prompt in an AI Agent chat:
 * 1. Rewinds every file revision created during/after that turn (in reverse chronological order)
 *    so files return to the exact state prior to the prompt.
 * 2. Removes that prompt and all subsequent messages in the agent thread.
 * 3. Returns the original prompt text so the composer restores it for quick editing/resending.
 */
export function computeTurnUndoPlan(input: {
  messages: Message[]
  messageId: string
  revisions: EditRevision[]
  files: WorkspaceFile[]
}): TurnUndoPlan {
  const { messages, messageId, revisions, files } = input
  const msgIdx = messages.findIndex((m) => m.id === messageId && m.role === 'user')
  if (msgIdx < 0) {
    return {
      found: false,
      restoredPrompt: '',
      nextMessages: messages,
      revisionsToRollback: [],
      nextRevisions: revisions,
      nextFiles: files,
      diskWrites: [],
      diskDeletes: [],
    }
  }

  const targetMsg = messages[msgIdx]
  const removedSlice = messages.slice(msgIdx)
  const nextMessages = messages.slice(0, msgIdx)

  // Determine which revisions belong to this turn (and any turns after it):
  // Priority 1: Exact `revisionCheckpoint` recorded when the user sent the prompt.
  // Priority 2: Timestamp comparison against `sentAt`.
  // Priority 3: Any `REV-xxx` IDs explicitly referenced in tool messages after this prompt.
  let revisionsToRollback: EditRevision[] = []
  let nextRevisions: EditRevision[] = revisions

  if (
    typeof targetMsg.revisionCheckpoint === 'number' &&
    targetMsg.revisionCheckpoint >= 0 &&
    targetMsg.revisionCheckpoint <= revisions.length
  ) {
    revisionsToRollback = revisions.slice(targetMsg.revisionCheckpoint)
    nextRevisions = revisions.slice(0, targetMsg.revisionCheckpoint)
  } else if (targetMsg.sentAt) {
    const cutoffMs = Date.parse(targetMsg.sentAt)
    if (!Number.isNaN(cutoffMs)) {
      revisionsToRollback = revisions.filter((rev) => Date.parse(rev.timestamp) >= cutoffMs)
      const rollbackIds = new Set(revisionsToRollback.map((r) => r.id))
      nextRevisions = revisions.filter((rev) => !rollbackIds.has(rev.id))
    }
  } else {
    const mentionedRevIds = new Set<string>()
    for (const m of removedSlice) {
      const matches = m.text.match(/\bREV-\d{1,5}\b/gi) ?? []
      for (const id of matches) mentionedRevIds.add(id.toUpperCase())
    }
    if (mentionedRevIds.size > 0) {
      revisionsToRollback = revisions.filter((rev) => mentionedRevIds.has(rev.id.toUpperCase()))
      nextRevisions = revisions.filter((rev) => !mentionedRevIds.has(rev.id.toUpperCase()))
    }
  }

  // Roll back file states strictly in reverse chronological order (newest -> oldest)
  let nextFiles = files
  const finalDiskAction = new Map<string, string | null>()
  for (let i = revisionsToRollback.length - 1; i >= 0; i -= 1) {
    const rev = revisionsToRollback[i]
    nextFiles = rollbackPatchInFiles(nextFiles, rev.path, rev.previousContent)
    finalDiskAction.set(rev.path, rev.previousContent)
  }

  const diskWrites: Array<{ path: string; content: string }> = []
  const diskDeletes: string[] = []
  for (const [filePath, prevContent] of finalDiskAction.entries()) {
    if (prevContent === null) diskDeletes.push(filePath)
    else diskWrites.push({ path: filePath, content: prevContent })
  }

  return {
    found: true,
    restoredPrompt: targetMsg.text,
    nextMessages,
    revisionsToRollback,
    nextRevisions,
    nextFiles,
    diskWrites,
    diskDeletes,
  }
}
