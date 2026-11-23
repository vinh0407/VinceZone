import {
  attachNodeDebugSession,
  controlDebugSession,
  type DebugBreakpoint,
  evaluateDebugExpression,
  getDebugSnapshot,
  startDebugSession,
  stopDebugSession,
  updateLiveBreakpoints,
} from '@/lib/debugger-runtime'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Debugger API is restricted to localhost.' }, { status: 403 })
  }
  return Response.json(
    { ok: true, debug: getDebugSnapshot() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Debugger API is restricted to localhost.' }, { status: 403 })
  }

  let body: {
    action?: string
    cwd?: string
    targetFile?: string
    breakpoints?: DebugBreakpoint[]
    expression?: string
    port?: number
    wsUrl?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  try {
    if (body.action === 'start') {
      if (!body.targetFile?.trim()) {
        return Response.json({ ok: false, error: 'Target script file is required.' }, { status: 400 })
      }
      const snapshot = await startDebugSession({
        cwd: body.cwd || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd(),
        targetFile: body.targetFile.trim(),
        breakpoints: Array.isArray(body.breakpoints) ? body.breakpoints : [],
      })
      return Response.json({ ok: true, debug: snapshot })
    }

    if (
      body.action === 'resume' ||
      body.action === 'stepOver' ||
      body.action === 'stepInto' ||
      body.action === 'stepOut'
    ) {
      const snapshot = await controlDebugSession(body.action)
      return Response.json({ ok: true, debug: snapshot })
    }

    if (body.action === 'setBreakpoints') {
      await updateLiveBreakpoints(Array.isArray(body.breakpoints) ? body.breakpoints : [])
      return Response.json({ ok: true, debug: getDebugSnapshot() })
    }

    if (body.action === 'evaluate' && typeof body.expression === 'string') {
      const outcome = await evaluateDebugExpression(body.expression.trim())
      return Response.json({ ok: outcome.ok, result: outcome.result, debug: getDebugSnapshot() })
    }

    if (body.action === 'attach') {
      const snapshot = await attachNodeDebugSession({
        cwd: body.cwd || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd(),
        port: body.port,
        wsUrl: body.wsUrl,
      })
      return Response.json({ ok: true, debug: snapshot })
    }

    if (body.action === 'stop') {
      stopDebugSession()
      return Response.json({ ok: true, debug: getDebugSnapshot() })
    }

    return Response.json({ ok: false, error: 'Unsupported debugger action.' }, { status: 400 })
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Debugger operation failed.' },
      { status: 500 },
    )
  }
}
