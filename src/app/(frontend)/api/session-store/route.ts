import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveSessionFile(rootParam?: string | null): string {
  const base = path.resolve(
    /*turbopackIgnore: true*/ rootParam?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )
  return path.join(base, '.vincezone', 'session-store.json')
}

/**
 * Durable unlimited disk persistence for VinceZone Studio project sessions
 * (chat history, agent tasks, communication logs, proposed patches, revisions,
 * memory notes, usage history) stored in `<workspace>/.vincezone/session-store.json`
 * so long multi-day sessions never hit browser localStorage 5–10 MB limits.
 */
export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local desktop runtime required.' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const filePath = resolveSessionFile(searchParams.get('root'))

  try {
    const raw = await readFile(filePath, 'utf8')
    const info = await stat(filePath)
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Response.json(
      {
        ok: true,
        exists: true,
        path: filePath,
        sizeBytes: info.size,
        session: parsed,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { ok: true, exists: false, path: filePath, sizeBytes: 0, session: null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local desktop runtime required.' }, { status: 403 })
  }

  let body: { root?: string; session?: Record<string, unknown> }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body.session || typeof body.session !== 'object') {
    return Response.json({ error: 'Missing session payload.' }, { status: 400 })
  }

  const filePath = resolveSessionFile(body.root)
  const dir = path.dirname(filePath)
  const tmpPath = `${filePath}.${Date.now()}.tmp`

  try {
    await mkdir(dir, { recursive: true })
    const serialized = JSON.stringify(
      {
        ...body.session,
        savedAt: new Date().toISOString(),
        schemaVersion: 2,
      },
      null,
      2,
    )
    await writeFile(tmpPath, serialized, 'utf8')
    await rename(tmpPath, filePath)
    return Response.json({
      ok: true,
      path: filePath,
      sizeBytes: Buffer.byteLength(serialized, 'utf8'),
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to save session store.' },
      { status: 500 },
    )
  }
}
