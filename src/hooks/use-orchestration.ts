'use client'

import { useCallback, useRef } from 'react'
import type {
  Agent,
  AgentLayout,
  AgentTask,
  AppSettings,
  CommunicationEvent,
  MailKind,
  MemoryNote,
  Message,
  PendingApprovalPlan,
  ProposedPatch,
  ProviderConfig,
  RuntimeEvent,
  UsageRecord,
  WorkspaceFile,
} from '@/components/ide/agent-types'
import { uid } from '@/components/ide/workspace-defaults'
import { estimateCostUsd, estimateTokens } from '@/lib/agent-layout'
import { parseRollbackPrompt } from '@/lib/edit-memory'

function parseSSEChunk(chunk: string) {
  let output = ''
  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data:')) continue
    const value = line.slice(5).trim()
    if (!value || value === '[DONE]') continue
    try {
      const data = JSON.parse(value)
      output += data.choices?.[0]?.delta?.content ?? ''
    } catch {
      // Partial SSE frame completed by the next chunk.
    }
  }
  return output
}

function readSavedTopology(agents: Agent[]) {
  let topology: {
    mode: 'peer' | 'dual-coordinator' | 'coordinator'
    orderedAgentIds: string[]
  } = {
    mode: 'coordinator',
    orderedAgentIds: agents.map((item) => item.id),
  }
  try {
    const savedLayout = JSON.parse(window.localStorage.getItem('baton-agent-layout') || '{}') as {
      layout?: 'equal' | 'focus2' | 'focus1'
      order?: string[]
    }
    topology = {
      mode:
        savedLayout.layout === 'equal'
          ? 'peer'
          : savedLayout.layout === 'focus2'
            ? 'dual-coordinator'
            : 'coordinator',
      orderedAgentIds: [
        ...(savedLayout.order ?? []).filter((id) => agents.some((item) => item.id === id)),
        ...agents.map((item) => item.id).filter((id) => !savedLayout.order?.includes(id)),
      ],
    }
  } catch {
    // Fall back to coordinator topology.
  }
  return topology
}

export function useOrchestration({
  agents,
  files,
  activeFile,
  projectName,
  memoryNotes,
  providers,
  savedProvider,
  appSettings,
  drafts,
  setAgents,
  setAgentTasks,
  setCommunicationEvents,
  setProposedPatches,
  setPendingApproval,
  setDrafts,
  setAiActivity,
  onRecordUsage,
  onPromptRollback,
}: {
  agents: Agent[]
  files: WorkspaceFile[]
  activeFile?: WorkspaceFile
  projectName: string
  memoryNotes: MemoryNote[]
  providers: ProviderConfig[]
  savedProvider: ProviderConfig
  appSettings: AppSettings
  drafts: Record<string, string>
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>
  setAgentTasks: React.Dispatch<React.SetStateAction<AgentTask[]>>
  setCommunicationEvents: React.Dispatch<React.SetStateAction<CommunicationEvent[]>>
  setProposedPatches: React.Dispatch<React.SetStateAction<ProposedPatch[]>>
  setPendingApproval: React.Dispatch<React.SetStateAction<PendingApprovalPlan | null>>
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setAiActivity: React.Dispatch<React.SetStateAction<'idle' | 'reading' | 'editing'>>
  onRecordUsage: (record: UsageRecord) => void
  onPromptRollback?: (prompt: string) => { restored: boolean; message: string } | null
}) {
  const aborters = useRef<Record<string, AbortController>>({})
  const agentsRef = useRef(agents)
  agentsRef.current = agents

  const resolveProviderForAgent = useCallback(
    (agent: Agent) => {
      const matched = agent.providerId
        ? providers.find((item) => item.id === agent.providerId && item.apiKey)
        : undefined
      return matched ?? savedProvider
    },
    [providers, savedProvider],
  )

  const updateAgent = useCallback(
    (id: string, updater: (agent: Agent) => Agent) =>
      setAgents((current) => current.map((agent) => (agent.id === id ? updater(agent) : agent))),
    [setAgents],
  )

  const appendCommunicationEvent = useCallback(
    (
      event: Omit<CommunicationEvent, 'id' | 'timestamp'> &
        Partial<Pick<CommunicationEvent, 'id' | 'timestamp'>>,
    ) =>
      setCommunicationEvents((current) => [
        ...current.slice(-299),
        {
          ...event,
          id: event.id || uid(),
          timestamp: event.timestamp || new Date().toISOString(),
        },
      ]),
    [setCommunicationEvents],
  )

  /**
   * Animate the commander visibly typing a prompt into its composer and sending it.
   */
  const animateCommanderTypeAndSend = useCallback(
    (senderId: string, promptText: string, onDispatched: () => void) => {
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (reducedMotion) {
        onDispatched()
        return
      }

      const chunks = Math.min(18, Math.max(6, Math.ceil(promptText.length / 6)))
      let step = 1
      const timer = window.setInterval(() => {
        const end = Math.ceil((promptText.length * step) / chunks)
        updateAgent(senderId, (current) => ({
          ...current,
          composingPrompt: promptText.slice(0, end),
        }))
        step += 1
        if (step > chunks) {
          window.clearInterval(timer)
          window.setTimeout(() => {
            updateAgent(senderId, (current) => ({
              ...current,
              composingPrompt: undefined,
            }))
            onDispatched()
          }, 160)
        }
      }, 42)
    },
    [updateAgent],
  )

  const handleRuntimeEvent = useCallback(
    (event: RuntimeEvent, runMeta?: { coordinatorId: string; instruction: string }) => {
      if (event.type === 'task.created' && event.task) {
        setAgentTasks((current) => [
          ...current.filter((task) => task.id !== event.task!.id),
          event.task!,
        ])
        return
      }
      if (event.type === 'patch.proposed' && event.patch) {
        const patch = event.patch
        setProposedPatches((current) => [patch, ...current.filter((item) => item.id !== patch.id)])
        updateAgent(patch.agentId, (current) => ({
          ...current,
          messages: [
            ...current.messages,
            {
              id: uid(),
              role: 'tool',
              change: true,
              patchId: patch.id,
              codeSnippet: patch.proposedContent.slice(0, 220),
              text: `Proposed edit for ${patch.path}: ${patch.summary}`,
            },
          ],
        }))
        appendCommunicationEvent({
          type: 'patch.proposed',
          kind: 'code',
          senderId: patch.agentId,
          recipientId: runMeta?.coordinatorId || agentsRef.current[0]?.id,
          taskId: patch.taskId,
          label: `Code: ${patch.path.split('/').pop()}`,
          codeSnippet: patch.proposedContent.slice(0, 120),
          description: `Code patch proposed for ${patch.path}`,
        })
        return
      }
      if (event.type === 'message.sent' && event.senderId && event.recipientId) {
        const sender = agentsRef.current.find((agent) => agent.id === event.senderId)
        const recipient = agentsRef.current.find((agent) => agent.id === event.recipientId)
        const isPlanningExchange = Boolean(event.taskId?.startsWith('PLAN-'))
        const isTerritoryAlert = Boolean(event.taskId?.startsWith('TERRITORY-'))
        const kind: MailKind = isTerritoryAlert
          ? 'conflict'
          : isPlanningExchange
            ? 'peer'
            : 'delegation'
        const promptPreview = `@${recipient?.name || event.recipientId}: ${(event.message || '').slice(0, 110)}`

        const dispatchDelivery = () => {
          appendCommunicationEvent({
            type: event.type,
            kind,
            timestamp: event.timestamp,
            senderId: event.senderId!,
            recipientId: event.recipientId,
            taskId: event.taskId,
            label: isTerritoryAlert
              ? 'API Contract'
              : isPlanningExchange
                ? 'Proposal'
                : event.taskId || 'Task',
            description: event.message || 'Structured task message sent.',
            relevantFiles: event.relevantFiles,
          })
          updateAgent(event.recipientId!, (current) => ({
            ...current,
            status: isPlanningExchange ? current.status : 'running',
            currentTask: isPlanningExchange ? current.currentTask : event.taskId,
            messages: [
              ...current.messages,
              {
                id: uid(),
                role: 'agent',
                from: sender?.name || event.senderId,
                text: event.message || 'Structured task received.',
              },
            ],
          }))
          if (!isPlanningExchange) {
            setAgentTasks((current) =>
              current.map((task) =>
                task.id === event.taskId ? { ...task, status: 'running' as const } : task,
              ),
            )
          }
        }

        if (!isPlanningExchange && !isTerritoryAlert) {
          animateCommanderTypeAndSend(event.senderId, promptPreview, dispatchDelivery)
        } else {
          dispatchDelivery()
        }
        return
      }
      if (event.type === 'worker.response.started' && event.agentId) {
        updateAgent(event.agentId, (current) => ({
          ...current,
          status: 'running',
          currentTask: event.taskId,
          messages: [
            ...current.messages,
            { id: `runtime-${event.taskId}`, role: 'assistant', text: '' },
          ],
        }))
        return
      }
      if (event.type === 'worker.response.completed' && event.agentId) {
        const worker = agentsRef.current.find((a) => a.id === event.agentId)
        updateAgent(event.agentId, (current) => ({
          ...current,
          status: 'idle',
          currentTask: undefined,
          messages: current.messages.map((message) =>
            message.id === `runtime-${event.taskId}`
              ? {
                  ...message,
                  id: uid(),
                  text: event.result || 'Worker completed without a report.',
                }
              : message,
          ),
        }))
        if (event.result) {
          const completionTokens = estimateTokens(event.result)
          const promptTokens = Math.round(completionTokens * 1.4)
          onRecordUsage({
            id: uid(),
            providerName: savedProvider.name,
            model: worker?.model || savedProvider.model,
            agentName: worker?.name || event.agentId,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens),
            timestamp: new Date().toISOString(),
          })
        }
        if (event.senderId && event.recipientId && event.senderId !== event.recipientId) {
          appendCommunicationEvent({
            type: event.type,
            kind: 'report',
            timestamp: event.timestamp,
            senderId: event.senderId,
            recipientId: event.recipientId,
            taskId: event.taskId,
            label: event.taskId?.startsWith('REVIEW-') ? 'Refinement' : 'Report',
            description: 'Worker report delivered to coordinator.',
          })
        }
        return
      }
      if ((event.type === 'task.completed' || event.type === 'task.failed') && event.taskId) {
        setAgentTasks((current) =>
          current.map((task) =>
            task.id === event.taskId
              ? {
                  ...task,
                  status: event.type === 'task.completed' ? 'completed' : 'failed',
                  result: event.result,
                  error: event.error,
                }
              : task,
          ),
        )
        if (event.type === 'task.failed' && event.agentId) {
          updateAgent(event.agentId, (current) => ({
            ...current,
            status: 'blocked',
            currentTask: undefined,
            messages: current.messages.map((message) =>
              message.id === `runtime-${event.taskId}`
                ? {
                    ...message,
                    id: uid(),
                    text: `Worker error: ${event.error || 'Unknown error'}`,
                  }
                : message,
            ),
          }))
        }
        return
      }
      if (event.type === 'coordinator.response.started' && event.agentId) {
        updateAgent(event.agentId, (current) => ({ ...current, status: 'running' }))
        return
      }
      if (event.type === 'coordinator.response.completed' && event.agentId) {
        updateAgent(event.agentId, (current) => ({
          ...current,
          status: 'reviewing',
          messages: [
            ...current.messages,
            { id: uid(), role: 'tool', text: 'Task graph generated and delegation policy applied.' },
          ],
        }))
        return
      }
      if (event.type === 'coordinator.review.started' && event.agentId) {
        updateAgent(event.agentId, (current) => ({ ...current, status: 'reviewing' }))
        return
      }
      if (event.type === 'coordinator.review.completed' && event.agentId) {
        updateAgent(event.agentId, (current) => ({
          ...current,
          status: 'idle',
          messages: [...current.messages, { id: uid(), role: 'assistant', text: event.result || '' }],
        }))
        return
      }
      if (event.type === 'approval.required' && event.agentId) {
        if (event.tasks?.length && runMeta) {
          setPendingApproval({
            coordinatorId: runMeta.coordinatorId,
            instruction: runMeta.instruction,
            tasks: event.tasks,
            planningContext: event.planningContext || '',
            planSummary: event.planSummary || '',
          })
        }
        updateAgent(event.agentId, (current) => ({
          ...current,
          status: 'paused',
          messages: [...current.messages, { id: uid(), role: 'tool', text: event.message || '' }],
        }))
        return
      }
      if (event.type === 'session.failed' && event.agentId) {
        updateAgent(event.agentId, (current) => ({
          ...current,
          status: 'blocked',
          messages: [
            ...current.messages,
            {
              id: uid(),
              role: 'assistant',
              text: `Orchestration error: ${event.error || 'Unknown error'}`,
            },
          ],
        }))
      }
    },
    [
      animateCommanderTypeAndSend,
      appendCommunicationEvent,
      onRecordUsage,
      savedProvider.model,
      savedProvider.name,
      setAgentTasks,
      setPendingApproval,
      setProposedPatches,
      updateAgent,
    ],
  )

  const streamOrchestration = useCallback(
    async (
      coordinator: Agent,
      instruction: string,
      approvalResume?: {
        approvedTasks: AgentTask[]
        planningContext: string
        planSummary: string
      },
    ) => {
      const controller = new AbortController()
      aborters.current[coordinator.id] = controller
      const topology = readSavedTopology(agentsRef.current)
      const activeProvider = resolveProviderForAgent(coordinator)
      const projectMemory = memoryNotes.map((note) => `- ${note.title}: ${note.content}`).join('\n')

      if (!approvalResume) {
        updateAgent(coordinator.id, (current) => ({
          ...current,
          status: 'running',
          messages: [...current.messages, { id: uid(), role: 'user', text: instruction }],
        }))
      } else {
        updateAgent(coordinator.id, (current) => ({
          ...current,
          status: 'running',
          messages: [
            ...current.messages,
            {
              id: uid(),
              role: 'tool',
              text: `Approved ${approvalResume.approvedTasks.length} task(s). Resuming worker execution.`,
            },
          ],
        }))
      }

      setAiActivity('reading')
      try {
        const response = await fetch('/api/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            provider: activeProvider,
            coordinatorId: coordinator.id,
            agents: agentsRef.current.map(({ id, name, role, model, soul, mission, memory }) => ({
              id,
              name,
              role,
              model,
              soul,
              mission,
              memory,
            })),
            instruction,
            projectMemory,
            project: {
              name: projectName,
              files: files.map(({ path, content }) => ({ path, content })),
            },
            limits: appSettings.delegation,
            topology,
            ...(approvalResume
              ? {
                  approvedTasks: approvalResume.approvedTasks,
                  planningContext: approvalResume.planningContext,
                  planSummary: approvalResume.planSummary,
                }
              : {}),
          }),
        })
        if (!response.ok || !response.body) {
          const error = await response.json().catch(() => ({ error: 'Orchestration failed.' }))
          throw new Error(error.error)
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''
        const runMeta = { coordinatorId: coordinator.id, instruction }

        const dispatchFrame = (rawFrame: string) => {
          const dataLine = rawFrame
            .split('\n')
            .find((line) => line.startsWith('data:'))
            ?.slice(5)
            .trim()
          if (!dataLine) return
          try {
            handleRuntimeEvent(JSON.parse(dataLine) as RuntimeEvent, runMeta)
          } catch {
            // Skip malformed SSE frame
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const frames = pending.split('\n\n')
          pending = frames.pop() ?? ''
          for (const frame of frames) dispatchFrame(frame)
        }
        if (pending.trim()) dispatchFrame(pending)
      } catch (error) {
        handleRuntimeEvent({
          type: 'session.failed',
          timestamp: new Date().toISOString(),
          agentId: coordinator.id,
          error:
            error instanceof DOMException && error.name === 'AbortError'
              ? 'Coordinator run stopped by the user.'
              : error instanceof Error
                ? error.message
                : 'Unknown error',
        })
      } finally {
        delete aborters.current[coordinator.id]
        setAiActivity('idle')
      }
    },
    [
      appSettings.delegation,
      files,
      handleRuntimeEvent,
      memoryNotes,
      projectName,
      resolveProviderForAgent,
      setAiActivity,
      updateAgent,
    ],
  )

  const sendMessage = useCallback(
    async (agent: Agent, delegatedText?: string, delegated = false) => {
      const text = delegatedText?.trim() || drafts[agent.id]?.trim()
      if (!text) return

      if (!delegated && onPromptRollback && parseRollbackPrompt(text)) {
        const rollbackOutcome = onPromptRollback(text)
        if (rollbackOutcome) {
          setDrafts((current) => ({ ...current, [agent.id]: '' }))
          updateAgent(agent.id, (current) => ({
            ...current,
            messages: [
              ...current.messages,
              { id: uid(), role: 'user', text },
              { id: uid(), role: 'tool', text: rollbackOutcome.message },
            ],
          }))
          return
        }
      }

      const activeProvider = resolveProviderForAgent(agent)
      const topology = readSavedTopology(agentsRef.current)
      const autonomousAgentIds =
        topology.mode === 'peer'
          ? topology.orderedAgentIds
          : topology.mode === 'dual-coordinator'
            ? topology.orderedAgentIds.slice(0, 2)
            : topology.orderedAgentIds.slice(0, 1)

      if (!delegated && autonomousAgentIds.includes(agent.id) && activeProvider.apiKey) {
        setDrafts((current) => ({ ...current, [agent.id]: '' }))
        setPendingApproval(null)
        await streamOrchestration(agent, text)
        return
      }

      const userMessage: Message = { id: uid(), role: 'user', text }
      setAiActivity('reading')
      if (!delegated) setDrafts((current) => ({ ...current, [agent.id]: '' }))
      updateAgent(agent.id, (current) => ({
        ...current,
        status: 'running',
        messages: [
          ...current.messages,
          ...(delegated ? [] : [userMessage]),
          { id: 'stream', role: 'assistant', text: '' },
        ],
      }))

      if (!activeProvider.apiKey) {
        updateAgent(agent.id, (current) => ({
          ...current,
          status: 'idle',
          messages: current.messages.map((message) =>
            message.id === 'stream'
              ? {
                  ...message,
                  id: uid(),
                  text: `Provider is not connected. Open Settings → Providers to add a session-only API key for ${activeProvider.name}.`,
                }
              : message,
          ),
        }))
        setAiActivity('idle')
        return
      }

      const controller = new AbortController()
      aborters.current[agent.id] = controller
      const projectMemText = memoryNotes.map((n) => `- ${n.title}: ${n.content}`).join('\n')
      const systemPrompt = [
        `You are ${agent.name}, ${agent.role}. Be concise.`,
        agent.soul ? `Soul: ${agent.soul}` : '',
        agent.mission ? `Mission: ${agent.mission}` : '',
        agent.memory ? `Agent Memory: ${agent.memory}` : '',
        projectMemText ? `Project Memory:\n${projectMemText}` : '',
        activeFile
          ? `Active file (${activeFile.path}):\n${activeFile.content.slice(0, 12000)}`
          : 'No file open.',
      ]
        .filter(Boolean)
        .join('\n')

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ...activeProvider,
            model: agent.model || activeProvider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...agent.messages
                .filter((message) => message.role !== 'tool')
                .map((message) => ({
                  role: message.role === 'agent' ? 'user' : message.role,
                  content:
                    message.role === 'agent'
                      ? `Delegated by ${message.from ?? 'another agent'}: ${message.text}`
                      : message.text,
                })),
              { role: 'user', content: text },
            ],
          }),
        })
        if (!response.ok || !response.body) {
          const error = await response.json().catch(() => ({ error: 'Provider request failed.' }))
          throw new Error(error.error)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let result = ''
        let pending = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const frames = pending.split('\n\n')
          pending = frames.pop() ?? ''
          result += parseSSEChunk(frames.join('\n\n'))
          updateAgent(agent.id, (current) => ({
            ...current,
            messages: current.messages.map((message) =>
              message.id === 'stream' ? { ...message, text: result } : message,
            ),
          }))
        }
        if (pending) result += parseSSEChunk(pending)

        const promptTokens = estimateTokens(`${systemPrompt}\n${text}`)
        const completionTokens = estimateTokens(result)
        onRecordUsage({
          id: uid(),
          providerName: activeProvider.name,
          model: agent.model || activeProvider.model,
          agentName: agent.name,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens),
          timestamp: new Date().toISOString(),
        })

        updateAgent(agent.id, (current) => ({
          ...current,
          status: 'idle',
          messages: current.messages.map((message) =>
            message.id === 'stream'
              ? { ...message, id: uid(), text: result || 'The provider returned an empty response.' }
              : message,
          ),
        }))
      } catch (error) {
        updateAgent(agent.id, (current) => ({
          ...current,
          status: 'idle',
          messages: current.messages.map((message) =>
            message.id === 'stream'
              ? {
                  ...message,
                  id: uid(),
                  text:
                    error instanceof DOMException && error.name === 'AbortError'
                      ? 'Generation stopped.'
                      : `Provider error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                }
              : message,
          ),
        }))
      } finally {
        delete aborters.current[agent.id]
        setAiActivity('idle')
      }
    },
    [
      activeFile,
      drafts,
      memoryNotes,
      onPromptRollback,
      onRecordUsage,
      resolveProviderForAgent,
      setAiActivity,
      setDrafts,
      setPendingApproval,
      streamOrchestration,
      updateAgent,
    ],
  )

  const delegateAgent = useCallback(
    (sourceId: string, targetId: string, prompt: string) => {
      const source = agentsRef.current.find((agent) => agent.id === sourceId)
      const target = agentsRef.current.find((agent) => agent.id === targetId)
      const instruction = prompt.trim()
      if (!source || !target || !instruction || sourceId === targetId) return

      animateCommanderTypeAndSend(sourceId, `@${target.name}: ${instruction}`, () => {
        appendCommunicationEvent({
          type: 'message.sent',
          kind: 'direct',
          senderId: sourceId,
          recipientId: targetId,
          label: 'Direct prompt',
          description: instruction,
        })
        updateAgent(sourceId, (current) => ({
          ...current,
          messages: [
            ...current.messages,
            {
              id: uid(),
              role: 'tool',
              text: `Prompt dispatched to ${target.name}: "${instruction}"`,
            },
          ],
        }))
        updateAgent(targetId, (current) => ({
          ...current,
          status: 'running',
          messages: [
            ...current.messages,
            { id: uid(), role: 'agent', text: instruction, from: source.name },
          ],
        }))
        void sendMessage(target, instruction, true)
      })
    },
    [animateCommanderTypeAndSend, appendCommunicationEvent, sendMessage, updateAgent],
  )

  const pauseAgent = useCallback(
    (agent: Agent) => {
      aborters.current[agent.id]?.abort()
      updateAgent(agent.id, (current) => ({
        ...current,
        status: current.status === 'paused' ? 'idle' : 'paused',
      }))
    },
    [updateAgent],
  )

  const previewMailExchange = useCallback(
    (_layout: AgentLayout, orderedAgentIds: string[]) => {
      if (orderedAgentIds.length < 2) return
      const [commanderId, ...workers] = orderedAgentIds
      const commander = agentsRef.current.find((a) => a.id === commanderId)
      const targets = workers.slice(0, 4)

      targets.forEach((targetId, index) => {
        const target = agentsRef.current.find((a) => a.id === targetId)
        const taskPrompt = `@${target?.name || targetId}: Implement module contract #${index + 1} and return typed code patch.`
        const sampleCode =
          index % 2 === 0
            ? `export async function GET() {\n  return Response.json({ ok: true, task: ${index + 1} })\n}`
            : `export function PanelCard({ title }: { title: string }) {\n  return <section>{title}</section>\n}`

        window.setTimeout(() => {
          animateCommanderTypeAndSend(commanderId, taskPrompt, () => {
            updateAgent(commanderId, (current) => ({
              ...current,
              messages: [
                ...current.messages,
                { id: uid(), role: 'user', text: taskPrompt },
              ],
            }))
            appendCommunicationEvent({
              type: 'message.sent',
              kind: 'delegation',
              senderId: commanderId,
              recipientId: targetId,
              label: `TASK-00${index + 1}`,
              description: taskPrompt,
            })
            updateAgent(targetId, (current) => ({
              ...current,
              messages: [
                ...current.messages,
                {
                  id: uid(),
                  role: 'agent',
                  from: commander?.name || 'PM Orchestrator',
                  text: taskPrompt,
                },
              ],
            }))

            // Worker replies with an animated Code Packet back to Commander
            window.setTimeout(() => {
              appendCommunicationEvent({
                type: 'patch.proposed',
                kind: 'code',
                senderId: targetId,
                recipientId: commanderId,
                label: `Code #${index + 1}`,
                codeSnippet: sampleCode,
                description: `${target?.name || targetId} returned verified code implementation.`,
              })
              updateAgent(commanderId, (current) => ({
                ...current,
                messages: [
                  ...current.messages,
                  {
                    id: uid(),
                    role: 'agent',
                    from: target?.name || targetId,
                    text: `Delivered verified code for TASK-00${index + 1}.`,
                    codeSnippet: sampleCode,
                  },
                ],
              }))
            }, 1150)
          })
        }, index * 1250)
      })
    },
    [animateCommanderTypeAndSend, appendCommunicationEvent, updateAgent],
  )

  return {
    sendMessage,
    streamOrchestration,
    delegateAgent,
    pauseAgent,
    previewMailExchange,
  }
}
