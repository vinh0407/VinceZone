import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1|\[::1\]|fc00:|fe80:)/i

function htmlToReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 140)
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return { title, text: stripped.slice(0, 6_000) }
}

/**
 * SSRF-protected documentation/URL context fetcher powering `@url:https://...` mentions in AI chat.
 */
export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local desktop runtime required.' }, { status: 403 })
  }

  let body: { url?: string }
  try {
    body = (await request.json()) as { url?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const rawUrl = String(body.url || '').trim()
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return Response.json({ error: 'Invalid URL.' }, { status: 400 })
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return Response.json({ error: 'Only http/https URLs are supported.' }, { status: 400 })
  }
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    return Response.json({ error: 'Private/loopback URLs are blocked for security.' }, { status: 403 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'VinceZone-Studio/2.2 (+local-ide)',
        Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5',
      },
    })
    if (!res.ok) {
      return Response.json({ ok: false, error: `Upstream returned HTTP ${res.status}` }, { status: 502 })
    }
    const contentType = res.headers.get('content-type') || ''
    const raw = (await res.text()).slice(0, 180_000)
    if (contentType.includes('html')) {
      const { title, text } = htmlToReadableText(raw)
      return Response.json({ ok: true, url: parsed.toString(), title, text })
    }
    return Response.json({
      ok: true,
      url: parsed.toString(),
      title: parsed.hostname,
      text: raw.slice(0, 6_000),
    })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch URL.' },
      { status: 502 },
    )
  } finally {
    clearTimeout(timer)
  }
}
