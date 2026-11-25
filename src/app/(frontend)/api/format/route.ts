import path from 'node:path'
import { formatCodeWithProjectTool } from '@/lib/code-formatter'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ ok: false, error: 'Local workspace access required.' }, { status: 403 })
  }

  let body: { root?: string; path?: string; content?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const relPath = body.path?.trim()
  if (!relPath || typeof body.content !== 'string') {
    return Response.json({ ok: false, error: 'path and content are required.' }, { status: 400 })
  }

  const root = path.resolve(
    /*turbopackIgnore: true*/ body.root?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )

  const result = await formatCodeWithProjectTool({
    workspaceRoot: root,
    filePath: relPath,
    content: body.content,
  })
  return Response.json({ ok: true, ...result })
}
