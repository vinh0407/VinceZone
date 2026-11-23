import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

async function runGit(args: string[], cwd: string, timeout = 15_000) {
  return execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  })
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Git API is restricted to localhost.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cwd = path.resolve(
    searchParams.get('root')?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd(),
  )

  try {
    const [statusRes, logRes] = await Promise.all([
      runGit(['status', '--porcelain=v1', '-b'], cwd),
      runGit(['log', '-n', '8', '--pretty=format:%h|%s|%cr|%an'], cwd).catch(() => ({
        stdout: '',
      })),
    ])

    const lines = statusRes.stdout.split(/\r?\n/).filter(Boolean)
    const header = lines[0] || ''
    const branchMatch = header.match(/^##\s+([^\s.]+)/)
    const branch = branchMatch ? branchMatch[1] : 'main'
    const aheadMatch = header.match(/ahead\s+(\d+)/)
    const behindMatch = header.match(/behind\s+(\d+)/)

    const changes: Array<{
      path: string
      indexStatus: string
      worktreeStatus: string
      staged: boolean
    }> = []

    for (const line of lines.slice(1)) {
      if (line.length < 4) continue
      const indexStatus = line[0]
      const worktreeStatus = line[1]
      const filePath = line.slice(3).trim()
      changes.push({
        path: filePath,
        indexStatus,
        worktreeStatus,
        staged: indexStatus !== ' ' && indexStatus !== '?',
      })
    }

    const commits = logRes.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((row) => {
        const [hash, message, time, author] = row.split('|')
        return {
          hash: hash || '',
          subject: message || '',
          relativeTime: time || '',
          message: message || '',
          time: time || '',
          author: author || '',
        }
      })

    return Response.json(
      {
        isRepo: true,
        branch,
        ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
        behind: behindMatch ? Number(behindMatch[1]) : 0,
        changes,
        commits,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return Response.json(
      {
        isRepo: false,
        branch: '',
        ahead: 0,
        behind: 0,
        changes: [],
        commits: [],
        error: error instanceof Error ? error.message : 'Not a git repository.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Git API is restricted to localhost.' }, { status: 403 })
  }

  let body: {
    action?: 'stage' | 'stage-all' | 'unstage' | 'commit' | 'push' | 'diff' | 'discard'
    root?: string
    path?: string
    message?: string
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const cwd = path.resolve(
    body.root?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd(),
  )

  try {
    if (body.action === 'stage' && body.path) {
      await runGit(['add', '--', body.path], cwd)
      return Response.json({ ok: true })
    }
    if (body.action === 'stage-all') {
      await runGit(['add', '-A'], cwd)
      return Response.json({ ok: true })
    }
    if (body.action === 'unstage' && body.path) {
      await runGit(['restore', '--staged', '--', body.path], cwd)
      return Response.json({ ok: true })
    }
    if (body.action === 'discard' && body.path) {
      await runGit(['checkout', '--', body.path], cwd)
      return Response.json({ ok: true })
    }
    if (body.action === 'diff') {
      const args = body.path ? ['diff', '--', body.path] : ['diff']
      const { stdout } = await runGit(args, cwd)
      return Response.json({ ok: true, diff: stdout.slice(0, 60_000) })
    }
    if (body.action === 'commit') {
      const msg = (body.message || '').trim()
      if (!msg) return Response.json({ ok: false, error: 'Commit message is required.' }, { status: 400 })
      const { stdout } = await runGit(['commit', '-m', msg], cwd)
      return Response.json({ ok: true, output: stdout.trim() })
    }
    if (body.action === 'push') {
      const { stdout, stderr } = await runGit(['push'], cwd, 30_000)
      return Response.json({ ok: true, output: (stdout || stderr).trim() })
    }
    return Response.json({ ok: false, error: 'Unsupported git action.' }, { status: 400 })
  } catch (error) {
    const err = error as { stderr?: string; message?: string }
    return Response.json(
      { ok: false, error: (err.stderr || err.message || 'Git action failed.').trim() },
      { status: 400 },
    )
  }
}
