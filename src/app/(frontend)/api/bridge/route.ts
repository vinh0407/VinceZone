import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BridgeMessage } from '@/lib/agent-bridge'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BRIDGE_MESSAGES = 120

function getBridgeFilePath(root?: string) {
  const base = path.resolve(root?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd())
  return path.join(base, '.vincezone', 'agent-bridge.json')
}

async function readBridgeMessages(filePath: string): Promise<BridgeMessage[]> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as { messages?: BridgeMessage[] }
    return Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_BRIDGE_MESSAGES) : []
  } catch {
    return []
  }
}

async function writeBridgeMessages(filePath: string, messages: BridgeMessage[]) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(
    filePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), messages: messages.slice(-MAX_BRIDGE_MESSAGES) }, null, 2),
    'utf8',
  )
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Agent Bridge API is restricted to localhost.' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const filePath = getBridgeFilePath(searchParams.get('root') || undefined)
  const messages = await readBridgeMessages(filePath)
  return Response.json({ ok: true, messages }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Agent Bridge API is restricted to localhost.' }, { status: 403 })
  }

  let body: {
    action?: 'post' | 'clear'
    root?: string
    message?: BridgeMessage
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const filePath = getBridgeFilePath(body.root)
  try {
    if (body.action === 'clear') {
      await writeBridgeMessages(filePath, [])
      return Response.json({ ok: true, messages: [] })
    }
    if (body.action === 'post' && body.message) {
      const current = await readBridgeMessages(filePath)
      const next = [...current.filter((m) => m.id !== body.message!.id), body.message].slice(
        -MAX_BRIDGE_MESSAGES,
      )
      await writeBridgeMessages(filePath, next)
      return Response.json({ ok: true, count: next.length })
    }
    return Response.json({ ok: false, error: 'Unsupported bridge action.' }, { status: 400 })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Bridge write failed.' },
      { status: 500 },
    )
  }
}
