import { resolveSafeProviderEndpoint } from '@/lib/provider-url'
import { checkRateLimit, getClientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'

type ChatRequest = {
  apiKey?: string
  baseUrl?: string
  model?: string
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export async function POST(request: Request) {
  const rate = checkRateLimit(getClientKey(request, 'chat'), {
    limit: 30,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return Response.json(
      { error: 'Too many chat requests. Please wait before retrying.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  if (Number(request.headers.get('content-length') ?? 0) > 1_000_000) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 })
  }

  let body: ChatRequest
  try {
    body = (await request.json()) as ChatRequest
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { apiKey, baseUrl, model, messages } = body
  if (!apiKey || !baseUrl || !model || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: 'Provider, model, API key, and messages are required.' },
      { status: 400 },
    )
  }

  let endpoint: URL
  try {
    endpoint = await resolveSafeProviderEndpoint(baseUrl)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid provider URL.' },
      { status: 400 },
    )
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: messages.slice(-30),
        stream: true,
        temperature: 0.2,
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: request.signal,
    })

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 800)
      return Response.json(
        { error: `Provider returned ${upstream.status}.`, detail },
        { status: upstream.status >= 500 ? 502 : 400 },
      )
    }

    return new Response(upstream.body, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Provider request failed.' },
      { status: 502 },
    )
  }
}
