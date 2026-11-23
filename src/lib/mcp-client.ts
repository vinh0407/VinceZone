/**
 * Pure zero-dependency JSON-RPC 2.0 Model Context Protocol (MCP) client
 * with a Persistent `stdio` Connection Pool (preserves stateful MCP sessions
 * such as Playwright browser tabs or DB connections across tool calls)
 * and Streamable HTTP JSON-RPC support.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export type McpToolInfo = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

function splitCommandArgs(commandLine: string): { bin: string; args: string[] } {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < commandLine.length; i++) {
    const ch = commandLine[i]
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)

  const [bin = '', ...args] = tokens
  return { bin, args }
}

type PendingRpc = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type PooledStdioServer = {
  key: string
  child: ChildProcess
  ready: Promise<void>
  alive: boolean
  nextId: number
  stdoutBuffer: string
  stderrText: string
  pending: Map<number, PendingRpc>
  idleTimer: ReturnType<typeof setTimeout> | null
}

const MCP_IDLE_TTL_MS = 5 * 60_000

const globalMcpPool = globalThis as typeof globalThis & {
  __vincezoneMcpPool?: Map<string, PooledStdioServer>
}

function getPool(): Map<string, PooledStdioServer> {
  if (!globalMcpPool.__vincezoneMcpPool) {
    globalMcpPool.__vincezoneMcpPool = new Map()
  }
  return globalMcpPool.__vincezoneMcpPool
}

function destroyPooledServer(entry: PooledStdioServer, reason?: string) {
  if (!entry.alive) return
  entry.alive = false
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer)
    entry.idleTimer = null
  }
  getPool().delete(entry.key)
  for (const [, pending] of entry.pending.entries()) {
    clearTimeout(pending.timer)
    pending.reject(new Error(reason || 'MCP server connection closed.'))
  }
  entry.pending.clear()
  try {
    entry.child.kill()
  } catch {
    // already exited
  }
}

function refreshIdleTimer(entry: PooledStdioServer) {
  if (entry.idleTimer) clearTimeout(entry.idleTimer)
  entry.idleTimer = setTimeout(() => {
    destroyPooledServer(entry, 'MCP server evicted after idle timeout.')
  }, MCP_IDLE_TTL_MS)
  if (typeof entry.idleTimer.unref === 'function') {
    entry.idleTimer.unref()
  }
}

function sendJsonRpc(
  entry: PooledStdioServer,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  if (!entry.alive || entry.child.killed || entry.child.exitCode !== null) {
    return Promise.reject(new Error('MCP server process is no longer running.'))
  }
  const id = entry.nextId++
  refreshIdleTimer(entry)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      entry.pending.delete(id)
      reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms. ${entry.stderrText.slice(0, 200)}`))
    }, timeoutMs)

    entry.pending.set(id, { resolve, reject, timer })
    try {
      entry.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    } catch (err) {
      clearTimeout(timer)
      entry.pending.delete(id)
      reject(err instanceof Error ? err : new Error('Failed writing to MCP stdin.'))
    }
  })
}

function getOrSpawnStdioServer(endpoint: string, cwd: string, timeoutMs = 15_000): PooledStdioServer {
  const key = `${endpoint.trim()}@@${path.resolve(/*turbopackIgnore: true*/ cwd)}`
  const pool = getPool()
  const existing = pool.get(key)
  if (existing && existing.alive && !existing.child.killed && existing.child.exitCode === null) {
    refreshIdleTimer(existing)
    return existing
  }

  const { bin, args } = splitCommandArgs(endpoint.trim())
  if (!bin) throw new Error('MCP stdio command is empty.')

  const resolvedBin =
    bin.startsWith('.') || bin.includes('/') || bin.includes('\\')
      ? path.resolve(/*turbopackIgnore: true*/ cwd, bin)
      : bin

  const child = spawn(/*turbopackIgnore: true*/ resolvedBin, args, {
    cwd,
    windowsHide: true,
    shell: process.platform === 'win32' && !resolvedBin.toLowerCase().endsWith('.exe'),
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const entry: PooledStdioServer = {
    key,
    child,
    ready: Promise.resolve(),
    alive: true,
    nextId: 1,
    stdoutBuffer: '',
    stderrText: '',
    pending: new Map(),
    idleTimer: null,
  }

  child.stderr?.on('data', (chunk: Buffer) => {
    entry.stderrText = (entry.stderrText + chunk.toString('utf8')).slice(-1500)
  })

  child.stdout?.on('data', (chunk: Buffer) => {
    entry.stdoutBuffer += chunk.toString('utf8')
    const lines = entry.stdoutBuffer.split(/\r?\n/)
    entry.stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      let msg: { id?: number; result?: unknown; error?: { message?: string } }
      try {
        msg = JSON.parse(trimmed)
      } catch {
        continue
      }
      if (typeof msg.id === 'number') {
        const pending = entry.pending.get(msg.id)
        if (!pending) continue
        entry.pending.delete(msg.id)
        clearTimeout(pending.timer)
        if (msg.error) {
          pending.reject(new Error(msg.error.message || 'MCP RPC error.'))
        } else {
          pending.resolve(msg.result)
        }
      }
    }
  })

  child.on('error', (err) => {
    destroyPooledServer(entry, err.message)
  })
  child.on('exit', (code) => {
    destroyPooledServer(
      entry,
      `MCP server exited (code ${code ?? 1}): ${entry.stderrText.slice(0, 240)}`,
    )
  })

  pool.set(key, entry)
  refreshIdleTimer(entry)

  entry.ready = sendJsonRpc(
    entry,
    'initialize',
    {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'VinceZone Studio', version: '2.2.0' },
    },
    timeoutMs,
  )
    .then(() => {
      if (entry.alive) {
        entry.child.stdin?.write(
          `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`,
        )
      }
    })
    .catch((err) => {
      destroyPooledServer(entry, err instanceof Error ? err.message : 'MCP initialize failed.')
      throw err
    })

  return entry
}

async function runStdioMcpRpc(
  endpoint: string,
  method: 'tools/list' | 'tools/call',
  params: Record<string, unknown>,
  cwd: string,
  timeoutMs = 15_000,
): Promise<unknown> {
  const entry = getOrSpawnStdioServer(endpoint, cwd, timeoutMs)
  await entry.ready
  return sendJsonRpc(entry, method, params, timeoutMs)
}

async function runHttpMcpRpc(
  endpoint: string,
  method: 'tools/list' | 'tools/call',
  params: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`HTTP MCP server returned ${res.status}.`)
    }
    const data = (await res.json()) as { result?: unknown; error?: { message?: string } }
    if (data.error) throw new Error(data.error.message || 'HTTP MCP call failed.')
    return data.result
  } finally {
    clearTimeout(timer)
  }
}

export async function listMcpServerTools(
  transport: 'stdio' | 'http',
  endpoint: string,
  cwd: string,
): Promise<McpToolInfo[]> {
  const result = (
    transport === 'http'
      ? await runHttpMcpRpc(endpoint, 'tools/list', {})
      : await runStdioMcpRpc(endpoint, 'tools/list', {}, cwd)
  ) as { tools?: McpToolInfo[] }
  return Array.isArray(result?.tools) ? result.tools : []
}

export async function callMcpServerTool(
  transport: 'stdio' | 'http',
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>,
  cwd: string,
): Promise<unknown> {
  return transport === 'http'
    ? runHttpMcpRpc(endpoint, 'tools/call', { name: toolName, arguments: args })
    : runStdioMcpRpc(endpoint, 'tools/call', { name: toolName, arguments: args }, cwd)
}

/**
 * Terminates all pooled stdio MCP server child processes cleanly (used on Electron quit & tests).
 */
export function shutdownMcpPool() {
  const pool = getPool()
  for (const entry of [...pool.values()]) {
    destroyPooledServer(entry, 'MCP pool shut down.')
  }
}

export function getActiveMcpPoolSize(): number {
  return getPool().size
}
