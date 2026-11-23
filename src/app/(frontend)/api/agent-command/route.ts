import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { classifyShellCommand } from '@/lib/agent-tools'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

/**
 * Executes a shell command explicitly approved by the user from an AI Agent
 * Allow / Deny card inside the chat stream (e.g. `pnpm add`, `gradlew assembleDebug`,
 * `prisma migrate`). Runs silently (`windowsHide: true`) with catastrophic-command protection.
 */
export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local desktop runtime required.' }, { status: 403 })
  }

  let body: {
    action?: 'approve' | 'reject'
    command?: string
    cwd?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const command = String(body.command || '').trim()
  if (!command) {
    return Response.json({ error: 'Missing command.' }, { status: 400 })
  }

  if (body.action === 'reject') {
    return Response.json({ ok: true, status: 'rejected', command, output: 'User denied command execution.' })
  }

  const verdict = classifyShellCommand(command)
  if (verdict.status === 'blocked') {
    return Response.json({ ok: false, error: verdict.reason }, { status: 403 })
  }

  const cwd = path.resolve(
    /*turbopackIgnore: true*/ body.cwd?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )

  const startedAt = Date.now()
  const isWin = process.platform === 'win32'
  const shellBin = isWin ? 'powershell.exe' : '/bin/sh'
  const shellArgs = isWin
    ? ['-NoProfile', '-NonInteractive', '-Command', command]
    : ['-lc', command]

  try {
    const { stdout, stderr } = await execFileAsync(shellBin, shellArgs, {
      cwd,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
    return Response.json({
      ok: true,
      status: 'completed',
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      command,
      output: `${stdout || ''}${stderr ? `\n${stderr}` : ''}`.trim().slice(0, 12_000) || '(exit 0)',
    })
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
    return Response.json({
      ok: false,
      status: 'failed',
      exitCode: typeof err.code === 'number' ? err.code : 1,
      durationMs: Date.now() - startedAt,
      command,
      output: `${err.stdout || ''}\n${err.stderr || err.message || 'Command failed.'}`
        .trim()
        .slice(0, 12_000),
    })
  }
}
