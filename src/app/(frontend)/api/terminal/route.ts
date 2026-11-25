import { exec } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)
const MAX_OUTPUT_CHARS = 32_000

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json(
      { error: 'Local terminal execution is restricted to desktop localhost.' },
      { status: 403 },
    )
  }

  let body: { command?: string; cwd?: string }
  try {
    body = (await request.json()) as { command?: string; cwd?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const command = body.command?.trim()
  if (!command || command.length > 2000) {
    return Response.json({ error: 'A valid command is required.' }, { status: 400 })
  }

  const cwd = path.resolve(/*turbopackIgnore: true*/ body.cwd?.trim() || process.cwd())
  try {
    const info = await stat(/*turbopackIgnore: true*/ cwd)
    if (!info.isDirectory()) {
      return Response.json({ error: 'Working directory is invalid.' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Working directory does not exist.' }, { status: 404 })
  }

  const startedAt = Date.now()
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 25_000,
      maxBuffer: 1024 * 1024,
      shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
      windowsHide: true,
    })

    return Response.json(
      {
        ok: true,
        exitCode: 0,
        cwd,
        durationMs: Date.now() - startedAt,
        stdout: stdout.slice(0, MAX_OUTPUT_CHARS),
        stderr: stderr.slice(0, MAX_OUTPUT_CHARS),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string; message?: string }
    return Response.json(
      {
        ok: false,
        exitCode: typeof err.code === 'number' ? err.code : 1,
        cwd,
        durationMs: Date.now() - startedAt,
        stdout: String(err.stdout ?? '').slice(0, MAX_OUTPUT_CHARS),
        stderr: String(err.stderr || err.message || 'Command failed.').slice(0, MAX_OUTPUT_CHARS),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
