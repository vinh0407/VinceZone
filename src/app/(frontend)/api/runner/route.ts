import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

type ManagedWebServer = {
  proc: ChildProcess
  pid: number | undefined
  cwd: string
  command: string
  url: string
  startedAt: string
  logs: string[]
}

const globalRunner = globalThis as typeof globalThis & {
  __vincezoneWebServer?: ManagedWebServer | null
}

function getManagedServer(): ManagedWebServer | null {
  const srv = globalRunner.__vincezoneWebServer ?? null
  if (srv && (srv.proc.killed || srv.proc.exitCode !== null)) {
    globalRunner.__vincezoneWebServer = null
    return null
  }
  return srv
}

function killProcessTree(pid: number) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  } else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // already exited
      }
    }
  }
}

async function detectWebStartScript(cwd: string): Promise<{
  bin: string
  args: string[]
  commandLabel: string
  defaultUrl: string
}> {
  let pkg: { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
  try {
    pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'))
  } catch {
    // fallback below
  }

  // If targeting VinceZone itself, it is already running on localhost:40704
  if (pkg.name === 'vincezone-studio') {
    return {
      bin: '',
      args: [],
      commandLabel: 'already-running',
      defaultUrl: 'http://localhost:40704',
    }
  }

  const devScript = pkg.scripts?.dev || ''
  const isVite = Boolean(pkg.devDependencies?.vite || pkg.dependencies?.vite || devScript.includes('vite'))
  const portMatch = devScript.match(/(?:--port|-p)\s+(\d{3,5})/)
  const port = portMatch ? portMatch[1] : isVite ? '5173' : '3000'
  const scriptName = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : 'dev'

  const usePnpm = Boolean(
    await stat(path.join(cwd, 'pnpm-lock.yaml'))
      .then(() => true)
      .catch(() => false),
  )
  const pm = usePnpm ? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm') : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = usePnpm ? [scriptName] : ['run', scriptName]

  return {
    bin: pm,
    args,
    commandLabel: `${usePnpm ? 'pnpm' : 'npm'} ${args.join(' ')}`,
    defaultUrl: `http://localhost:${port}`,
  }
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Runner API is restricted to localhost.' }, { status: 403 })
  }

  const srv = getManagedServer()
  return Response.json(
    {
      running: Boolean(srv),
      pid: srv?.pid ?? null,
      cwd: srv?.cwd ?? null,
      command: srv?.command ?? null,
      url: srv?.url ?? null,
      startedAt: srv?.startedAt ?? null,
      logs: srv?.logs.slice(-40) ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Runner API is restricted to localhost.' }, { status: 403 })
  }

  let body: { action?: string; cwd?: string; command?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const cwd = path.resolve(body.cwd?.trim() || process.cwd())

  if (body.action === 'stop-web') {
    const existing = getManagedServer()
    if (existing?.pid) {
      killProcessTree(existing.pid)
    }
    globalRunner.__vincezoneWebServer = null
    return Response.json({ ok: true, running: false })
  }

  if (body.action === 'start-web') {
    const existing = getManagedServer()
    if (existing && existing.cwd === cwd) {
      return Response.json({
        ok: true,
        running: true,
        url: existing.url,
        command: existing.command,
        pid: existing.pid,
        logs: existing.logs.slice(-20),
      })
    }
    if (existing?.pid) {
      killProcessTree(existing.pid)
      globalRunner.__vincezoneWebServer = null
    }

    const plan = await detectWebStartScript(cwd)
    if (plan.commandLabel === 'already-running') {
      return Response.json({
        ok: true,
        running: true,
        alreadyRunning: true,
        url: plan.defaultUrl,
        command: 'VinceZone Studio (localhost:40704)',
        logs: ['VinceZone Studio is already serving on http://localhost:40704'],
      })
    }

    const child = spawn(plan.bin, plan.args, {
      cwd,
      windowsHide: true,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    const managed: ManagedWebServer = {
      proc: child,
      pid: child.pid,
      cwd,
      command: plan.commandLabel,
      url: plan.defaultUrl,
      startedAt: new Date().toISOString(),
      logs: [`Started "${plan.commandLabel}" in ${cwd}`],
    }

    const captureOutput = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        managed.logs.push(line.slice(0, 240))
        if (managed.logs.length > 80) managed.logs.shift()
        const urlMatch = line.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}/i)
        if (urlMatch) {
          managed.url = urlMatch[0].replace('0.0.0.0', 'localhost')
        }
      }
    }

    child.stdout?.on('data', captureOutput)
    child.stderr?.on('data', captureOutput)
    child.on('exit', (code) => {
      managed.logs.push(`Process exited with code ${code ?? 0}`)
      if (globalRunner.__vincezoneWebServer === managed) {
        globalRunner.__vincezoneWebServer = null
      }
    })

    globalRunner.__vincezoneWebServer = managed

    // Wait briefly (up to 2.5s) to catch early URL output before returning
    await new Promise((resolve) => setTimeout(resolve, 1800))

    return Response.json({
      ok: true,
      running: !child.killed && child.exitCode === null,
      url: managed.url,
      command: managed.command,
      pid: managed.pid,
      logs: managed.logs.slice(-20),
    })
  }

  if (body.action === 'run-silent') {
    const command = (body.command || '').trim()
    if (!command || command.length > 500) {
      return Response.json({ ok: false, error: 'Command is required.' }, { status: 400 })
    }

    const isWin = process.platform === 'win32'
    const shellBin = isWin ? 'powershell.exe' : '/bin/sh'
    const shellArgs = isWin
      ? ['-NoProfile', '-NonInteractive', '-Command', command]
      : ['-lc', command]

    const started = Date.now()
    try {
      const { stdout, stderr } = await execFileAsync(shellBin, shellArgs, {
        cwd,
        timeout: 45_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      })
      return Response.json({
        ok: true,
        exitCode: 0,
        cwd,
        durationMs: Date.now() - started,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
      return Response.json({
        ok: false,
        exitCode: typeof err.code === 'number' ? err.code : 1,
        cwd,
        durationMs: Date.now() - started,
        stdout: (err.stdout || '').trim(),
        stderr: (err.stderr || err.message || 'Command failed.').trim(),
      })
    }
  }

  return Response.json({ ok: false, error: 'Unsupported runner action.' }, { status: 400 })
}
