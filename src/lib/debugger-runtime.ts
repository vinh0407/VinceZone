import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolvePathInsideWorkspace } from './local-guard'

function resolveNodeExecutable(): { command: string; envExtra: Record<string, string> } {
  if (!process.versions.electron) {
    return { command: process.execPath, envExtra: {} }
  }
  const binary = process.platform === 'win32' ? 'node.exe' : 'node'
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const dir of dirs) {
    const candidate = path.join(/*turbopackIgnore: true*/ dir, binary)
    if (existsSync(candidate)) {
      return { command: candidate, envExtra: {} }
    }
  }
  return { command: process.execPath, envExtra: { ELECTRON_RUN_AS_NODE: '1' } }
}

export type DebugBreakpoint = {
  path: string
  line: number
}

export type DebugCallFrame = {
  callFrameId: string
  functionName: string
  path: string
  line: number
  column: number
}

export type DebugVariable = {
  name: string
  type: string
  value: string
}

export type DebugSnapshot = {
  status: 'idle' | 'starting' | 'running' | 'paused' | 'exited'
  targetFile: string | null
  cwd: string | null
  pid: number | null
  activeLocation: { path: string; line: number } | null
  callFrames: DebugCallFrame[]
  variables: DebugVariable[]
  consoleLines: string[]
  error: string | null
}

type PendingCdp = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

function resolvePythonExecutable(): string {
  const candidates = process.platform === 'win32' ? ['python.exe', 'py.exe'] : ['python3', 'python']
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const bin of candidates) {
    for (const dir of dirs) {
      const full = path.join(/*turbopackIgnore: true*/ dir, bin)
      if (existsSync(full)) return full
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

type ManagedDebugger = {
  runtimeKind: 'node-cdp' | 'python-pdb'
  proc: ChildProcess | null
  ws: WebSocket | null
  cwd: string
  targetFile: string
  status: DebugSnapshot['status']
  nextMsgId: number
  pending: Map<number, PendingCdp>
  scriptUrls: Map<string, string>
  callFrames: DebugCallFrame[]
  variables: DebugVariable[]
  consoleLines: string[]
  error: string | null
  breakpointIds: string[]
  varsPromise: Promise<void> | null
  pdbBuffer: string
  pdbWaiters: Array<(chunk: string) => void>
}

const globalDebug = globalThis as typeof globalThis & {
  __vincezoneDebugger?: ManagedDebugger | null
}

function formatRemoteObject(obj?: {
  type?: string
  subtype?: string
  value?: unknown
  description?: string
  unserializableValue?: string
}): string {
  if (!obj) return 'undefined'
  if (obj.unserializableValue) return obj.unserializableValue
  if (obj.type === 'string') return JSON.stringify(obj.value ?? '')
  if (obj.value !== undefined) return String(obj.value)
  if (obj.description) return obj.description.slice(0, 140)
  return obj.type || 'undefined'
}

function normalizeScriptPath(url: string, cwd: string): string {
  if (!url) return '(anonymous)'
  try {
    let fsPath = url
    if (url.startsWith('file://')) {
      fsPath = decodeURIComponent(new URL(url).pathname)
      if (process.platform === 'win32' && fsPath.startsWith('/')) {
        fsPath = fsPath.slice(1)
      }
    }
    const rel = path.relative(cwd, fsPath).replace(/\\/g, '/')
    if (rel && !rel.startsWith('..')) return rel
    return fsPath.replace(/\\/g, '/')
  } catch {
    return url
  }
}

function sendCdp(dbg: ManagedDebugger, method: string, params: Record<string, unknown> = {}) {
  return new Promise<unknown>((resolve, reject) => {
    if (!dbg.ws || dbg.ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Debugger inspector WebSocket is not connected.'))
      return
    }
    const id = dbg.nextMsgId++
    dbg.pending.set(id, { resolve, reject })
    dbg.ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (dbg.pending.has(id)) {
        dbg.pending.delete(id)
        reject(new Error(`CDP timeout on ${method}`))
      }
    }, 6000)
  })
}

async function applyBreakpointsToSession(dbg: ManagedDebugger, breakpoints: DebugBreakpoint[]) {
  // Remove previous breakpoints cleanly
  for (const bpId of dbg.breakpointIds) {
    try {
      await sendCdp(dbg, 'Debugger.removeBreakpoint', { breakpointId: bpId })
    } catch {
      // ignore
    }
  }
  dbg.breakpointIds = []

  for (const bp of breakpoints) {
    try {
      const absPath = resolvePathInsideWorkspace(dbg.cwd, bp.path)
      const fileUrl = pathToFileURL(absPath).href
      const res = (await sendCdp(dbg, 'Debugger.setBreakpointByUrl', {
        lineNumber: Math.max(0, bp.line - 1),
        url: fileUrl,
      })) as { breakpointId?: string }
      if (res?.breakpointId) dbg.breakpointIds.push(res.breakpointId)
    } catch {
      // ignore invalid breakpoint path
    }
  }
}

async function populateTopFrameVariables(
  dbg: ManagedDebugger,
  rawFrames: Array<{
    callFrameId: string
    scopeChain?: Array<{ type?: string; object?: { objectId?: string } }>
  }>,
) {
  const top = rawFrames[0]
  if (!top?.scopeChain?.length) {
    dbg.variables = []
    return
  }
  const scopes = top.scopeChain.filter(
    (s) =>
      s.object?.objectId &&
      (s.type === 'local' ||
        s.type === 'block' ||
        s.type === 'closure' ||
        s.type === 'module' ||
        s.type === 'script'),
  )
  const collected: DebugVariable[] = []
  const seen = new Set<string>()

  for (const scope of scopes.slice(0, 3)) {
    try {
      const props = (await sendCdp(dbg, 'Runtime.getProperties', {
        objectId: scope.object!.objectId,
        ownProperties: true,
        generatePreview: true,
      })) as {
        result?: Array<{
          name?: string
          value?: { type?: string; subtype?: string; value?: unknown; description?: string }
        }>
      }
      for (const prop of props.result ?? []) {
        if (!prop.name || seen.has(prop.name) || prop.name === 'this') continue
        seen.add(prop.name)
        collected.push({
          name: prop.name,
          type: prop.value?.subtype || prop.value?.type || 'unknown',
          value: formatRemoteObject(prop.value),
        })
        if (collected.length >= 30) break
      }
    } catch {
      // ignore unreadable scope
    }
    if (collected.length >= 30) break
  }
  dbg.variables = collected
}

export function stopDebugSession() {
  const dbg = globalDebug.__vincezoneDebugger
  if (!dbg) return
  try {
    dbg.ws?.close()
  } catch {
    // ignore
  }
  if (dbg.proc && !dbg.proc.killed && dbg.proc.exitCode === null) {
    try {
      dbg.proc.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  for (const p of dbg.pending.values()) p.reject(new Error('Debug session stopped.'))
  dbg.pending.clear()
  globalDebug.__vincezoneDebugger = null
}

export function getDebugSnapshot(): DebugSnapshot {
  const dbg = globalDebug.__vincezoneDebugger
  if (!dbg) {
    return {
      status: 'idle',
      targetFile: null,
      cwd: null,
      pid: null,
      activeLocation: null,
      callFrames: [],
      variables: [],
      consoleLines: [],
      error: null,
    }
  }
  const top = dbg.callFrames[0]
  return {
    status: dbg.status,
    targetFile: dbg.targetFile,
    cwd: dbg.cwd,
    pid: dbg.proc?.pid ?? null,
    activeLocation:
      dbg.status === 'paused' && top ? { path: top.path, line: top.line } : null,
    callFrames: dbg.callFrames,
    variables: dbg.variables,
    consoleLines: dbg.consoleLines.slice(-80),
    error: dbg.error,
  }
}

export async function startDebugSession(options: {
  cwd: string
  targetFile: string
  breakpoints?: DebugBreakpoint[]
}): Promise<DebugSnapshot> {
  stopDebugSession()

  const cwd = path.resolve(options.cwd || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd())
  const absTarget = resolvePathInsideWorkspace(cwd, options.targetFile)
  const lower = absTarget.toLowerCase()

  // 2C: Python real interactive debugger via built-in `python -u -m pdb`
  if (lower.endsWith('.py')) {
    return startPythonDebugSession({
      cwd,
      absTarget,
      targetFile: options.targetFile.replace(/\\/g, '/'),
      breakpoints: options.breakpoints ?? [],
    })
  }

  const isTs = lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')

  const nodeArgs = [
    ...(isTs ? ['--experimental-strip-types'] : []),
    '--inspect-brk=127.0.0.1:0',
    absTarget,
  ]

  const { command: nodeCmd, envExtra } = resolveNodeExecutable()
  const proc = spawn(nodeCmd, nodeArgs, {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_NO_WARNINGS: '1', ...envExtra },
  })

  const dbg: ManagedDebugger = {
    runtimeKind: 'node-cdp',
    proc,
    ws: null,
    cwd,
    targetFile: options.targetFile.replace(/\\/g, '/'),
    status: 'starting',
    nextMsgId: 1,
    pending: new Map(),
    scriptUrls: new Map(),
    callFrames: [],
    variables: [],
    consoleLines: [`[Debugger] Launching ${options.targetFile} with V8 Inspector…`],
    error: null,
    breakpointIds: [],
    varsPromise: null,
    pdbBuffer: '',
    pdbWaiters: [],
  }
  globalDebug.__vincezoneDebugger = dbg

  const pushLog = (prefix: string, chunk: Buffer) => {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      if (line.startsWith('Debugger listening on') || line.startsWith('For help, see:')) continue
      dbg.consoleLines.push(`${prefix}${line.slice(0, 300)}`)
      if (dbg.consoleLines.length > 100) dbg.consoleLines.shift()
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => pushLog('', chunk))
  proc.on('exit', (code) => {
    dbg.status = 'exited'
    dbg.callFrames = []
    dbg.variables = []
    dbg.consoleLines.push(`[Debugger] Target exited with code ${code ?? 0}`)
  })

  // Wait for Inspector ws:// URL from stderr
  const wsUrl = await new Promise<string>((resolve, reject) => {
    let stderrBuf = ''
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for Node V8 Inspector. Output: ${stderrBuf.slice(0, 260)}`))
    }, 8000)

    const onStderr = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      stderrBuf += text
      pushLog('[stderr] ', chunk)
      const match = stderrBuf.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-zA-Z0-9-]+/)
      if (match) {
        clearTimeout(timer)
        resolve(match[0])
      }
    }

    proc.stderr?.on('data', onStderr)
    proc.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Process exited early (code ${code ?? 1}): ${stderrBuf.slice(0, 260)}`))
    })
  }).catch((err) => {
    dbg.error = err instanceof Error ? err.message : String(err)
    dbg.status = 'exited'
    return ''
  })

  if (!wsUrl) {
    return getDebugSnapshot()
  }

  // Connect native WebSocket to V8 Inspector CDP
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    dbg.ws = ws

    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () => reject(new Error('Failed to open CDP WebSocket.')))

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: number
          result?: unknown
          error?: { message?: string }
          method?: string
          params?: Record<string, unknown>
        }

        if (typeof msg.id === 'number') {
          const waiter = dbg.pending.get(msg.id)
          if (waiter) {
            dbg.pending.delete(msg.id)
            if (msg.error) waiter.reject(new Error(msg.error.message || 'CDP error'))
            else waiter.resolve(msg.result)
          }
          return
        }

        if (msg.method === 'Debugger.scriptParsed' && msg.params) {
          const sid = String(msg.params.scriptId || '')
          const url = String(msg.params.url || '')
          if (sid && url) dbg.scriptUrls.set(sid, url)
        } else if (msg.method === 'Debugger.paused' && msg.params) {
          dbg.status = 'paused'
          const rawFrames = (msg.params.callFrames as Array<{
            callFrameId: string
            functionName?: string
            url?: string
            location?: { scriptId?: string; lineNumber?: number; columnNumber?: number }
            scopeChain?: Array<{ type?: string; object?: { objectId?: string } }>
          }>) ?? []

          dbg.callFrames = rawFrames.slice(0, 15).map((f) => {
            const url = f.url || dbg.scriptUrls.get(f.location?.scriptId || '') || ''
            return {
              callFrameId: f.callFrameId,
              functionName: f.functionName || '(top-level)',
              path: normalizeScriptPath(url, dbg.cwd),
              line: (f.location?.lineNumber ?? 0) + 1,
              column: (f.location?.columnNumber ?? 0) + 1,
            }
          })
          dbg.varsPromise = populateTopFrameVariables(dbg, rawFrames)
        } else if (msg.method === 'Debugger.resumed') {
          dbg.status = 'running'
        }
      } catch {
        // ignore malformed CDP frame
      }
    })
  })

  await sendCdp(dbg, 'Debugger.enable')
  await sendCdp(dbg, 'Runtime.enable')
  if (options.breakpoints?.length) {
    await applyBreakpointsToSession(dbg, options.breakpoints)
  }
  await sendCdp(dbg, 'Runtime.runIfWaitingForDebugger')

  // Allow initial --inspect-brk pause + local variable extraction to settle
  await new Promise((r) => setTimeout(r, 320))
  if (dbg.varsPromise) await dbg.varsPromise
  return getDebugSnapshot()
}

export async function controlDebugSession(
  action: 'resume' | 'stepOver' | 'stepInto' | 'stepOut',
): Promise<DebugSnapshot> {
  const dbg = globalDebug.__vincezoneDebugger
  if (!dbg) return getDebugSnapshot()

  if (dbg.runtimeKind === 'python-pdb') {
    const cmdMap = { resume: 'c', stepOver: 'n', stepInto: 's', stepOut: 'r' } as const
    try {
      const out = await sendPdbCommand(dbg, cmdMap[action])
      parsePdbLocation(dbg, out)
      if (dbg.status === 'paused') {
        await refreshPdbState(dbg)
      }
    } catch (err) {
      dbg.error = err instanceof Error ? err.message : String(err)
    }
    return getDebugSnapshot()
  }

  const methodMap = {
    resume: 'Debugger.resume',
    stepOver: 'Debugger.stepOver',
    stepInto: 'Debugger.stepInto',
    stepOut: 'Debugger.stepOut',
  } as const

  try {
    dbg.varsPromise = null
    await sendCdp(dbg, methodMap[action])
    await new Promise((r) => setTimeout(r, 260))
    if (dbg.varsPromise) await dbg.varsPromise
  } catch (err) {
    dbg.error = err instanceof Error ? err.message : String(err)
  }
  return getDebugSnapshot()
}

export async function updateLiveBreakpoints(breakpoints: DebugBreakpoint[]) {
  const dbg = globalDebug.__vincezoneDebugger
  if (!dbg) return
  if (dbg.runtimeKind === 'python-pdb') {
    await sendPdbCommand(dbg, 'cl').catch(() => {})
    for (const bp of breakpoints) {
      try {
        const abs = resolvePathInsideWorkspace(dbg.cwd, bp.path)
        await sendPdbCommand(dbg, `b ${abs}:${bp.line}`)
      } catch {
        // ignore invalid path
      }
    }
    return
  }
  if (!dbg.ws || dbg.ws.readyState !== WebSocket.OPEN) return
  await applyBreakpointsToSession(dbg, breakpoints)
}

export async function evaluateDebugExpression(expression: string): Promise<{
  ok: boolean
  result: string
}> {
  const dbg = globalDebug.__vincezoneDebugger
  if (!dbg || dbg.status !== 'paused') {
    return { ok: false, result: 'Debugger must be paused at a frame to evaluate expressions.' }
  }
  if (dbg.runtimeKind === 'python-pdb') {
    try {
      const raw = await sendPdbCommand(dbg, `p ${expression}`)
      const clean = raw.replace(/\(Pdb\)\s*$/m, '').trim()
      dbg.consoleLines.push(`> ${expression} => ${clean}`)
      return { ok: !clean.startsWith('***'), result: clean || 'None' }
    } catch (err) {
      return { ok: false, result: err instanceof Error ? err.message : 'Python evaluation failed.' }
    }
  }
  if (!dbg.callFrames[0]) {
    return { ok: false, result: 'No active call frame available.' }
  }
  try {
    const res = (await sendCdp(dbg, 'Debugger.evaluateOnCallFrame', {
      callFrameId: dbg.callFrames[0].callFrameId,
      expression,
      returnByValue: false,
      generatePreview: true,
    })) as {
      result?: { type?: string; subtype?: string; value?: unknown; description?: string }
      exceptionDetails?: { text?: string; exception?: { description?: string } }
    }
    if (res.exceptionDetails) {
      const msg = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Error'
      dbg.consoleLines.push(`> ${expression} => ERROR: ${msg}`)
      return { ok: false, result: msg }
    }
    const formatted = formatRemoteObject(res.result)
    dbg.consoleLines.push(`> ${expression} => ${formatted}`)
    return { ok: true, result: formatted }
  } catch (err) {
    return { ok: false, result: err instanceof Error ? err.message : 'Evaluation failed.' }
  }
}

// ---------------------------------------------------------------------------
// 2C: Python Interactive Debugger (`python -u -m pdb`) + Node Attach Inspector
// ---------------------------------------------------------------------------

function sendPdbCommand(dbg: ManagedDebugger, command: string, timeoutMs = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!dbg.proc || dbg.proc.killed || dbg.proc.exitCode !== null) {
      reject(new Error('Python debugger process is not running.'))
      return
    }
    let collected = ''
    const timer = setTimeout(() => {
      dbg.pdbWaiters = dbg.pdbWaiters.filter((w) => w !== onChunk)
      resolve(collected)
    }, timeoutMs)

    const onChunk = (chunk: string) => {
      collected += chunk
      if (collected.includes('(Pdb) ') || collected.includes('The program finished')) {
        clearTimeout(timer)
        dbg.pdbWaiters = dbg.pdbWaiters.filter((w) => w !== onChunk)
        resolve(collected)
      }
    }
    dbg.pdbWaiters.push(onChunk)
    dbg.proc.stdin?.write(`${command}\n`)
  })
}

function parsePdbLocation(dbg: ManagedDebugger, output: string) {
  if (output.includes('The program finished')) {
    dbg.status = 'exited'
    dbg.callFrames = []
    dbg.variables = []
    return
  }
  const locMatch = output.match(/>\s+(.+?)\((\d+)\)([^(<\r\n]*)/)
  if (locMatch) {
    const rawFile = locMatch[1].trim()
    const line = Number(locMatch[2]) || 1
    const fnName = (locMatch[3] || '').replace(/\(\)$/, '').trim() || '<module>'
    const rel = path.relative(dbg.cwd, rawFile).replace(/\\/g, '/')
    const displayPath = rel && !rel.startsWith('..') ? rel : dbg.targetFile
    dbg.status = 'paused'
    dbg.callFrames = [
      {
        callFrameId: 'py-frame-0',
        functionName: fnName,
        path: displayPath,
        line,
        column: 1,
      },
    ]
  }
}

async function refreshPdbState(dbg: ManagedDebugger) {
  try {
    const localsOut = await sendPdbCommand(
      dbg,
      `import json as _vzj; print('__VZLOCALS__' + _vzj.dumps({k: [type(v).__name__, repr(v)[:100]] for k, v in locals().items() if not k.startswith('__') and k != '_vzj'}))`,
      2500,
    )
    const m = localsOut.match(/__VZLOCALS__(\{.*\})/)
    if (m) {
      const parsed = JSON.parse(m[1]) as Record<string, [string, string]>
      dbg.variables = Object.entries(parsed)
        .slice(0, 30)
        .map(([name, [type, value]]) => ({ name, type, value }))
    }
  } catch {
    // ignore unserializable locals
  }
}

async function startPythonDebugSession(options: {
  cwd: string
  absTarget: string
  targetFile: string
  breakpoints: DebugBreakpoint[]
}): Promise<DebugSnapshot> {
  const pyBin = resolvePythonExecutable()
  const proc = spawn(pyBin, ['-u', '-m', 'pdb', options.absTarget], {
    cwd: options.cwd,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })

  const dbg: ManagedDebugger = {
    runtimeKind: 'python-pdb',
    proc,
    ws: null,
    cwd: options.cwd,
    targetFile: options.targetFile,
    status: 'starting',
    nextMsgId: 1,
    pending: new Map(),
    scriptUrls: new Map(),
    callFrames: [],
    variables: [],
    consoleLines: [`[Python Debugger] Launching ${options.targetFile} via pdb…`],
    error: null,
    breakpointIds: [],
    varsPromise: null,
    pdbBuffer: '',
    pdbWaiters: [],
  }
  globalDebug.__vincezoneDebugger = dbg

  const handleData = (chunk: Buffer, prefix = '') => {
    const text = chunk.toString('utf8')
    for (const waiter of [...dbg.pdbWaiters]) waiter(text)
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      if (line.includes('__VZLOCALS__')) continue
      dbg.consoleLines.push(`${prefix}${line.slice(0, 280)}`)
      if (dbg.consoleLines.length > 100) dbg.consoleLines.shift()
    }
  }

  proc.stdout?.on('data', (c: Buffer) => handleData(c, ''))
  proc.stderr?.on('data', (c: Buffer) => handleData(c, '[stderr] '))
  proc.on('exit', (code) => {
    dbg.status = 'exited'
    dbg.callFrames = []
    dbg.variables = []
    dbg.consoleLines.push(`[Python Debugger] Exited with code ${code ?? 0}`)
  })

  // Wait for initial `(Pdb) ` prompt
  const initialOut = await new Promise<string>((resolve) => {
    let buf = ''
    const timer = setTimeout(() => {
      dbg.pdbWaiters = dbg.pdbWaiters.filter((w) => w !== onChunk)
      resolve(buf)
    }, 4500)
    const onChunk = (c: string) => {
      buf += c
      if (buf.includes('(Pdb) ')) {
        clearTimeout(timer)
        dbg.pdbWaiters = dbg.pdbWaiters.filter((w) => w !== onChunk)
        resolve(buf)
      }
    }
    dbg.pdbWaiters.push(onChunk)
  })

  parsePdbLocation(dbg, initialOut)
  for (const bp of options.breakpoints) {
    try {
      const abs = resolvePathInsideWorkspace(options.cwd, bp.path)
      await sendPdbCommand(dbg, `b ${abs}:${bp.line}`)
    } catch {
      // ignore invalid bp
    }
  }
  if (dbg.status === 'paused') {
    await refreshPdbState(dbg)
  }
  return getDebugSnapshot()
}

/**
 * Attaches to an already-running Node.js V8 Inspector on a local port (e.g. 9229).
 */
export async function attachNodeDebugSession(options: {
  cwd: string
  port?: number
  wsUrl?: string
}): Promise<DebugSnapshot> {
  stopDebugSession()
  const cwd = path.resolve(options.cwd || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd())
  let wsUrl = options.wsUrl?.trim() || ''
  if (!wsUrl) {
    const port = Math.min(65535, Math.max(1024, Number(options.port) || 9229))
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`No Node inspector found on 127.0.0.1:${port}`)
    const targets = (await res.json()) as Array<{ webSocketDebuggerUrl?: string; title?: string }>
    wsUrl = targets.find((t) => t.webSocketDebuggerUrl)?.webSocketDebuggerUrl || ''
    if (!wsUrl) throw new Error(`Inspector on port ${port} has no WebSocket target.`)
  }

  const dbg: ManagedDebugger = {
    runtimeKind: 'node-cdp',
    proc: null,
    ws: null,
    cwd,
    targetFile: `attach:${wsUrl}`,
    status: 'running',
    nextMsgId: 1,
    pending: new Map(),
    scriptUrls: new Map(),
    callFrames: [],
    variables: [],
    consoleLines: [`[Debugger] Attached to running V8 Inspector (${wsUrl})`],
    error: null,
    breakpointIds: [],
    varsPromise: null,
    pdbBuffer: '',
    pdbWaiters: [],
  }
  globalDebug.__vincezoneDebugger = dbg

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    dbg.ws = ws
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () => reject(new Error('Failed to attach to Inspector WebSocket.')))
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: number
          result?: unknown
          error?: { message?: string }
          method?: string
          params?: Record<string, unknown>
        }
        if (typeof msg.id === 'number') {
          const waiter = dbg.pending.get(msg.id)
          if (waiter) {
            dbg.pending.delete(msg.id)
            if (msg.error) waiter.reject(new Error(msg.error.message || 'CDP error'))
            else waiter.resolve(msg.result)
          }
          return
        }
        if (msg.method === 'Debugger.paused' && msg.params) {
          dbg.status = 'paused'
          const rawFrames =
            (msg.params.callFrames as Array<{
              callFrameId: string
              functionName?: string
              url?: string
              location?: { scriptId?: string; lineNumber?: number; columnNumber?: number }
              scopeChain?: Array<{ type?: string; object?: { objectId?: string } }>
            }>) ?? []
          dbg.callFrames = rawFrames.slice(0, 15).map((f) => ({
            callFrameId: f.callFrameId,
            functionName: f.functionName || '(top-level)',
            path: normalizeScriptPath(f.url || '', dbg.cwd),
            line: (f.location?.lineNumber ?? 0) + 1,
            column: (f.location?.columnNumber ?? 0) + 1,
          }))
          dbg.varsPromise = populateTopFrameVariables(dbg, rawFrames)
        } else if (msg.method === 'Debugger.resumed') {
          dbg.status = 'running'
        }
      } catch {
        // ignore
      }
    })
  })

  await sendCdp(dbg, 'Debugger.enable')
  await sendCdp(dbg, 'Runtime.enable')
  return getDebugSnapshot()
}
