import { isLoopbackRequest } from '@/lib/local-guard'
import { callMcpServerTool, listMcpServerTools } from '@/lib/mcp-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'MCP host API is restricted to localhost.' }, { status: 403 })
  }

  let body: {
    action?: 'list-tools' | 'call-tool'
    transport?: 'stdio' | 'http'
    endpoint?: string
    toolName?: string
    arguments?: Record<string, unknown>
    cwd?: string
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const transport = body.transport === 'http' ? 'http' : 'stdio'
  const endpoint = (body.endpoint || '').trim()
  const cwd = (body.cwd || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()).trim()

  if (!endpoint) {
    return Response.json({ ok: false, error: 'MCP endpoint/command is required.' }, { status: 400 })
  }

  const started = Date.now()
  try {
    if (body.action === 'list-tools') {
      const tools = await listMcpServerTools(transport, endpoint, cwd)
      return Response.json({
        ok: true,
        durationMs: Date.now() - started,
        toolCount: tools.length,
        tools: tools.slice(0, 120),
      })
    }

    if (body.action === 'call-tool') {
      const toolName = (body.toolName || '').trim()
      if (!toolName) {
        return Response.json({ ok: false, error: 'toolName is required.' }, { status: 400 })
      }
      const result = await callMcpServerTool(
        transport,
        endpoint,
        toolName,
        body.arguments ?? {},
        cwd,
      )
      return Response.json({
        ok: true,
        durationMs: Date.now() - started,
        result,
      })
    }

    return Response.json({ ok: false, error: 'Unsupported MCP action.' }, { status: 400 })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'MCP execution failed.',
      },
      { status: 500 },
    )
  }
}
