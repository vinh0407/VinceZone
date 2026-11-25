import path from 'node:path'
import { isLoopbackRequest } from '@/lib/local-guard'
import { semanticSearchWorkspace } from '@/lib/semantic-index'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ ok: false, error: 'Local workspace access required.' }, { status: 403 })
  }

  let body: { root?: string; query?: string; topK?: number }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const query = body.query?.trim()
  if (!query) {
    return Response.json({ ok: false, error: 'query is required.' }, { status: 400 })
  }

  const root = path.resolve(
    /*turbopackIgnore: true*/ body.root?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )

  try {
    const result = await semanticSearchWorkspace(root, query, body.topK ?? 12)
    return Response.json({ ok: true, query, ...result })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Semantic search failed.' },
      { status: 500 },
    )
  }
}
