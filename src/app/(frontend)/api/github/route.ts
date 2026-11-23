import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

async function runGh(args: string[]) {
  return execFileAsync('gh', args, { timeout: 10_000, windowsHide: true })
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'GitHub integration is restricted to localhost.' }, { status: 403 })
  }

  try {
    const { stdout, stderr } = await runGh(['auth', 'status'])
    const combined = `${stdout}\n${stderr}`
    const accountMatch = combined.match(/account\s+([^\s(]+)/i)
    const scopesMatch = combined.match(/Token scopes:\s*(.+)/i)

    let repos: Array<{ name: string; url: string; visibility: string; updatedAt: string }> = []
    try {
      const repoRes = await runGh([
        'repo',
        'list',
        '--limit',
        '10',
        '--json',
        'name,url,visibility,updatedAt',
      ])
      repos = JSON.parse(repoRes.stdout)
    } catch {
      // Ignore repo listing failure
    }

    return Response.json(
      {
        ghInstalled: true,
        authenticated: true,
        username: accountMatch?.[1] || 'authenticated',
        scopes: scopesMatch?.[1]?.trim() || '',
        repos,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const err = error as { code?: string; stderr?: string; message?: string }
    const missing = err.code === 'ENOENT'
    return Response.json(
      {
        ghInstalled: !missing,
        authenticated: false,
        username: null,
        scopes: '',
        repos: [],
        detail: missing ? 'GitHub CLI (gh) is not installed.' : 'Not signed in to GitHub.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'GitHub integration is restricted to localhost.' }, { status: 403 })
  }

  let body: { action?: string; token?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (body.action === 'login-token' && body.token?.trim()) {
    try {
      const child = execFile('gh', ['auth', 'login', '--with-token'], {
        timeout: 10_000,
        windowsHide: true,
      })
      child.stdin?.write(`${body.token.trim()}\n`)
      child.stdin?.end()
      await new Promise<void>((resolve, reject) => {
        child.on('exit', (code) =>
          code === 0 ? resolve() : reject(new Error(`gh exited with code ${code}`)),
        )
        child.on('error', reject)
      })
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'GitHub token sign-in failed.' },
        { status: 400 },
      )
    }
  }

  if (body.action === 'logout') {
    try {
      await runGh(['auth', 'logout', '--hostname', 'github.com'])
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'GitHub logout failed.' },
        { status: 400 },
      )
    }
  }

  return Response.json({ error: 'Unsupported GitHub action.' }, { status: 400 })
}
