/**
 * Resilient provider fetch with per-request timeout and automatic healthy-combo
 * fallback for local OmniRoute gateways so a slow/stalled combo never hangs an agent.
 */

const OMNIROUTE_FALLBACK_COMBOS = ['super-coder', 'always-on', 'free-forever', 'ultimate-free-stack']

export function isLocalOmniRouteEndpoint(endpoint: URL): boolean {
  const isLoopback =
    endpoint.hostname === 'localhost' ||
    endpoint.hostname === '127.0.0.1' ||
    endpoint.hostname === '::1'
  return isLoopback && (endpoint.port === '20128' || endpoint.pathname.includes('/v1/'))
}

function buildTimedSignal(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort(parentSignal?.reason)
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason)
    } else {
      parentSignal.addEventListener('abort', onParentAbort, { once: true })
    }
  }
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
  const cleanup = () => {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }
  return { signal: controller.signal, cleanup }
}

export async function fetchProviderWithFallback(options: {
  endpoint: URL
  headers: Record<string, string>
  model: string
  payload: Record<string, unknown>
  parentSignal?: AbortSignal
  timeoutMs?: number
}): Promise<{ response: Response; usedModel: string; fellBack: boolean }> {
  const { endpoint, headers, model, payload, parentSignal, timeoutMs = 24_000 } = options
  const candidates = isLocalOmniRouteEndpoint(endpoint)
    ? [model, ...OMNIROUTE_FALLBACK_COMBOS.filter((m) => m !== model)]
    : [model]

  let lastResponse: Response | null = null
  let lastError: Error | null = null

  for (let i = 0; i < candidates.length; i += 1) {
    if (parentSignal?.aborted) {
      throw new DOMException('Aborted by user', 'AbortError')
    }
    const candidateModel = candidates[i]
    const perAttemptTimeout = i === 0 ? Math.min(timeoutMs, 18_000) : timeoutMs
    const { signal, cleanup } = buildTimedSignal(parentSignal, perAttemptTimeout)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, model: candidateModel }),
        cache: 'no-store',
        redirect: 'error',
        signal,
      })
      cleanup()

      if (response.ok) {
        return { response, usedModel: candidateModel, fellBack: i > 0 }
      }
      lastResponse = response
      // Only retry next fallback combo on server/rate-limit/gateway/model errors
      if (response.status < 500 && response.status !== 429 && response.status !== 404 && response.status !== 400) {
        return { response, usedModel: candidateModel, fellBack: i > 0 }
      }
    } catch (err) {
      cleanup()
      if (parentSignal?.aborted) throw err
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  if (lastResponse) {
    return { response: lastResponse, usedModel: candidates[candidates.length - 1], fellBack: candidates.length > 1 }
  }
  throw lastError ?? new Error('Provider request failed across all fallback models.')
}
