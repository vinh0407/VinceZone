import path from 'node:path'

export type RegisteredApproval = {
  id: string
  command: string
  cwd: string
  createdAt: number
}

const APPROVAL_TTL_MS = 15 * 60_000

const globalApprovals = globalThis as typeof globalThis & {
  __vincezonePendingApprovals?: Map<string, RegisteredApproval>
}

function getStore(): Map<string, RegisteredApproval> {
  if (!globalApprovals.__vincezonePendingApprovals) {
    globalApprovals.__vincezonePendingApprovals = new Map()
  }
  return globalApprovals.__vincezonePendingApprovals
}

function normalizeCwd(dir: string): string {
  const resolved = path.resolve(/*turbopackIgnore: true*/ dir)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function pruneExpired(store: Map<string, RegisteredApproval>) {
  const now = Date.now()
  for (const [key, item] of store.entries()) {
    if (now - item.createdAt > APPROVAL_TTL_MS) {
      store.delete(key)
    }
  }
}

/**
 * Registers an AI-proposed shell command on the server so `/api/agent-command`
 * only executes exact commands that the server actually queued for user approval.
 */
export function registerPendingApproval(input: { id: string; command: string; cwd: string }) {
  const store = getStore()
  pruneExpired(store)
  store.set(input.id, {
    id: input.id,
    command: input.command.trim(),
    cwd: normalizeCwd(input.cwd),
    createdAt: Date.now(),
  })
}

/**
 * Consumes a pending approval once, verifying exact `id`, `command`, and `cwd`.
 */
export function consumePendingApproval(
  id: string,
  command: string,
  cwd: string,
): { ok: true; approval: RegisteredApproval } | { ok: false; reason: string } {
  const store = getStore()
  pruneExpired(store)
  const cleanId = id.trim()
  if (!cleanId) {
    return { ok: false, reason: 'Missing server approvalId.' }
  }
  const entry = store.get(cleanId)
  if (!entry) {
    return { ok: false, reason: 'Approval token not found, expired, or already executed.' }
  }
  if (entry.command !== command.trim()) {
    return { ok: false, reason: 'Command mismatch against registered server approval.' }
  }
  if (entry.cwd !== normalizeCwd(cwd)) {
    return { ok: false, reason: 'Working directory mismatch against registered server approval.' }
  }
  store.delete(cleanId)
  return { ok: true, approval: entry }
}

export function rejectPendingApproval(id?: string) {
  if (!id?.trim()) return
  getStore().delete(id.trim())
}
