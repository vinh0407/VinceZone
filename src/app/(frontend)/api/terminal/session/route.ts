import { isLoopbackRequest } from '@/lib/local-guard'
import {
  createTerminalSession,
  getTerminalSession,
  interruptTerminalSession,
  killTerminalSession,
  listTerminalSessions,
  resizeTerminalSession,
  type TerminalSessionListener,
  writeToTerminalSession,
} from '@/lib/terminal-sessions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Terminal sessions are restricted to localhost.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')?.trim()
  if (!id) {
    return Response.json(
      { ok: true, sessions: listTerminalSessions() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const session = getTerminalSession(id)
  if (!session) {
    return Response.json({ error: 'Terminal session not found.' }, { status: 404 })
  }

  const encoder = new TextEncoder()
  let cleanupListener: TerminalSessionListener | null = null
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        } catch {
          // stream closed
        }
      }

      if (session.history) {
        send({ type: 'output', data: session.history })
      }
      if (!session.alive) {
        send({ type: 'exit', exitCode: session.exitCode })
        try {
          controller.close()
        } catch {
          // already closed
        }
        return
      }

      const listener: TerminalSessionListener = (event) => {
        send(event)
      }
      cleanupListener = listener
      session.listeners.add(listener)

      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          if (keepAliveTimer) clearInterval(keepAliveTimer)
        }
      }, 20_000)

      request.signal.addEventListener(
        'abort',
        () => {
          if (cleanupListener) session.listeners.delete(cleanupListener)
          if (keepAliveTimer) clearInterval(keepAliveTimer)
        },
        { once: true },
      )
    },
    cancel() {
      if (cleanupListener) session.listeners.delete(cleanupListener)
      if (keepAliveTimer) clearInterval(keepAliveTimer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  })
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Terminal sessions are restricted to localhost.' }, { status: 403 })
  }

  let body: {
    action?: string
    id?: string
    cwd?: string
    title?: string
    data?: string
    cols?: number
    rows?: number
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (body.action === 'create') {
    const session = createTerminalSession({ cwd: body.cwd, title: body.title })
    return Response.json({
      ok: true,
      session: {
        id: session.id,
        title: session.title,
        cwd: session.cwd,
        shell: session.shell,
        alive: session.alive,
      },
    })
  }

  if (body.action === 'write' && body.id && typeof body.data === 'string') {
    const ok = writeToTerminalSession(body.id, body.data)
    return Response.json({ ok }, { status: ok ? 200 : 404 })
  }

  if (body.action === 'interrupt' && body.id) {
    const ok = interruptTerminalSession(body.id)
    return Response.json({ ok }, { status: ok ? 200 : 404 })
  }

  if (body.action === 'resize' && body.id) {
    const ok = resizeTerminalSession(body.id, body.cols ?? 120, body.rows ?? 30)
    return Response.json({ ok })
  }

  if (body.action === 'kill' && body.id) {
    const ok = killTerminalSession(body.id)
    return Response.json({ ok })
  }

  return Response.json({ error: 'Unsupported terminal session action.' }, { status: 400 })
}
