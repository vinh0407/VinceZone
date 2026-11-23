import type { ChildProcess } from 'node:child_process'
import { stopDebugSession } from './debugger-runtime'
import { shutdownMcpPool } from './mcp-client'
import { killAllTerminalSessions } from './terminal-sessions'

const globalCleanup = globalThis as typeof globalThis & {
  __vincezoneCleanupRegistered?: boolean
  __vincezoneAndroidProc?: ChildProcess | null
}

/**
 * Terminates all managed child processes (debugger V8/pdb, interactive terminal shells,
 * and pooled stdio MCP servers) so closing VinceZone Studio never leaves orphan processes.
 */
export function cleanupAllRuntimeProcesses(): {
  terminalsKilled: number
  debuggerStopped: boolean
  mcpPoolStopped: boolean
} {
  let terminalsKilled = 0
  try {
    terminalsKilled = killAllTerminalSessions()
  } catch {
    // ignore
  }
  try {
    stopDebugSession()
  } catch {
    // ignore
  }
  try {
    shutdownMcpPool()
  } catch {
    // ignore
  }
  try {
    globalCleanup.__vincezoneAndroidProc?.kill()
    globalCleanup.__vincezoneAndroidProc = null
  } catch {
    // ignore
  }
  return {
    terminalsKilled,
    debuggerStopped: true,
    mcpPoolStopped: true,
  }
}

export function ensureProcessCleanupHooks() {
  if (globalCleanup.__vincezoneCleanupRegistered) return
  globalCleanup.__vincezoneCleanupRegistered = true
  process.once('exit', () => {
    cleanupAllRuntimeProcesses()
  })
}
