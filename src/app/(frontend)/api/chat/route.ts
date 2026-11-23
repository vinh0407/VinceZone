import {
  buildDynamicAgentTools,
  executeAgentTool,
  type McpServerRuntimeConfig,
} from '@/lib/agent-tools'
import { isLoopbackRequest } from '@/lib/local-guard'
import { fetchProviderWithFallback } from '@/lib/provider-fallback'
import { resolveSafeProviderEndpoint } from '@/lib/provider-url'
import { checkRateLimit, getClientKey } from '@/lib/rate-limit'
import { streamCompletionWithTools } from '@/lib/stream-tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatContentPart[] | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

type ChatRequest = {
  apiKey?: string
  baseUrl?: string
  model?: string
  messages?: ChatMessage[]
  enableTools?: boolean
  workspaceRoot?: string
  mcpServers?: McpServerRuntimeConfig[]
}

function sseFrame(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
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

  if (Number(request.headers.get('content-length') ?? 0) > 12_000_000) {
    return Response.json({ error: 'Request is too large (max 12MB including images).' }, { status: 413 })
  }

  let body: ChatRequest
  try {
    body = (await request.json()) as ChatRequest
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { apiKey, baseUrl, model, messages, enableTools, workspaceRoot, mcpServers } = body
  const isLocalReq = isLoopbackRequest(request)
  if (!baseUrl || !model || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: 'Provider URL, model, and messages are required.' },
      { status: 400 },
    )
  }

  let endpoint: URL
  try {
    endpoint = await resolveSafeProviderEndpoint(baseUrl, undefined, {
      allowLocalLoopback: isLocalReq,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid provider URL.' },
      { status: 400 },
    )
  }

  const isLoopbackTarget =
    endpoint.hostname === 'localhost' ||
    endpoint.hostname === '127.0.0.1' ||
    endpoint.hostname === '::1'
  if (!apiKey && !isLoopbackTarget) {
    return Response.json(
      { error: 'API key is required for remote HTTPS providers.' },
      { status: 400 },
    )
  }

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }

  const canUseLocalTools = Boolean(enableTools && isLocalReq)
  const resolvedRoot =
    workspaceRoot?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()

  // Mode A: Multi-turn Agentic Tool-Calling Loop with real-time token streaming + live MCP tools
  if (canUseLocalTools) {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const conversation: ChatMessage[] = messages.slice(-26)
          let totalPromptTokens = 0
          let totalCompletionTokens = 0

          const { tools: dynamicTools, mcpBindings } = await buildDynamicAgentTools(
            mcpServers,
            resolvedRoot,
          )

          let activeModel = model
          let emittedAnyText = false

          for (let round = 0; round < 8; round++) {
            let roundStartedStreaming = false

            const streamed = await streamCompletionWithTools({
              endpoint,
              headers: authHeaders,
              model: activeModel,
              payload: {
                messages: conversation,
                tools: dynamicTools,
                tool_choice: 'auto',
                temperature: 0.2,
              },
              parentSignal: request.signal,
              timeoutMs: 28_000,
              onToken: (chunk) => {
                if (!roundStartedStreaming) {
                  roundStartedStreaming = true
                  if (emittedAnyText) {
                    controller.enqueue(
                      sseFrame({ choices: [{ delta: { content: '\n\n' } }] }),
                    )
                  }
                  emittedAnyText = true
                }
                controller.enqueue(sseFrame({ choices: [{ delta: { content: chunk } }] }))
              },
            })

            if (streamed.fellBack && streamed.usedModel !== activeModel) {
              activeModel = streamed.usedModel
              controller.enqueue(
                sseFrame({
                  vincezone_event: {
                    type: 'tool.call',
                    name: 'model_fallback',
                    args: { path: `Switched to fast combo ${activeModel}` },
                  },
                }),
              )
            }

            // If provider/model doesn't support `tools`, cleanly fall back to standard SSE streaming
            if (!streamed.ok && round === 0) {
              const fbAttempt = await fetchProviderWithFallback({
                endpoint,
                headers: authHeaders,
                model: activeModel,
                payload: {
                  messages: messages.slice(-26),
                  stream: true,
                  temperature: 0.2,
                },
                parentSignal: request.signal,
                timeoutMs: 24_000,
              })
              const fallback = fbAttempt.response
              if (!fallback.ok || !fallback.body) {
                const detail = (await fallback.text()).slice(0, 600)
                controller.enqueue(
                  sseFrame({
                    choices: [{ delta: { content: `Provider returned ${fallback.status}: ${detail}` } }],
                  }),
                )
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
                controller.close()
                return
              }
              const reader = fallback.body.getReader()
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                controller.enqueue(value)
              }
              controller.close()
              return
            }

            if (!streamed.ok) {
              throw new Error(`Provider returned ${streamed.status}: ${streamed.errorText || ''}`)
            }

            if (streamed.usage) {
              totalPromptTokens += streamed.usage.prompt_tokens ?? 0
              totalCompletionTokens += streamed.usage.completion_tokens ?? 0
            }

            const toolCalls = streamed.toolCalls
            const contentText =
              streamed.content.trim() ||
              (!toolCalls.length && streamed.reasoning.trim() ? streamed.reasoning : '')

            // If model only produced reasoning_content without streaming delta.content, emit it now
            if (!roundStartedStreaming && contentText) {
              const spacer = emittedAnyText ? '\n\n' : ''
              emittedAnyText = true
              controller.enqueue(
                sseFrame({ choices: [{ delta: { content: `${spacer}${contentText}` } }] }),
              )
            }

            if (!toolCalls.length) {
              break
            }

            conversation.push({
              role: 'assistant',
              content: contentText || null,
              tool_calls: toolCalls,
            })

            for (const call of toolCalls.slice(0, 5)) {
              const toolName = call.function?.name || ''
              let parsedArgs: Record<string, unknown> = {}
              try {
                parsedArgs = JSON.parse(call.function?.arguments || '{}') as Record<string, unknown>
              } catch {
                parsedArgs = {}
              }

              controller.enqueue(
                sseFrame({
                  vincezone_event: {
                    type: 'tool.call',
                    name: toolName,
                    args: parsedArgs,
                  },
                }),
              )

              const outcome = await executeAgentTool(toolName, parsedArgs, resolvedRoot, {
                mcpBindings,
              })

              controller.enqueue(
                sseFrame({
                  vincezone_event: {
                    type: 'tool.result',
                    name: toolName,
                    ok: outcome.ok,
                    preview: outcome.output.slice(0, 260),
                  },
                }),
              )

              if (outcome.fileUpdated) {
                controller.enqueue(
                  sseFrame({
                    vincezone_event: {
                      type: 'file.updated',
                      path: outcome.fileUpdated.path,
                      summary: outcome.fileUpdated.summary,
                      previousContent: outcome.fileUpdated.previousContent,
                      content: outcome.fileUpdated.nextContent,
                    },
                  }),
                )
              }

              if (outcome.agentHandoff) {
                controller.enqueue(
                  sseFrame({
                    vincezone_event: {
                      type: 'agent.handoff',
                      toRole: outcome.agentHandoff.toRole,
                      message: outcome.agentHandoff.message,
                      files: outcome.agentHandoff.files,
                    },
                  }),
                )
              }

              if (outcome.commandApproval) {
                controller.enqueue(
                  sseFrame({
                    vincezone_event: {
                      type: 'command.approval_required',
                      approval: outcome.commandApproval,
                    },
                  }),
                )
              }

              conversation.push({
                role: 'tool',
                tool_call_id: call.id,
                content: outcome.output.slice(0, 10_000),
              })
            }
          }

          if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
            controller.enqueue(
              sseFrame({
                vincezone_event: {
                  type: 'usage',
                  promptTokens: totalPromptTokens,
                  completionTokens: totalCompletionTokens,
                  totalTokens: totalPromptTokens + totalCompletionTokens,
                },
              }),
            )
          }

          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          controller.enqueue(
            sseFrame({
              choices: [
                {
                  delta: {
                    content: `\n\nError: ${err instanceof Error ? err.message : 'Agent loop failed.'}`,
                  },
                },
              ],
            }),
          )
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/event-stream; charset=utf-8',
      },
    })
  }

  // Mode B: Direct Streaming Chat (no tools)
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        model,
        messages: messages.slice(-30),
        stream: true,
        stream_options: { include_usage: true },
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
