import { fetchProviderWithFallback } from './provider-fallback'

export type StreamedToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type StreamCompletionResult = {
  ok: boolean
  status: number
  errorText?: string
  content: string
  reasoning: string
  toolCalls: StreamedToolCall[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  usedModel: string
  fellBack: boolean
}

/**
 * Calls an OpenAI-compatible chat completion endpoint with `stream: true` and tool-calling enabled.
 * Streams assistant tokens to `onToken` in real time while assembling incremental `delta.tool_calls`
 * chunks seamlessly. Also handles non-SSE JSON responses transparently if an upstream ignores `stream: true`.
 */
export async function streamCompletionWithTools(options: {
  endpoint: URL
  headers: Record<string, string>
  model: string
  payload: Record<string, unknown>
  parentSignal?: AbortSignal
  timeoutMs?: number
  onToken?: (chunk: string) => void
}): Promise<StreamCompletionResult> {
  const attempt = await fetchProviderWithFallback({
    endpoint: options.endpoint,
    headers: options.headers,
    model: options.model,
    payload: {
      ...options.payload,
      stream: true,
    },
    parentSignal: options.parentSignal,
    timeoutMs: options.timeoutMs ?? 28_000,
  })

  const res = attempt.response
  if (!res.ok) {
    const errorText = (await res.text().catch(() => '')).slice(0, 600)
    return {
      ok: false,
      status: res.status,
      errorText,
      content: '',
      reasoning: '',
      toolCalls: [],
      usedModel: attempt.usedModel,
      fellBack: attempt.fellBack,
    }
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase()

  // Fallback: upstream returned plain JSON instead of SSE
  if (!res.body || contentType.includes('application/json')) {
    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{
        message?: {
          content?: string | null
          reasoning_content?: string | null
          reasoning?: string | null
          tool_calls?: StreamedToolCall[]
        }
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const msg = data.choices?.[0]?.message
    const content = typeof msg?.content === 'string' ? msg.content : ''
    const reasoning =
      typeof msg?.reasoning_content === 'string'
        ? msg.reasoning_content
        : typeof msg?.reasoning === 'string'
          ? msg.reasoning
          : ''
    const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
    if (content) options.onToken?.(content)
    return {
      ok: true,
      status: res.status,
      content,
      reasoning,
      toolCalls,
      usage: data.usage,
      usedModel: attempt.usedModel,
      fellBack: attempt.fellBack,
    }
  }

  // Real-time SSE parser supporting both `delta.content` and incremental `delta.tool_calls`
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  let usage: StreamCompletionResult['usage']
  const toolCallsByIndex = new Map<number, StreamedToolCall>()

  const processLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const raw = trimmed.slice(5).trim()
    if (!raw || raw === '[DONE]') return

    let parsed: {
      choices?: Array<{
        delta?: {
          content?: string | null
          reasoning_content?: string | null
          reasoning?: string | null
          tool_calls?: Array<{
            index?: number
            id?: string
            type?: string
            function?: { name?: string; arguments?: string }
          }>
        }
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    if (parsed.usage) {
      usage = parsed.usage
    }

    const delta = parsed.choices?.[0]?.delta
    if (!delta) return

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      content += delta.content
      options.onToken?.(delta.content)
    }
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
      reasoning += delta.reasoning_content
    } else if (typeof delta.reasoning === 'string' && delta.reasoning.length > 0) {
      reasoning += delta.reasoning
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = typeof tc.index === 'number' ? tc.index : 0
        const existing = toolCallsByIndex.get(idx) ?? {
          id: tc.id || `call_${idx}_${Date.now()}`,
          type: 'function' as const,
          function: { name: '', arguments: '' },
        }
        if (tc.id) existing.id = tc.id
        if (tc.function?.name) existing.function.name += tc.function.name
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
        toolCallsByIndex.set(idx, existing)
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        processLine(line)
      }
    }
    if (buffer.trim()) {
      processLine(buffer)
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => call)
    .filter((call) => Boolean(call.function.name))

  return {
    ok: true,
    status: res.status,
    content,
    reasoning,
    toolCalls,
    usage,
    usedModel: attempt.usedModel,
    fellBack: attempt.fellBack,
  }
}
