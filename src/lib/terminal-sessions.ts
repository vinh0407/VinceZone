import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'

export type TerminalSessionListener = (event: {
  type: 'output' | 'exit'
  data?: string
  exitCode?: number | null
}) => void

export type InteractiveShellSession = {
  id: string
  title: string
  cwd: string
  shell: string
  proc: ChildProcess
  pid: number | undefined
  createdAt: string
  alive: boolean
  exitCode: number | null
  history: string
  listeners: Set<TerminalSessionListener>
}

const MAX_HISTORY_CHARS = 64_000

const globalStore = globalThis as typeof globalThis & {
  __vincezoneTerminalSessions?: Map<string, InteractiveShellSession>
}

function getStore(): Map<string, InteractiveShellSession> {
  if (!globalStore.__vincezoneTerminalSessions) {
    globalStore.__vincezoneTerminalSessions = new Map()
  }
  return globalStore.__vincezoneTerminalSessions
}

function killProcessTree(pid: number) {
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.unref()
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // already exited
      }
    }
  }
}

function interruptChildProcesses(pid: number) {
  if (process.platform === 'win32') {
    // Kill child processes spawned under the shell without killing the shell itself
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${pid} } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null }`,
      ],
      { windowsHide: true, stdio: 'ignore' },
    )
    ps.unref()
  } else {
    try {
      process.kill(pid, 'SIGINT')
    } catch {
      // ignore
    }
  }
}

export function createTerminalSession(options?: { cwd?: string; title?: string }): InteractiveShellSession {
  const store = getStore()
  // Cap concurrent sessions cleanly
  if (store.size >= 8) {
    const oldest = [...store.values()].find((s) => !s.alive) ?? [...store.values()][0]
    if (oldest) killTerminalSession(oldest.id)
  }

  let cwd = path.resolve(
    /*turbopackIgnore: true*/ options?.cwd?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )
  try {
    if (!statSync(/*turbopackIgnore: true*/ cwd).isDirectory()) cwd = process.cwd()
  } catch {
    cwd = process.cwd()
  }

  const isWin = process.platform === 'win32'
  const shellBin = isWin ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
  const shellArgs = isWin
    ? [
        '-NoLogo',
        '-NoExit',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '-',
      ]
    : ['-i']

  const proc = spawn(shellBin, shellArgs, {
    cwd,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      CLICOLOR_FORCE: '1',
      PYTHONUNBUFFERED: '1',
      COLUMNS: '120',
      LINES: '30',
    },
  })

  const id = `term-${crypto.randomUUID().slice(0, 8)}`
  const session: InteractiveShellSession = {
    id,
    title: options?.title || (isWin ? 'PowerShell' : 'Bash'),
    cwd,
    shell: isWin ? 'pwsh' : 'bash',
    proc,
    pid: proc.pid,
    createdAt: new Date().toISOString(),
    alive: true,
    exitCode: null,
    history: `\x1b[90mVinceZone Interactive Terminal (${isWin ? 'PowerShell' : 'Bash'}) · ${cwd}\x1b[0m\r\n`,
    listeners: new Set(),
  }

  const emitChunk = (chunk: Buffer, isErr = false) => {
    const raw = chunk.toString('utf8').replace(/\r?\n/g, '\r\n')
    const formatted = isErr && !raw.includes('\x1b[') ? `\x1b[31m${raw}\x1b[0m` : raw
    session.history = (session.history + formatted).slice(-MAX_HISTORY_CHARS)
    for (const listener of session.listeners) {
      listener({ type: 'output', data: formatted })
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => emitChunk(chunk, false))
  proc.stderr?.on('data', (chunk: Buffer) => emitChunk(chunk, true))

  proc.on('exit', (code) => {
    session.alive = false
    session.exitCode = code
    const msg = `\r\n\x1b[90m[Process exited with code ${code ?? 0}]\x1b[0m\r\n`
    session.history = (session.history + msg).slice(-MAX_HISTORY_CHARS)
    for (const listener of session.listeners) {
      listener({ type: 'output', data: msg })
      listener({ type: 'exit', exitCode: code })
    }
  })

  if (isWin && proc.stdin?.writable) {
    // Configure UTF-8 output & concise prompt inside persistent PowerShell session
    proc.stdin.write(
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; function prompt { "PS " + (Split-Path -Leaf (Get-Location)) + "> " }; Write-Output "Ready — type any command (pnpm dev, python, git, node) or press Ctrl+C to stop."\r\n`,
    )
  }

  store.set(id, session)
  return session
}

export function getTerminalSession(id: string): InteractiveShellSession | undefined {
  return getStore().get(id)
}

export function listTerminalSessions() {
  return [...getStore().values()].map((s) => ({
    id: s.id,
    title: s.title,
    cwd: s.cwd,
    shell: s.shell,
    alive: s.alive,
    exitCode: s.exitCode,
    createdAt: s.createdAt,
  }))
}

export function writeToTerminalSession(id: string, input: string): boolean {
  const session = getStore().get(id)
  if (!session || !session.alive || !session.proc.stdin?.writable) return false
  session.proc.stdin.write(input)
  return true
}

export function interruptTerminalSession(id: string): boolean {
  const session = getStore().get(id)
  if (!session || !session.alive) return false
  if (session.pid) {
    interruptChildProcesses(session.pid)
  }
  const marker = `\r\n\x1b[33m^C\x1b[0m\r\n`
  session.history = (session.history + marker).slice(-MAX_HISTORY_CHARS)
  for (const listener of session.listeners) {
    listener({ type: 'output', data: marker })
  }
  return true
}

export function resizeTerminalSession(id: string, cols: number, rows: number): boolean {
  const session = getStore().get(id)
  if (!session || !session.alive || !session.proc.stdin?.writable) return false
  const c = Math.max(40, Math.min(300, Math.round(cols) || 120))
  const r = Math.max(10, Math.min(120, Math.round(rows) || 30))
  if (session.shell === 'bash') {
    session.proc.stdin.write(`export COLUMNS=${c} LINES=${r}\n`)
  }
  return true
}

export function killTerminalSession(id: string): boolean {
  const store = getStore()
  const session = store.get(id)
  if (!session) return false
  session.alive = false
  if (session.pid) killProcessTree(session.pid)
  else {
    try {
      session.proc.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  session.listeners.clear()
  store.delete(id)
  return true
}

export function killAllTerminalSessions(): number {
  const store = getStore()
  const ids = [...store.keys()]
  for (const id of ids) {
    killTerminalSession(id)
  }
  return ids.length
}
