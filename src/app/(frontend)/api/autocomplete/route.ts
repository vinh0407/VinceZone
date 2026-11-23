import { isLoopbackRequest } from '@/lib/local-guard'
import { fetchProviderWithFallback } from '@/lib/provider-fallback'
import { resolveSafeProviderEndpoint } from '@/lib/provider-url'
import { checkRateLimit, getClientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sanitizeCompletion(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n')
  const fenced = text.match(/```[a-z0-9_-]*\n([\s\S]*?)```/i)
  if (fenced?.[1]) {
    text = fenced[1]
  }
  // Remove leading/trailing backticks or explanatory lines
  text = text.replace(/^`+|`+$/g, '')
  if (text.length > 420) {
    text = text.slice(0, 420)
  }
  return text
}

export async function POST(request: Request) {
  const rate = checkRateLimit(getClientKey(request, 'autocomplete'), {
    limit: 60,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return Response.json({ completion: '' }, { status: 200 })
  }

  let body: {
    baseUrl?: string
    apiKey?: string
    model?: string
    path?: string
    language?: string
    prefix?: string
    suffix?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ completion: '' }, { status: 400 })
  }

  const isLocalReq = isLoopbackRequest(request)
  const baseUrl = body.baseUrl?.trim() || 'http://localhost:20128/v1'
  const model = body.model?.trim() || 'always-on'
  const prefix = (body.prefix || '').slice(-2200)
  const suffix = (body.suffix || '').slice(0, 600)

  if (!prefix.trim()) {
    return Response.json({ completion: '' })
  }

  let endpoint: URL
  try {
    endpoint = await resolveSafeProviderEndpoint(baseUrl, undefined, {
      allowLocalLoopback: isLocalReq,
    })
  } catch {
    return Response.json({ completion: '' })
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(body.apiKey ? { Authorization: `Bearer ${body.apiKey}` } : {}),
  }

  try {
    const { response } = await fetchProviderWithFallback({
      endpoint,
      headers,
      model,
      timeoutMs: 6_500,
      parentSignal: request.signal,
      payload: {
        stream: false,
        temperature: 0.1,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content:
              'You are a fast inline code completion engine (like Cursor Tab). Output ONLY the exact code continuation that fits between <PREFIX> and <SUFFIX>. Never repeat existing prefix text, never wrap in markdown fences, never add explanations.',
          },
          {
            role: 'user',
            content: `File: ${body.path || 'untitled'} (${body.language || 'typescript'})\n<PREFIX>\n${prefix}\n</PREFIX>\n<SUFFIX>\n${suffix}\n</SUFFIX>`,
          },
        ],
      },
    })

    if (!response.ok) {
      return Response.json({ completion: '' })
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const raw = data.choices?.[0]?.message?.content || ''
    return Response.json(
      { completion: sanitizeCompletion(raw) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json({ completion: '' })
  }
}
