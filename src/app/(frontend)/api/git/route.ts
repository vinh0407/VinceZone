import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolveConflictBlocks } from '@/lib/git-conflicts'
import { isLoopbackRequest, resolvePathInsideWorkspace } from '@/lib/local-guard'
import { fetchProviderWithFallback } from '@/lib/provider-fallback'
import { resolveSafeProviderEndpoint } from '@/lib/provider-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

async function runGit(args: string[], cwd: string, timeout = 15_000) {
  return execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  })
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Git API is restricted to localhost.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const cwd = path.resolve(
    /*turbopackIgnore: true*/ searchParams.get('root')?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )

  try {
    const [statusRes, logRes, branchRes, stashRes] = await Promise.all([
      runGit(['status', '--porcelain=v1', '-b'], cwd),
      runGit(['log', '-n', '10', '--pretty=format:%h|%s|%cr|%an'], cwd).catch(() => ({
        stdout: '',
      })),
      runGit(['branch', '--format=%(refname:short)'], cwd).catch(() => ({ stdout: '' })),
      runGit(['stash', 'list', '-n', '10', '--pretty=format:%gd|%gs'], cwd).catch(() => ({
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
      conflicted: boolean
    }> = []
    const conflicts: string[] = []

    for (const line of lines.slice(1)) {
      if (line.length < 4) continue
      const indexStatus = line[0]
      const worktreeStatus = line[1]
      const filePath = line.slice(3).trim()
      const pair = `${indexStatus}${worktreeStatus}`
      const conflicted = ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'].includes(pair)
      if (conflicted) conflicts.push(filePath)
      changes.push({
        path: filePath,
        indexStatus,
        worktreeStatus,
        staged: indexStatus !== ' ' && indexStatus !== '?' && !conflicted,
        conflicted,
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

    const branches = branchRes.stdout
      .split(/\r?\n/)
      .map((b) => b.trim())
      .filter(Boolean)

    const stashes = stashRes.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((row) => {
        const [ref, ...rest] = row.split('|')
        return { ref: ref || 'stash@{0}', message: rest.join('|') || 'WIP' }
      })

    return Response.json(
      {
        isRepo: true,
        branch,
        branches,
        stashes,
        conflicts,
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
        branches: [],
        stashes: [],
        conflicts: [],
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
    action?:
      | 'stage'
      | 'stage-all'
      | 'unstage'
      | 'commit'
      | 'push'
      | 'pull'
      | 'fetch'
      | 'checkout'
      | 'create-branch'
      | 'stash-push'
      | 'stash-pop'
      | 'file-diff-contents'
      | 'resolve-conflict'
      | 'ai-commit-message'
      | 'diff'
      | 'discard'
    root?: string
    path?: string
    message?: string
    branch?: string
    strategy?: 'ours' | 'theirs' | 'both'
    baseUrl?: string
    apiKey?: string
    model?: string
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const cwd = path.resolve(
    /*turbopackIgnore: true*/ body.root?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
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
    if (body.action === 'file-diff-contents' && body.path) {
      const safeRel = body.path.replace(/\\/g, '/')
      const absTarget = resolvePathInsideWorkspace(cwd, safeRel)
      let original = ''
      try {
        const { stdout } = await runGit(['show', `HEAD:${safeRel}`], cwd)
        original = stdout
      } catch {
        original = ''
      }
      let modified = ''
      try {
        modified = await readFile(absTarget, 'utf8')
      } catch {
        modified = ''
      }
      return Response.json({ ok: true, path: safeRel, original, modified })
    }
    if (body.action === 'resolve-conflict' && body.path && body.strategy) {
      const safeRel = body.path.replace(/\\/g, '/')
      const absTarget = resolvePathInsideWorkspace(cwd, safeRel)
      const current = await readFile(absTarget, 'utf8')
      const { resolved, count } = resolveConflictBlocks(current, body.strategy)
      await writeFile(absTarget, resolved, 'utf8')
      await runGit(['add', '--', safeRel], cwd)
      return Response.json({ ok: true, path: safeRel, resolvedBlocks: count, content: resolved })
    }
    if (body.action === 'checkout' && body.branch?.trim()) {
      const branch = body.branch.trim()
      if (!/^[a-zA-Z0-9._/-]+$/.test(branch)) {
        return Response.json({ ok: false, error: 'Invalid branch name.' }, { status: 400 })
      }
      const { stdout, stderr } = await runGit(['checkout', branch], cwd)
      return Response.json({ ok: true, output: (stdout || stderr).trim() })
    }
    if (body.action === 'create-branch' && body.branch?.trim()) {
      const branch = body.branch.trim()
      if (!/^[a-zA-Z0-9._/-]+$/.test(branch)) {
        return Response.json({ ok: false, error: 'Invalid branch name.' }, { status: 400 })
      }
      const { stdout, stderr } = await runGit(['checkout', '-b', branch], cwd)
      return Response.json({ ok: true, output: (stdout || stderr).trim() })
    }
    if (body.action === 'pull') {
      const { stdout, stderr } = await runGit(['pull', '--ff-only'], cwd, 30_000)
      return Response.json({ ok: true, output: (stdout || stderr).trim() })
    }
    if (body.action === 'fetch') {
      const { stdout, stderr } = await runGit(['fetch', '--all', '--prune'], cwd, 30_000)
      return Response.json({ ok: true, output: (stdout || stderr).trim() })
    }
    if (body.action === 'stash-push') {
      const msg = (body.message || 'VinceZone WIP stash').trim()
      const { stdout, stderr } = await runGit(['stash', 'push', '-u', '-m', msg], cwd)
      return Response.json({ ok: true, output: (stdout || stderr).trim() })
    }
    if (body.action === 'stash-pop') {
      const { stdout, stderr } = await runGit(['stash', 'pop'], cwd)
      return Response.json({ ok: true, output: (stdout || stderr).trim() })
    }
    if (body.action === 'ai-commit-message') {
      const staged = await runGit(['diff', '--cached', '--stat'], cwd).catch(() => ({ stdout: '' }))
      const stagedPatch = await runGit(['diff', '--cached'], cwd).catch(() => ({ stdout: '' }))
      const unstagedPatch = !stagedPatch.stdout.trim()
        ? await runGit(['diff'], cwd).catch(() => ({ stdout: '' }))
        : { stdout: '' }
      const diffSample = (stagedPatch.stdout || unstagedPatch.stdout || staged.stdout).slice(0, 7000)
      if (!diffSample.trim()) {
        return Response.json({ ok: false, error: 'No git diff available to summarize.' }, { status: 400 })
      }
      const endpoint = await resolveSafeProviderEndpoint(
        body.baseUrl || 'http://localhost:20128/v1',
        undefined,
        { allowLocalLoopback: true },
      )
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(body.apiKey ? { Authorization: `Bearer ${body.apiKey}` } : {}),
      }
      const attempt = await fetchProviderWithFallback({
        endpoint,
        headers,
        model: body.model || 'always-on',
        payload: {
          stream: false,
          temperature: 0.1,
          max_tokens: 80,
          messages: [
            {
              role: 'system',
              content:
                'Generate ONE concise Conventional Commit subject line (max 72 chars, e.g. "feat(git): add branch switcher and stash controls"). Output ONLY the single subject line with no quotes, markdown, or extra explanation.',
            },
            {
              role: 'user',
              content: `Git diff:\n${diffSample}`,
            },
          ],
        },
        timeoutMs: 12_000,
      })
      if (!attempt.response.ok) {
        return Response.json({ ok: false, error: `AI provider returned ${attempt.response.status}` }, { status: 502 })
      }
      const data = (await attempt.response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const suggested = (data.choices?.[0]?.message?.content || '')
        .replace(/^```[\w]*\n?|\n?```$/g, '')
        .replace(/^["']|["']$/g, '')
        .split(/\r?\n/)[0]
        .trim()
        .slice(0, 88)
      return Response.json({ ok: true, message: suggested || 'chore: update workspace files' })
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
      { ok: false, error: (err.stderr || err.message || 'Git command failed.').trim() },
      { status: 500 },
    )
  }
}
