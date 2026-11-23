import { hashText } from '@/lib/file-tree'
import {
  extractProposedPatches,
  parsePlan,
  partitionNextBatch,
  sanitizeTaskGraph,
  type OrchestratorAgent,
  type PlannedTask,
} from '@/lib/orchestrator'
import { resolveSafeProviderEndpoint } from '@/lib/provider-url'
import { checkRateLimit, getClientKey } from '@/lib/rate-limit'
import {
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
  agents?: OrchestratorAgent[]
  instruction?: string
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
}

async function complete(
  endpoint: URL,
  provider: Provider,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  signal: AbortSignal,
  model = provider.model,
) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.2 }),
    cache: 'no-store',
    redirect: 'error',
    signal,
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`Provider returned ${response.status}: ${detail}`)
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('')
  throw new Error('Provider returned an empty response.')
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

  if (Number(request.headers.get('content-length') ?? 0) > 1_500_000) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { provider, coordinatorId, instruction, project, projectMemory } = body
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
  const coordinator =
    coordinatorCandidates.find((agent) => agent.id === coordinatorId) ?? coordinatorCandidates[0]

  if (
    !provider?.apiKey ||
    !provider.baseUrl ||
    !provider.model ||
    !coordinator ||
    !instruction?.trim()
  ) {
    return Response.json(
      { error: 'Provider, coordinator, agents, and instruction are required.' },
      { status: 400 },
    )
  }

  let endpoint: URL
  try {
    endpoint = await resolveSafeProviderEndpoint(provider.baseUrl)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid provider URL.' },
      { status: 400 },
    )
  }

  const limits = {
    maxDepth: clamp(body.limits?.maxDepth, 0, 4, 1),
    maxActiveAgents: clamp(body.limits?.maxActiveAgents, 1, 24, 6),
    maxConcurrentTasks: clamp(body.limits?.maxConcurrentTasks, 1, 24, 4),
    maxIterations: clamp(body.limits?.maxIterations, 1, 8, 2),
    requireApproval: Boolean(body.limits?.requireApproval),
    assignmentMode: body.limits?.assignmentMode === 'manual' ? 'manual' : 'automatic',
  }
  const planners =
    topologyMode === 'peer'
      ? topologyAgents
      : topologyMode === 'dual-coordinator'
        ? topologyAgents.slice(0, 2)
        : topologyAgents.slice(0, 1)
  const workers =
    limits.maxDepth === 0
      ? []
      : topologyMode === 'peer'
        ? topologyAgents
        : topologyMode === 'dual-coordinator'
          ? topologyAgents.slice(2)
          : topologyAgents.slice(1)

  const files = (project?.files ?? []).slice(0, 80)
  const fileMap = new Map(files.map((file) => [file.path, file.content]))
  const paths = new Set(files.map((file) => file.path))
  const projectContext = files
    .map((file) => `--- ${file.path}\n${file.content.slice(0, 5000)}`)
    .join('\n')
    .slice(0, 60_000)
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

          if (topologyMode !== 'coordinator' && planners.length > 0) {
            const planningConcurrency = Math.max(
              1,
              Math.min(limits.maxActiveAgents, limits.maxConcurrentTasks),
            )
            const proposals = await runLimited(planners, planningConcurrency, async (planner) => {
              const taskId = `PLAN-${runId}-${planner.id}`
              emit('worker.response.started', { agentId: planner.id, taskId })
              const result = await complete(
                endpoint,
                provider,
                [
                  {
                    role: 'system',
                    content:
                      topologyMode === 'peer'
                        ? `You are ${planner.name}, one member of a six-agent peer planning room. Independently analyze the request, project risks, dependencies, likely file ownership, and a concrete work plan. Your proposal will be delivered to every other peer before execution.`
                        : `You are ${planner.name}, one of two planning agents. Independently analyze the request, architecture, dependencies, worker assignments, and conflict risks. Your proposal will be exchanged with the other planner before tasks are sent to four workers.`,
                  },
                  {
                    role: 'user',
                    content: `Project: ${project?.name || 'workspace'}\nRequest: ${instruction}\n\nProject context:\n${projectContext}`,
                  },
                ],
                request.signal,
                planner.model || provider.model,
              )
              emit('worker.response.completed', {
                agentId: planner.id,
                senderId: planner.id,
                recipientId: coordinator.id,
                taskId,
                result,
              })
              return { planner, result }
            })
            planningContext = proposals
              .map(
                ({ planner, result }) =>
                  `## Proposal from ${planner.name} (${planner.id})\n${result}`,
              )
              .join('\n\n')
            for (const proposal of proposals) {
              const recipients = planners.filter((planner) => planner.id !== proposal.planner.id)
              for (const recipient of recipients) {
                emit('message.sent', {
                  senderId: proposal.planner.id,
                  recipientId: recipient.id,
                  taskId: `PLAN-${runId}`,
                  message: proposal.result,
                  relevantFiles: [],
                })
              }
            }
            if (topologyMode === 'dual-coordinator' && planners.length === 2) {
              const sharedProposals = planningContext
              const refinements = await runLimited(
                planners,
                planningConcurrency,
                async (planner) => {
                  const otherPlanner = planners.find((item) => item.id !== planner.id)!
                  const taskId = `REVIEW-${runId}-${planner.id}`
                  emit('worker.response.started', { agentId: planner.id, taskId })
                  const result = await complete(
                    endpoint,
                    provider,
                    [
                      {
                        role: 'system',
                        content: `You are ${planner.name}, one of two planning agents. You have now received ${otherPlanner.name}'s proposal. Reconcile both proposals, explicitly resolve disagreements and file conflicts, then return your refined assignment plan for the four workers.`,
                      },
                      {
                        role: 'user',
                        content: `Original request: ${instruction}\n\nBoth planner proposals:\n${sharedProposals}`,
                      },
                    ],
                    request.signal,
                    planner.model || provider.model,
                  )
                  emit('worker.response.completed', {
                    agentId: planner.id,
                    senderId: planner.id,
                    recipientId: otherPlanner.id,
                    taskId,
                    result,
                  })
                  return { planner, result }
                },
              )
              planningContext = `${sharedProposals}\n\n${refinements
                .map(
                  ({ planner, result }) =>
                    `## Refined plan from ${planner.name} (${planner.id})\n${result}`,
                )
                .join('\n\n')}`
            }
          }

          const roster = workers
            .map((agent) => {
              const roleId = inferRoleId(`${agent.id} ${agent.role}`)
              const code = roleId === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[roleId].code
              return `${agent.id}: ${agent.name} [@${code}] — ${agent.role} — ${agent.model}`
            })
            .join('\n')
          const planRaw = await complete(
            endpoint,
            provider,
            [
              {
                role: 'system',
                content: `You are ${coordinator.name}, the central Project Manager (PM) & Coordinator for VinceZone Studio.
${buildVinceZoneCoordinatorRules('')}
Decide whether delegation is useful. Trivial requests should have an empty tasks array.
Never assign duplicate work. Respect dependencies, API Contracts, and exclusive file territories.
${topologyMode === 'peer' ? 'For a non-trivial request, assign one distinct task to every available peer so all six agents work from the shared discussion.' : ''}
${topologyMode === 'dual-coordinator' ? 'For a non-trivial request, assign one distinct task to each of the four workers based on the two-planner discussion.' : ''}
Return ONLY JSON: {"summary":"...","tasks":[{"id":"TASK-001","title":"...","description":"...","assigneeId":"exact id","dependencies":[],"relevantFiles":["exact known path"],"expectedOutput":"...","constraints":[],"completionCriteria":[]}]}.
Available specialists:
${roster || '(none)'}
Known project files: ${[...paths].join(', ')}
Limits: depth ${limits.maxDepth}, active agents ${limits.maxActiveAgents}, concurrent tasks ${limits.maxConcurrentTasks}, iterations ${limits.maxIterations}.`,
              },
              {
                role: 'user',
                content: `Project: ${project?.name || 'workspace'}\nRequest: ${instruction}\n\nShared planning discussion:\n${planningContext || '(single coordinator analysis)'}\n\nProject context:\n${projectContext}`,
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
                const result = await complete(
                  endpoint,
                  provider,
                  [
                    {
                      role: 'system',
                      content: `You are ${worker.name}, ${worker.role}. You are a worker, not the coordinator.
${worker.soul ? `Soul / Principles: ${worker.soul}\n` : ''}${worker.mission ? `Mission: ${worker.mission}\n` : ''}${worker.memory ? `Agent Memory: ${worker.memory}\n` : ''}${projectMemory ? `Project Memory: ${projectMemory}\n` : ''}Complete only the assigned task. Do not invent access to tools or files. Report findings, proposed changes, blockers, and exact file references.
When proposing concrete file edits, include a fenced \`\`\`baton-patch block with JSON: [{"path":"exact/file/path","summary":"brief description","content":"full updated file content"}].
Sender: ${taskSender.id}
Recipient: ${worker.id}
Task ID: ${task.id}
Expected output: ${task.expectedOutput}
Constraints: ${task.constraints.join('; ') || 'none'}
Dependencies: ${task.dependencies.join(', ') || 'none'}
Completion criteria: ${task.completionCriteria.join('; ') || 'report a verifiable result'}`,
                    },
                    {
                      role: 'user',
                      content: `${task.description}\n\nShared planning context from the other agents:\n${planningContext || '(single coordinator plan)'}\n\nExplicit project context:\n${relevantContext || projectContext.slice(0, 24_000)}`,
                    },
                  ],
                  request.signal,
                  worker.model || provider.model,
                )

                const workerRoleId = inferRoleId(`${worker.id} ${worker.role}`)
                const proposedPatches = extractProposedPatches(result, paths)
                for (const patch of proposedPatches) {
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

        emit('coordinator.review.started', { agentId: coordinator.id })
        const final = await complete(
          endpoint,
          provider,
          [
            {
              role: 'system',
              content: `You are ${coordinator.name}. Review worker reports, identify conflicts or blockers, and give the user a concise integrated result. Do not claim files were changed unless the user approves proposed patches. State next actions clearly.`,
            },
            {
              role: 'user',
              content: `Original request: ${instruction}\nPlan: ${planSummary}\nWorker reports:\n${
                results
                  .map(
                    ({ task, result, error }) =>
                      `## ${task.id} ${task.title}\n${result || `ERROR: ${error}`}`,
                  )
                  .join('\n\n') ||
                'No delegation was necessary. Respond directly to the request using the project context.'
              }\n\nProject context:\n${projectContext.slice(0, 32_000)}`,
            },
          ],
          request.signal,
          coordinator.model || provider.model,
        )
        emit('coordinator.review.completed', { agentId: coordinator.id, result: final })
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
