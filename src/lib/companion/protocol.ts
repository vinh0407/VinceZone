/**
 * Baton Local Companion Protocol (v1)
 *
 * Defines the versioned, capability-gated contract between the web workspace
 * and a separately installed user-controlled local companion daemon.
 * Never store secrets or plaintext credentials inside protocol audit records.
 */

export const COMPANION_PROTOCOL_VERSION = '1.0' as const

export type CompanionConnectionState =
  | 'disconnected'
  | 'pairing'
  | 'paired'
  | 'authenticated'
  | 'error'

export type CompanionCapability =
  | 'fs.read'
  | 'fs.write'
  | 'pty.spawn'
  | 'cli.claude'
  | 'cli.codex'
  | 'cli.gemini'
  | 'git.diff'

export type PairingChallenge = {
  version: typeof COMPANION_PROTOCOL_VERSION
  challengeId: string
  expiresAt: string
  workspaceRootHash: string
  requestedScopes: CompanionCapability[]
}

export type CompanionHandshakeResponse = {
  version: typeof COMPANION_PROTOCOL_VERSION
  companionId: string
  hostname: string
  platform: NodeJS.Platform
  capabilities: CompanionCapability[]
  state: CompanionConnectionState
}

export type CompanionCommandRequest = {
  version: typeof COMPANION_PROTOCOL_VERSION
  requestId: string
  nonce: string
  issuedAt: string
  expiresAt: string
  capability: CompanionCapability
  workspaceScope: string
  payload: Record<string, unknown>
}

export type CompanionStreamEvent =
  | { type: 'pty.stdout'; sessionId: string; chunk: string; timestamp: string }
  | { type: 'pty.stderr'; sessionId: string; chunk: string; timestamp: string }
  | { type: 'pty.exit'; sessionId: string; exitCode: number | null; timestamp: string }
  | { type: 'fs.applied'; patchId: string; path: string; revision: string; timestamp: string }
  | { type: 'audit.recorded'; eventId: string; action: string; timestamp: string }
