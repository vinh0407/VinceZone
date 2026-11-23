import {
  buildDynamicAgentTools,
  executeAgentTool,
  type McpServerRuntimeConfig,
  type PendingCommandApproval,
} from '@/lib/agent-tools'
import { hashText } from '@/lib/file-tree'
import { isLoopbackRequest } from '@/lib/local-guard'
import {
  extractProposedPatches,
  parsePlan,
  partitionNextBatch,
  sanitizeTaskGraph,
  type OrchestratorAgent,
  type PlannedTask,
} from '@/lib/orchestrator'
import { fetchProviderWithFallback } from '@/lib/provider-fallback'
import { resolveSafeProviderEndpoint } from '@/lib/provider-url'
import { checkRateLimit, getClientKey } from '@/lib/rate-limit'
import { streamCompletionWithTools } from '@/lib/stream-tools'
import {
  buildTeamCollaborationPrompt,
  buildVinceZoneCoordinatorRules,
  inferRoleId,
  ROLE_TERRITORIES,
  validateTerritoryAccess,
} from '@/lib/vincezone-protocol'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Provider = { apiKey: string; baseUrl: string; model: string }
type Limits = {
  maxDepth: number
  maxActiveAgents: number
  maxConcurrentTasks: number
  maxIterations: number
  requireApproval: boolean
  assignmentMode: 'automatic' | 'manual'
}
type RequestBody = {
  provider?: Provider
  coordinatorId?: string
  captainId?: string
  viceCaptainId?: string | null
  agents?: OrchestratorAgent[]
  instruction?: string
  workspaceRoot?: string
  projectMemory?: string
  project?: { name?: string; files?: Array<{ path: string; content: string }> }
  limits?: Limits
  topology?: {
    mode?: 'peer' | 'dual-coordinator' | 'coordinator'
    orderedAgentIds?: string[]
  }
  approvedTasks?: PlannedTask[]
  planningContext?: string
  planSummary?: string
  mcpServers?: McpServerRuntimeConfig[]
}

type ToolChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

function extractAssistantText(msg?: {
  content?: string | Array<{ text?: string }> | null
  reasoning_content?: string | null
  reasoning?: string | null
}): string {
  if (!msg) return ''
  if (typeof msg.content === 'string' && msg.content.trim()) return msg.content
  if (Array.isArray(msg.content)) {
    const joined = msg.content.map((part) => part.text ?? '').join('').trim()
    if (joined) return joined
  }
  if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) {
    return msg.reasoning_content
  }
  if (typeof msg.reasoning === 'string' && msg.reasoning.trim()) {
    return msg.reasoning
  }
  return ''
}

async function complete(
  endpoint: URL,
  provider: Provider,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  signal: AbortSignal,
  model = provider.model,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
  }
  const tryModels = [model, 'super-coder', 'always-on', 'free-forever'].filter(
    (m, i, arr) => Boolean(m) && arr.indexOf(m) === i,
  )

  for (const candidateModel of tryModels) {
    const { response } = await fetchProviderWithFallback({
      endpoint,
      headers,
      model: candidateModel,
      payload: { messages, stream: false, temperature: 0.2 },
      parentSignal: signal,
      timeoutMs: 24_000,
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      if (candidateModel === tryModels[tryModels.length - 1]) {
        throw new Error(`Provider returned ${response.status}: ${detail}`)
      }
      continue
    }
    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string }> | null
          reasoning_content?: string | null
          reasoning?: string | null
        }
      }>
    }
    const text = extractAssistantText(payload.choices?.[0]?.message)
    if (text) return text
  }

  throw new Error('Provider returned an empty response.')
}

async function completeWithTools(options: {
  endpoint: URL
  provider: Provider
  model: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  signal: AbortSignal
  workspaceRoot: string
  allowTools: boolean
  mcpServers?: McpServerRuntimeConfig[]
  onToken?: (chunk: string) => void
  onFileUpdated?: (file: { path: string; summary: string; nextContent: string; previousContent: string | null }) => void
  onAgentHandoff?: (handoff: { toRole: string; message: string; files?: string[] }) => void
  onCommandApproval?: (approval: PendingCommandApproval) => void
}): Promise<{ text: string; savedFiles: string[] }> {
  const {
    endpoint,
    provider,
    model,
    messages,
    signal,
    workspaceRoot,
    allowTools,
    mcpServers,
    onToken,
    onFileUpdated,
    onAgentHandoff,
    onCommandApproval,
  } = options

  if (!allowTools) {
    const text = await complete(endpoint, provider, messages, signal, model)
    return { text, savedFiles: [] }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
  }
  const { tools: dynamicTools, mcpBindings } = await buildDynamicAgentTools(
    mcpServers,
    workspaceRoot,
  )
  const conversation: ToolChatMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  const savedFiles: string[] = []
  const finalChunks: string[] = []
  let activeModel = model
  let emittedAnyText = false

  for (let round = 0; round < 6; round += 1) {
    let roundStreamed = false
    const streamed = await streamCompletionWithTools({
      endpoint,
      headers,
      model: activeModel,
      payload: {
        messages: conversation,
        tools: dynamicTools,
        tool_choice: 'auto',
        temperature: 0.2,
      },
      parentSignal: signal,
      timeoutMs: 28_000,
      onToken: (chunk) => {
        if (!roundStreamed) {
          roundStreamed = true
          if (emittedAnyText) onToken?.('\n\n')
          emittedAnyText = true
        }
        onToken?.(chunk)
      },
    })
    activeModel = streamed.usedModel

    if (!streamed.ok) {
      if (round === 0) {
        const fallbackText = await complete(endpoint, provider, messages, signal, activeModel)
        return { text: fallbackText, savedFiles }
      }
      throw new Error(`Provider returned ${streamed.status}: ${streamed.errorText || ''}`)
    }

    const toolCalls = streamed.toolCalls
    const contentText =
      streamed.content.trim() ||
      (!toolCalls.length && streamed.reasoning.trim() ? streamed.reasoning : '')

    if (contentText.trim()) {
      finalChunks.push(contentText.trim())
    }
    if (!toolCalls.length) break

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

      const outcome = await executeAgentTool(toolName, parsedArgs, workspaceRoot, {
        mcpBindings,
      })
      if (outcome.fileUpdated) {
        savedFiles.push(outcome.fileUpdated.path)
        onFileUpdated?.(outcome.fileUpdated)
      }
      if (outcome.agentHandoff) {
        onAgentHandoff?.(outcome.agentHandoff)
      }
      if (outcome.commandApproval) {
        onCommandApproval?.(outcome.commandApproval)
      }

      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        content: outcome.output.slice(0, 9_000),
      })
    }
  }

  const combined =
    finalChunks.join('\n\n').trim() ||
    (savedFiles.length > 0 ? `Updated and saved: ${[...new Set(savedFiles)].join(', ')}` : '')

  return { text: combined, savedFiles: [...new Set(savedFiles)] }
}

function selectDiscussionSpecialists(
  instruction: string,
  workers: OrchestratorAgent[],
): OrchestratorAgent[] {
  if (workers.length === 0) return []
  const lower = instruction.toLowerCase()
  const scored = workers.map((worker) => {
    const rid = inferRoleId(`${worker.id} ${worker.role}`)
    let score = 1
    if (rid === 'arch') score += 5
    if (rid === 'be' && /api|server|route|db|auth|save|backend|error|bug|fix|sửa|lỗi|android|run/i.test(lower)) score += 6
    if (rid === 'fe' && /ui|ux|button|chat|panel|css|react|modal|page|giao diện|nút|hiển thị|fix|sửa/i.test(lower)) score += 6
    if (rid === 'qa' && /test|bug|fix|verify|lỗi|kiểm tra/i.test(lower)) score += 4
    if (rid === 'mobile' && /android|mobile|phone|apk|emulator|điện thoại/i.test(lower)) score += 8
    return { worker, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.min(2, workers.length)).map((item) => item.worker)
}

function clamp(value: number | undefined, min: number, max: number, fallback: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Number(value) : fallback))
}

export async function POST(request: Request) {
  const rate = checkRateLimit(getClientKey(request, 'orchestrate'), {
    limit: 12,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return Response.json(
      { error: 'Too many orchestration runs. Please wait before retrying.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  if (Number(request.headers.get('content-length') ?? 0) > 4_000_000) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { provider, coordinatorId, captainId, viceCaptainId, instruction, project, projectMemory, workspaceRoot } = body
  const agents = (body.agents ?? []).slice(0, 24)
  const topologyMode =
    body.topology?.mode === 'peer' || body.topology?.mode === 'dual-coordinator'
      ? body.topology.mode
      : 'coordinator'
  const orderedAgents = [
    ...(body.topology?.orderedAgentIds ?? []).flatMap((id) => {
      const agent = agents.find((item) => item.id === id)
      return agent ? [agent] : []
    }),
    ...agents.filter((agent) => !body.topology?.orderedAgentIds?.includes(agent.id)),
  ]
  const topologyAgents = orderedAgents
  const coordinatorCandidates =
    topologyMode === 'peer'
      ? topologyAgents
      : topologyMode === 'dual-coordinator'
        ? topologyAgents.slice(0, 2)
        : topologyAgents.slice(0, 1)
  const explicitCommanderId = coordinatorId || captainId
  const coordinator =
    topologyAgents.find((agent) => agent.id === explicitCommanderId) ??
    coordinatorCandidates[0]
  const viceCaptain =
    viceCaptainId && viceCaptainId !== coordinator?.id
      ? topologyAgents.find((agent) => agent.id === viceCaptainId) ?? null
      : null

  const isLocalReq = isLoopbackRequest(request)
  if (!provider?.baseUrl || !provider.model || !coordinator || !instruction?.trim()) {
    return Response.json(
      { error: 'Provider, coordinator, agents, and instruction are required.' },
      { status: 400 },
    )
  }

  let endpoint: URL
  try {
    endpoint = await resolveSafeProviderEndpoint(provider.baseUrl, undefined, {
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
  if (!provider.apiKey && !isLoopbackTarget) {
    return Response.json(
      { error: 'API key is required for remote HTTPS providers.' },
      { status: 400 },
    )
  }

  const resolvedRoot =
    workspaceRoot?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()

  const limits = {
    maxDepth: clamp(body.limits?.maxDepth, 0, 4, 2),
    maxActiveAgents: clamp(body.limits?.maxActiveAgents, 1, 24, 6),
    maxConcurrentTasks: clamp(body.limits?.maxConcurrentTasks, 1, 24, 4),
    maxIterations: clamp(body.limits?.maxIterations, 1, 8, 2),
    requireApproval: Boolean(body.limits?.requireApproval),
    assignmentMode: body.limits?.assignmentMode === 'manual' ? 'manual' : 'automatic',
  }
  const planners = viceCaptain
    ? [coordinator, viceCaptain]
    : topologyMode === 'peer'
      ? topologyAgents
      : [coordinator]
  const workers =
    limits.maxDepth === 0
      ? []
      : topologyAgents.filter((agent) => agent.id !== coordinator.id)

  const files = (project?.files ?? []).slice(0, 80)
  const fileMap = new Map(files.map((file) => [file.path, file.content]))
  const paths = new Set(files.map((file) => file.path))
  const projectContext = files
    .map((file) => `--- ${file.path}\n${file.content.slice(0, 5000)}`)
    .join('\n')
    .slice(0, 50_000)
  const runId = crypto.randomUUID().slice(0, 8)
  const isResumingApproved = Array.isArray(body.approvedTasks) && body.approvedTasks.length > 0

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (type: string, data: Record<string, unknown> = {}) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type, timestamp: new Date().toISOString(), ...data })}\n\n`,
          ),
        )
      }
      const runLimited = async <Item, Result>(
        items: Item[],
        limit: number,
        run: (item: Item) => Promise<Result>,
      ) => {
        const results: Result[] = []
        for (let offset = 0; offset < items.length; offset += limit) {
          results.push(...(await Promise.all(items.slice(offset, offset + limit).map(run))))
        }
        return results
      }

      try {
        emit('session.started', { agentId: coordinator.id, resumed: isResumingApproved })

        let planningContext = body.planningContext ?? ''
        let planSummary = body.planSummary ?? ''
        let tasks: PlannedTask[] = []
        const allSavedFiles = new Set<string>()

        if (isResumingApproved) {
          const validApproved = (body.approvedTasks ?? []).filter((task) =>
            workers.some((worker) => worker.id === task.assigneeId),
          )
          tasks = sanitizeTaskGraph(
            validApproved,
            runId,
            limits.maxActiveAgents * limits.maxIterations,
            true,
          )
          for (const task of tasks) {
            emit('task.created', {
              task: { ...task, status: 'planned' },
            })
          }
        } else {
          emit('coordinator.response.started', { agentId: coordinator.id })

          // Autonomous Team Analysis & Discussion:
          // - If a Vice Captain (Đội phó) is assigned, Captain consults Vice Captain + relevant specialists first.
          // - If only 1 Captain (no Vice Captain), Captain directly consults the relevant team members.
          const selectedSpecialists = selectDiscussionSpecialists(instruction, workers)
          const discussionParticipants = viceCaptain
            ? [viceCaptain, ...selectedSpecialists.filter((s) => s.id !== viceCaptain.id)].slice(0, 3)
            : selectedSpecialists

          if (discussionParticipants.length > 0) {
            const planningConcurrency = Math.max(
              1,
              Math.min(limits.maxActiveAgents, limits.maxConcurrentTasks),
            )
            // Coordinator opens team discussion with selected specialists
            for (const specialist of discussionParticipants) {
              emit('message.sent', {
                senderId: coordinator.id,
                recipientId: specialist.id,
                taskId: `PLAN-${runId}-${specialist.id}`,
                message: `Team Discussion Request: Analyze "${instruction.slice(0, 220)}" from your specialist perspective, identify affected files & root cause, and propose concrete changes.`,
                relevantFiles: [...paths].slice(0, 8),
              })
            }

            const proposalsRaw = await runLimited(
              discussionParticipants,
              isLoopbackTarget ? 1 : planningConcurrency,
              async (specialist) => {
                const taskId = `PLAN-${runId}-${specialist.id}`
                emit('worker.response.started', { agentId: specialist.id, taskId })
                try {
                  const result = await complete(
                    endpoint,
                    provider,
                    [
                      {
                        role: 'system',
                        content: `You are ${specialist.name} (${specialist.role}) in a live multi-agent team discussion led by ${coordinator.name}. Be concise (4-6 bullets): identify root cause, exact files to edit, API/UI contracts, and risks for teammates.`,
                      },
                      {
                        role: 'user',
                        content: `Project: ${project?.name || 'workspace'}\nUser Request: ${instruction}\n\nRelevant files:\n${projectContext.slice(0, 20_000)}`,
                      },
                    ],
                    request.signal,
                    specialist.model || provider.model,
                  )
                  emit('worker.response.completed', {
                    agentId: specialist.id,
                    senderId: specialist.id,
                    recipientId: coordinator.id,
                    taskId,
                    result,
                  })
                  return { specialist, result }
                } catch (err) {
                  const fallbackNote = `${specialist.name} skipped discussion round (${err instanceof Error ? err.message : 'transient error'}).`
                  emit('worker.response.completed', {
                    agentId: specialist.id,
                    senderId: specialist.id,
                    recipientId: coordinator.id,
                    taskId,
                    result: fallbackNote,
                  })
                  return { specialist, result: fallbackNote }
                }
              },
            )
            const proposals = proposalsRaw.filter((p) => Boolean(p.result))

            planningContext = proposals
              .map(
                ({ specialist, result }) =>
                  `## Specialist Input from ${specialist.name} (${specialist.id})\n${result}`,
              )
              .join('\n\n')

            // Cross-share discussion insights between participating peers
            if (proposals.length >= 2) {
              for (const p of proposals) {
                for (const peer of proposals.filter((other) => other.specialist.id !== p.specialist.id)) {
                  emit('message.sent', {
                    senderId: p.specialist.id,
                    recipientId: peer.specialist.id,
                    taskId: `PLAN-${runId}`,
                    message: p.result.slice(0, 700),
                    relevantFiles: [],
                  })
                }
              }
            }
          }

          const roster = workers
            .map((agent) => {
              const roleId = inferRoleId(`${agent.id} ${agent.role}`)
              const code = roleId === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[roleId].code
              return `${agent.id}: ${agent.name} [@${code}] — ${agent.role} — ${agent.model}`
            })
            .join('\n')

          const commandStructureNote = viceCaptain
            ? `Command Structure: Team Captain (Đội trưởng) = ${coordinator.name}; Vice Captain (Đội phó) = ${viceCaptain.name} (supports planning & execution).`
            : `Command Structure: Solo Team Captain (Đội trưởng duy nhất, không cần Đội phó) = ${coordinator.name}. You directly analyze, plan, and dispatch executable prompts to every required teammate.`

          const planRaw = await complete(
            endpoint,
            provider,
            [
              {
                role: 'system',
                content: `You are ${coordinator.name}, the assigned TEAM CAPTAIN (Đội trưởng) commanding the entire AI engineering team in VinceZone Studio.
${commandStructureNote}
${buildVinceZoneCoordinatorRules('')}
Your mission as Team Captain:
1. Analyze the user's goal and full project context deeply.
2. Design a complete, step-by-step execution plan for the whole team.
3. For EACH task, write \`description\` as a COMPLETE, SELF-CONTAINED PROMPT that you (the Captain) are sending directly to that teammate on the user's behalf — specifying exact files to inspect/edit, concrete technical instructions, integration contracts, and verification steps so the team completes the project end-to-end without the user manually prompting each agent.
4. Every coding/feature/fix request MUST assign concrete tasks to the right team members so they execute real tool edits (\`patch_file\` / \`write_file\`) and save files to disk.
Return ONLY JSON: {"summary":"...","tasks":[{"id":"TASK-001","title":"...","description":"Direct executable prompt from Team Captain to this teammate...","assigneeId":"exact id","dependencies":[],"relevantFiles":["exact known path"],"expectedOutput":"...","constraints":[],"completionCriteria":[]}]}.
Available team members:
${roster || '(none)'}
Known project files: ${[...paths].join(', ')}
Limits: depth ${limits.maxDepth}, active agents ${limits.maxActiveAgents}, concurrent tasks ${limits.maxConcurrentTasks}.`,
              },
              {
                role: 'user',
                content: `Project: ${project?.name || 'workspace'}\nRequest: ${instruction}\n\nTeam discussion:\n${planningContext || '(single coordinator analysis)'}\n\nProject context:\n${projectContext.slice(0, 30_000)}`,
              },
            ],
            request.signal,
            coordinator.model || provider.model,
          )
          emit('coordinator.response.completed', { agentId: coordinator.id, message: planRaw })

          const plan = parsePlan(planRaw, workers, paths)
          planSummary = plan.summary
          tasks = sanitizeTaskGraph(
            plan.tasks,
            runId,
            limits.maxActiveAgents * limits.maxIterations,
          )

          for (const task of tasks) {
            emit('task.created', {
              task: {
                ...task,
                status:
                  limits.requireApproval || limits.assignmentMode === 'manual'
                    ? 'awaiting-approval'
                    : 'planned',
              },
            })
          }

          if ((limits.requireApproval || limits.assignmentMode === 'manual') && tasks.length) {
            emit('approval.required', {
              agentId: coordinator.id,
              message: `${tasks.length} task(s) are waiting for approval. Review and approve them to execute worker runtimes.`,
              tasks,
              planningContext,
              planSummary,
            })
            emit('session.completed', { agentId: coordinator.id })
            controller.close()
            return
          }
        }

        const results: Array<{ task: PlannedTask; result?: string; error?: string }> = []
        const pending = [...tasks]
        const completedTaskIds = new Set<string>()
        const failedTaskIds = new Set<string>()
        const claimedFiles = new Map<string, string>()

        while (pending.length) {
          const { blockedByFailure, readyBatch, cycleDetected } = partitionNextBatch(
            pending,
            completedTaskIds,
            failedTaskIds,
            Math.min(limits.maxConcurrentTasks, limits.maxActiveAgents),
          )

          for (const task of blockedByFailure) {
            const error = 'A dependency failed, so this task was not invoked.'
            emit('task.failed', { agentId: task.assigneeId, taskId: task.id, error })
            results.push({ task, error })
            failedTaskIds.add(task.id)
            pending.splice(pending.indexOf(task), 1)
          }

          if (cycleDetected) {
            for (const task of pending.splice(0)) {
              const error = 'Task graph contains an unresolved dependency cycle.'
              emit('task.failed', { agentId: task.assigneeId, taskId: task.id, error })
              results.push({ task, error })
              failedTaskIds.add(task.id)
            }
            break
          }

          if (!readyBatch.length) break

          const batchResults = await Promise.all(
            readyBatch.map(async (task) => {
              const worker = workers.find((agent) => agent.id === task.assigneeId)!
              const taskSender =
                topologyMode === 'dual-coordinator'
                  ? planners[workers.indexOf(worker) % planners.length]
                  : coordinator
              emit('message.sent', {
                senderId: taskSender.id,
                recipientId: worker.id,
                taskId: task.id,
                message: task.description,
                relevantFiles: task.relevantFiles,
              })
              emit('worker.response.started', { agentId: worker.id, taskId: task.id })
              try {
                const relevantContext = files
                  .filter((file) => task.relevantFiles.includes(file.path))
                  .map((file) => `--- ${file.path}\n${file.content.slice(0, 8000)}`)
                  .join('\n')

                const toolRun = await completeWithTools({
                  endpoint,
                  provider,
                  model: worker.model || provider.model,
                  signal: request.signal,
                  workspaceRoot: resolvedRoot,
                  allowTools: isLocalReq,
                  mcpServers: body.mcpServers,
                  messages: [
                    {
                      role: 'system',
                      content: `${buildTeamCollaborationPrompt(worker, topologyAgents, projectMemory)}

Assigned Task Execution:
- Sender: ${taskSender.id}
- Recipient: ${worker.id}
- Task ID: ${task.id}
- Expected output: ${task.expectedOutput}
- Constraints: ${task.constraints.join('; ') || 'none'}
- Dependencies: ${task.dependencies.join(', ') || 'none'}
- Completion criteria: ${task.completionCriteria.join('; ') || 'report a verifiable result'}
- IMPORTANT: You have live workspace tools (\`read_file\`, \`patch_file\`, \`write_file\`, \`grep_search\`, \`find_symbol\`, \`run_verify\`, \`run_shell\`, \`message_agent\`, plus any connected MCP server tools). USE \`patch_file\` or \`write_file\` to ACTUALLY EDIT AND SAVE code directly to disk!`,
                    },
                    {
                      role: 'user',
                      content: `${task.description}\n\nShared team discussion:\n${planningContext || '(single coordinator plan)'}\n\nExplicit project context:\n${relevantContext || projectContext.slice(0, 24_000)}`,
                    },
                  ],
                  onToken: (chunk) => {
                    emit('agent.token', { agentId: worker.id, taskId: task.id, chunk })
                  },
                  onFileUpdated: (fileUpdated) => {
                    allSavedFiles.add(fileUpdated.path)
                    fileMap.set(fileUpdated.path, fileUpdated.nextContent)
                    emit('file.updated', {
                      agentId: worker.id,
                      taskId: task.id,
                      path: fileUpdated.path,
                      summary: fileUpdated.summary,
                      previousContent: fileUpdated.previousContent,
                      content: fileUpdated.nextContent,
                    })
                  },
                  onCommandApproval: (approval) => {
                    emit('command.approval_required', {
                      agentId: worker.id,
                      agentName: worker.name,
                      taskId: task.id,
                      approval,
                    })
                  },
                  onAgentHandoff: (handoff) => {
                    const target = topologyAgents.find(
                      (a) =>
                        a.id !== worker.id &&
                        (a.id.toLowerCase() === handoff.toRole.toLowerCase() ||
                          inferRoleId(`${a.id} ${a.role}`).toLowerCase() ===
                            handoff.toRole.toLowerCase()),
                    )
                    if (target) {
                      emit('message.sent', {
                        senderId: worker.id,
                        recipientId: target.id,
                        taskId: `HANDOFF-${task.id}`,
                        message: handoff.message,
                        relevantFiles: handoff.files ?? [],
                      })
                    }
                  },
                })

                const result = toolRun.text
                const workerRoleId = inferRoleId(`${worker.id} ${worker.role}`)
                const proposedPatches = extractProposedPatches(result, paths)
                for (const patch of proposedPatches) {
                  if (toolRun.savedFiles.includes(patch.path)) continue
                  const baseContent = fileMap.get(patch.path) ?? ''
                  const existingOwner = claimedFiles.get(patch.path)
                  const conflictWith =
                    existingOwner && existingOwner !== task.id ? existingOwner : undefined
                  if (!existingOwner) claimedFiles.set(patch.path, task.id)
                  const territory = validateTerritoryAccess(workerRoleId, patch.path)

                  if (!territory.allowed) {
                    const targetOwner =
                      workers.find(
                        (candidate) =>
                          inferRoleId(`${candidate.id} ${candidate.role}`) === territory.ownerRole,
                      ) ?? coordinator
                    emit('message.sent', {
                      senderId: worker.id,
                      recipientId: targetOwner.id,
                      taskId: `TERRITORY-${task.id}`,
                      message: territory.reason,
                      relevantFiles: [patch.path],
                    })
                  }

                  emit('patch.proposed', {
                    agentId: worker.id,
                    taskId: task.id,
                    patch: {
                      id: `patch-${crypto.randomUUID().slice(0, 8)}`,
                      taskId: task.id,
                      agentId: worker.id,
                      agentName: worker.name,
                      roleCode:
                        workerRoleId === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[workerRoleId].code,
                      path: patch.path,
                      summary: patch.summary,
                      originalContent: baseContent,
                      proposedContent: patch.content,
                      baseHash: hashText(baseContent),
                      conflictWith,
                      territoryViolation: territory.allowed ? undefined : territory.reason,
                      requiresApiContract: territory.requiresApiContract,
                      status: 'pending',
                      createdAt: new Date().toISOString(),
                    },
                  })
                }

                emit('worker.response.completed', {
                  agentId: worker.id,
                  senderId: worker.id,
                  recipientId: taskSender.id,
                  taskId: task.id,
                  result,
                })
                emit('task.completed', { agentId: worker.id, taskId: task.id, result })
                return { task, result }
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Worker failed.'
                emit('task.failed', { agentId: worker.id, taskId: task.id, error: message })
                return { task, error: message }
              }
            }),
          )

          results.push(...batchResults)
          for (const result of batchResults) {
            const idx = pending.indexOf(result.task)
            if (idx >= 0) pending.splice(idx, 1)
            if (result.error) failedTaskIds.add(result.task.id)
            else completedTaskIds.add(result.task.id)
          }
        }

        // If no worker tasks were delegated, let @PM directly execute with real tools so code fixes still happen!
        emit('coordinator.review.started', { agentId: coordinator.id })
        const finalRun = await completeWithTools({
          endpoint,
          provider,
          model: coordinator.model || provider.model,
          signal: request.signal,
          workspaceRoot: resolvedRoot,
          allowTools: isLocalReq && results.length === 0,
          mcpServers: body.mcpServers,
          messages: [
            {
              role: 'system',
              content: `You are ${coordinator.name}. Synthesize the team discussion, specialist reports, and saved file changes (${[...allSavedFiles].join(', ') || 'none yet'}) into a clear, factual final summary. ${
                results.length === 0
                  ? 'If the user asked to edit or fix code, use `read_file`, `find_symbol`, and `patch_file`/`write_file` right now to apply and save the change directly.'
                  : 'List exact modified/saved files and verification status honestly.'
              }`,
            },
            {
              role: 'user',
              content: `Original request: ${instruction}\nPlan: ${planSummary}\nTeam discussion:\n${planningContext || '(none)'}\n\nWorker reports:\n${
                results
                  .map(
                    ({ task, result, error }) =>
                      `## ${task.id} ${task.title}\n${result || `ERROR: ${error}`}`,
                  )
                  .join('\n\n') || 'No separate worker tasks were delegated.'
              }\n\nProject context:\n${projectContext.slice(0, 28_000)}`,
            },
          ],
          onToken: (chunk) => {
            emit('agent.token', { agentId: coordinator.id, chunk })
          },
          onFileUpdated: (fileUpdated) => {
            allSavedFiles.add(fileUpdated.path)
            emit('file.updated', {
              agentId: coordinator.id,
              path: fileUpdated.path,
              summary: fileUpdated.summary,
              previousContent: fileUpdated.previousContent,
              content: fileUpdated.nextContent,
            })
          },
          onCommandApproval: (approval) => {
            emit('command.approval_required', {
              agentId: coordinator.id,
              agentName: coordinator.name,
              approval,
            })
          },
        })

        emit('coordinator.review.completed', { agentId: coordinator.id, result: finalRun.text })
        emit('session.completed', { agentId: coordinator.id })
      } catch (error) {
        emit('session.failed', {
          agentId: coordinator.id,
          error: error instanceof Error ? error.message : 'Orchestration failed.',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
    },
  })
}
