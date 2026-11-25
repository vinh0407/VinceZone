import path from 'node:path'
import {
  createAgentWorktree,
  getAgentWorktreeDiff,
  listAgentWorktrees,
  mergeAgentWorktree,
  removeAgentWorktree,
} from '@/lib/agent-worktree'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ ok: false, error: 'Local workspace access required.' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const root = path.resolve(
    /*turbopackIgnore: true*/ searchParams.get('root')?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )
  try {
    const worktrees = await listAgentWorktrees(root)
    return Response.json({ ok: true, worktrees })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to list worktrees.' },
      { status: 400 },
    )
  }
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ ok: false, error: 'Local workspace access required.' }, { status: 403 })
  }

  let body: { action?: 'create' | 'diff' | 'merge' | 'remove'; root?: string; slug?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const root = path.resolve(
    /*turbopackIgnore: true*/ body.root?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )
  const slug = body.slug?.trim() || ''

  try {
    if (body.action === 'create') {
      const worktree = await createAgentWorktree(root, slug)
      return Response.json({ ok: true, worktree })
    }
    if (body.action === 'diff') {
      const diff = await getAgentWorktreeDiff(root, slug)
      return Response.json({ ok: true, diff })
    }
    if (body.action === 'merge') {
      const res = await mergeAgentWorktree(root, slug)
      return Response.json({ ok: true, ...res })
    }
    if (body.action === 'remove') {
      const res = await removeAgentWorktree(root, slug)
      return Response.json({ ok: true, ...res })
    }
    return Response.json({ ok: false, error: 'Unsupported worktree action.' }, { status: 400 })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Worktree operation failed.' },
      { status: 400 },
    )
  }
}
