import { isLoopbackRequest } from '@/lib/local-guard'
import { cleanupAllRuntimeProcesses, ensureProcessCleanupHooks } from '@/lib/process-cleanup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  ensureProcessCleanupHooks()
  return Response.json(
    {
      app: 'vincezone',
      product: 'VinceZone Studio',
      version: '2.2.0',
      port: Number(process.env.PORT || 40704),
      cwd: process.cwd(),
      platform: process.platform,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local desktop runtime required.' }, { status: 403 })
  }
  let body: { action?: string } = {}
  try {
    body = (await request.json()) as { action?: string }
  } catch {
    // allow empty body
  }
  if (body.action === 'shutdown') {
    const summary = cleanupAllRuntimeProcesses()
    return Response.json({ ok: true, ...summary })
  }
  return Response.json({ ok: true })
}
