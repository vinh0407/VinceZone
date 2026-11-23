/**
 * Pure zero-dependency JSON-RPC 2.0 Model Context Protocol (MCP) client.
 * Supports real stdio MCP server spawning and Streamable HTTP JSON-RPC calls:
 * - initialize handshake
 * - tools/list discovery
 * - tools/call execution
 */

import { spawn } from 'node:child_process'
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

async function runStdioMcpRpc(
  endpoint: string,
  method: 'tools/list' | 'tools/call',
  params: Record<string, unknown>,
  cwd: string,
  timeoutMs = 15_000,
): Promise<unknown> {
  const { bin, args } = splitCommandArgs(endpoint.trim())
  if (!bin) throw new Error('MCP stdio command is empty.')

  const resolvedBin =
    bin.startsWith('.') || bin.includes('/') || bin.includes('\\')
      ? path.resolve(cwd, bin)
      : bin

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedBin, args, {
      cwd,
      windowsHide: true,
      shell: process.platform === 'win32' && !resolvedBin.toLowerCase().endsWith('.exe'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdoutBuffer = ''
    let stderrText = ''
    let settled = false
    let initialized = false

    const finish = (err: Error | null, result?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        // already exited
      }
      if (err) reject(err)
      else resolve(result)
    }

    const timer = setTimeout(() => {
      finish(new Error(`MCP server timed out after ${timeoutMs}ms. ${stderrText.slice(0, 200)}`))
    }, timeoutMs)

    const sendRpc = (payload: Record<string, unknown>) => {
      child.stdin?.write(`${JSON.stringify(payload)}\n`)
    }

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString('utf8').slice(0, 1000)
    })

    child.on('error', (err) => finish(err))
    child.on('exit', (code) => {
      if (!settled) {
        finish(new Error(`MCP server exited early (code ${code ?? 1}): ${stderrText.slice(0, 240)}`))
      }
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8')
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('{')) continue
        let msg: { id?: number; result?: unknown; error?: { message?: string } }
        try {
          msg = JSON.parse(trimmed)
        } catch {
          continue
        }

        if (msg.id === 1 && !initialized) {
          if (msg.error) {
            finish(new Error(msg.error.message || 'MCP initialize failed.'))
            return
          }
          initialized = true
          sendRpc({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
          sendRpc({ jsonrpc: '2.0', id: 2, method, params })
        } else if (msg.id === 2) {
          if (msg.error) {
            finish(new Error(msg.error.message || `MCP ${method} failed.`))
          } else {
            finish(null, msg.result)
          }
          return
        }
      }
    })

    sendRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'VinceZone Studio', version: '2.0.0' },
      },
    })
  })
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
