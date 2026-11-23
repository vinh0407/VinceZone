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
import { slugifyCommand } from '@/components/ide/slash-command-popover'
import { uid } from '@/components/ide/workspace-defaults'
import {
  buildBridgeContextPrompt,
  extractBridgeRoutes,
  resolveAgentByRoleOrName,
  type BridgeMessage,
  type BridgeMessageKind,
} from '@/lib/agent-bridge'
import { estimateCostUsd, estimateTokens } from '@/lib/agent-layout'
import { parseRollbackPrompt } from '@/lib/edit-memory'
import { hashText } from '@/lib/file-tree'
import {
  extractProposedPatches,
  selectCompactWorkspaceFiles,
} from '@/lib/orchestrator'
import {
  buildTeamCollaborationPrompt,
  inferRoleId,
  ROLE_TERRITORIES,
  validateTerritoryAccess,
} from '@/lib/vincezone-protocol'

type ParsedChatChunk = {
  text: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  events: Array<{
    type: string
    name?: string
    args?: Record<string, unknown>
    ok?: boolean
    preview?: string
    path?: string
    summary?: string
    content?: string
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    toRole?: string
    message?: string
    files?: string[]
  }>
}

function parseSSEChunk(chunk: string): ParsedChatChunk {
  let text = ''
  let usage: ParsedChatChunk['usage']
  const events: ParsedChatChunk['events'] = []

  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data:')) continue
    const value = line.slice(5).trim()
    if (!value || value === '[DONE]') continue
    try {
      const data = JSON.parse(value)
      if (data.vincezone_event) {
        events.push(data.vincezone_event)
        if (data.vincezone_event.type === 'usage') {
          usage = {
            promptTokens: data.vincezone_event.promptTokens ?? 0,
            completionTokens: data.vincezone_event.completionTokens ?? 0,
            totalTokens: data.vincezone_event.totalTokens ?? 0,
          }
        }
      }
      if (data.usage?.total_tokens) {
        usage = {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      }
      text += data.choices?.[0]?.delta?.content ?? ''
    } catch {
      // Partial SSE frame completed by the next chunk.
    }
  }
  return { text, usage, events }
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
  workspaceRoot,
  memoryNotes,
  bridgeMessages = [],
  bridgeEnabled = true,
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
  onBridgeMessage,
  onRecordUsage,
  onApplyDirectEdit,
  onPromptRollback,
}: {
  agents: Agent[]
  files: WorkspaceFile[]
  activeFile?: WorkspaceFile
  projectName: string
  workspaceRoot?: string
  memoryNotes: MemoryNote[]
  bridgeMessages?: BridgeMessage[]
  bridgeEnabled?: boolean
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
  onBridgeMessage?: (message: BridgeMessage) => void
  onRecordUsage: (record: UsageRecord) => void
  onApplyDirectEdit?: (input: {
    path: string
    content: string
    summary: string
    agent: Agent
  }) => { applied: boolean; revisionId?: string }
  onPromptRollback?: (prompt: string) => { restored: boolean; message: string } | null
}) {
  const aborters = useRef<Record<string, AbortController>>({})
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  const bridgeMessagesRef = useRef(bridgeMessages)
  bridgeMessagesRef.current = bridgeMessages

  const publishBridgeMessage = useCallback(
    (input: {
      from: Agent
      to: Agent
      kind: BridgeMessageKind
      content: string
      relatedFiles?: string[]
    }) => {
      const fromRid = input.from.roleId ?? inferRoleId(`${input.from.id} ${input.from.role}`)
      const toRid = input.to.roleId ?? inferRoleId(`${input.to.id} ${input.to.role}`)
      const msg: BridgeMessage = {
        id: `br-${uid()}`,
        fromAgentId: input.from.id,
        fromAgentName: input.from.name,
        fromRole: fromRid === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[fromRid].code,
        toAgentId: input.to.id,
        toAgentName: input.to.name,
        toRole: toRid === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[toRid].code,
        kind: input.kind,
        content: input.content,
        relatedFiles: input.relatedFiles,
        timestamp: new Date().toISOString(),
      }
      onBridgeMessage?.(msg)
      void fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post', root: workspaceRoot, message: msg }),
      }).catch(() => {})
      return msg
    },
    [onBridgeMessage, workspaceRoot],
  )

  const resolveSlashContext = useCallback(
    async (text: string): Promise<{ promptBlock: string; badges: string[] }> => {
      const matches = Array.from(text.matchAll(/(?:^|\s)\/([a-z0-9:._-]+)(?![/\w])/gi)).map((m) =>
        m[1].toLowerCase(),
      )
      const uniqueTokens = Array.from(new Set(matches)).slice(0, 4)
      if (uniqueTokens.length === 0) return { promptBlock: '', badges: [] }

      const sections: string[] = []
      const badges: string[] = []

      for (const token of uniqueTokens) {
        if (token.startsWith('mcp:')) {
          const slug = token.slice(4)
          const mcp = appSettings.mcpServers.find(
            (item) =>
              item.enabled &&
              (slugifyCommand(item.name) === slug ||
                slugifyCommand(item.name).includes(slug) ||
                item.id.toLowerCase().includes(slug)),
          )
          if (mcp) {
            badges.push(`MCP: ${mcp.name}`)
            sections.push(
              `[ACTIVATED MCP SERVER: ${mcp.name}]\nTransport: ${mcp.transport}\nEndpoint: ${mcp.endpoint}\nUse this MCP server's capabilities and protocol conventions when fulfilling the user's request.`,
            )
          }
          continue
        }

        if (token.startsWith('plugin:')) {
          const slug = token.slice(7)
          const plugin = appSettings.plugins.find(
            (item) =>
              item.enabled &&
              (slugifyCommand(item.name) === slug ||
                slugifyCommand(item.name).includes(slug) ||
                item.id.toLowerCase().includes(slug)),
          )
          if (plugin) {
            badges.push(`Plugin: ${plugin.name}`)
            sections.push(
              `[ACTIVATED PLUGIN: ${plugin.name}]\nPurpose: ${plugin.description}\nStrictly apply this plugin's rules to your response and edits.`,
            )
          }
          continue
        }

        // Load real SKILL.md from C:\Users\ADMIN\.agents\skills (via /api/extensions?skill=...)
        try {
          const res = await fetch(`/api/extensions?skill=${encodeURIComponent(token)}`, {
            cache: 'no-store',
          })
          if (res.ok) {
            const data = (await res.json()) as {
              ok?: boolean
              skill?: { slug: string; name: string; path: string; content: string }
            }
            if (data.ok && data.skill) {
              badges.push(`Skill: /${data.skill.slug}`)
              sections.push(
                `[LOADED SKILL: /${data.skill.slug} from ${data.skill.path}]\nFollow these skill instructions strictly:\n${data.skill.content.slice(0, 7_500)}`,
              )
            }
          }
        } catch {
          // Ignore network/lookup failure for unknown /tokens
        }
      }

      return { promptBlock: sections.join('\n\n'), badges }
    },
    [appSettings.mcpServers, appSettings.plugins],
  )

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
        const sourceAgent = agentsRef.current.find((a) => a.id === patch.agentId)
        let appliedRev: string | undefined
        let nextStatus = patch.status

        if (
          appSettings.autoApplyTrusted &&
          !patch.conflictWith &&
          !patch.territoryViolation &&
          sourceAgent &&
          onApplyDirectEdit
        ) {
          const applied = onApplyDirectEdit({
            path: patch.path,
            content: patch.proposedContent,
            summary: patch.summary,
            agent: sourceAgent,
          })
          if (applied.applied) {
            nextStatus = 'applied'
            appliedRev = applied.revisionId
          }
        }

        const storedPatch: ProposedPatch = { ...patch, status: nextStatus }
        setProposedPatches((current) => [
          storedPatch,
          ...current.filter((item) => item.id !== patch.id),
        ])
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
              text: appliedRev
                ? `Applied edit to ${patch.path} (${appliedRev}): ${patch.summary}`
                : `Proposed edit for ${patch.path}: ${patch.summary}`,
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
          description: appliedRev
            ? `Applied code patch to ${patch.path} (${appliedRev})`
            : `Code patch proposed for ${patch.path}`,
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
      appSettings.autoApplyTrusted,
      appendCommunicationEvent,
      onApplyDirectEdit,
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
      const slashResolved = await resolveSlashContext(instruction)
      const projectMemory = [
        memoryNotes.map((note) => `- ${note.title}: ${note.content}`).join('\n'),
        slashResolved.promptBlock,
      ]
        .filter(Boolean)
        .join('\n\n')

      if (!approvalResume) {
        updateAgent(coordinator.id, (current) => ({
          ...current,
          status: 'running',
          messages: [
            ...current.messages,
            { id: uid(), role: 'user', text: instruction },
            ...(slashResolved.badges.length
              ? [
                  {
                    id: uid(),
                    role: 'tool' as const,
                    text: `Loaded via /: ${slashResolved.badges.join(' · ')}`,
                  },
                ]
              : []),
          ],
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
              files: selectCompactWorkspaceFiles(files, activeFile?.path, instruction),
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
      activeFile?.path,
      appSettings.delegation,
      files,
      handleRuntimeEvent,
      memoryNotes,
      projectName,
      resolveProviderForAgent,
      resolveSlashContext,
      setAiActivity,
      updateAgent,
    ],
  )

  const sendMessage = useCallback(
    async (
      agent: Agent,
      delegatedText?: string,
      delegated = false,
      options?: { forceDirectChat?: boolean; handoffDepth?: number; replyToAgentId?: string },
    ) => {
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

      // Direct @ROLE routing via the Agent Bridge when user explicitly mentions a teammate (e.g. "@BE check API")
      if (!delegated && bridgeEnabled && agentsRef.current.length > 1) {
        const directUserRoutes = extractBridgeRoutes(text, agentsRef.current, agent.id)
        if (directUserRoutes.length > 0 && /^@[A-Za-z0-9_-]{2,24}/i.test(text)) {
          setDrafts((current) => ({ ...current, [agent.id]: '' }))
          updateAgent(agent.id, (current) => ({
            ...current,
            messages: [
              ...current.messages,
              { id: uid(), role: 'user', text },
              {
                id: uid(),
                role: 'tool',
                text: `Bridge routed to ${directUserRoutes.map((r) => `${r.targetAgentName} (@${r.targetRoleCode})`).join(', ')}.`,
              },
            ],
          }))
          for (const route of directUserRoutes) {
            const target = agentsRef.current.find((a) => a.id === route.targetAgentId)
            if (!target) continue
            publishBridgeMessage({
              from: agent,
              to: target,
              kind: route.kind,
              content: route.message,
              relatedFiles: activeFile ? [activeFile.path] : undefined,
            })
            appendCommunicationEvent({
              type: 'message.sent',
              kind: 'delegation',
              senderId: agent.id,
              recipientId: target.id,
              label: `Bridge → @${route.targetRoleCode}`,
              description: route.message,
            })
            updateAgent(target.id, (current) => ({
              ...current,
              messages: [
                ...current.messages,
                { id: uid(), role: 'agent', from: agent.name, text: route.message },
              ],
            }))
            void sendMessage(target, route.message, true, {
              forceDirectChat: true,
              handoffDepth: 1,
              replyToAgentId: agent.id,
            })
          }
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

      const isShortGreeting =
        text.length < 18 &&
        /^(hi|hello|hey|yo|chào|xin chào|alo|test|ping|ok|thanks|cảm ơn)[\s!.?]*$/i.test(text)

      if (
        !options?.forceDirectChat &&
        !delegated &&
        !isShortGreeting &&
        agentsRef.current.length > 1 &&
        autonomousAgentIds.includes(agent.id) &&
        activeProvider.apiKey
      ) {
        setDrafts((current) => ({ ...current, [agent.id]: '' }))
        setPendingApproval(null)
        await streamOrchestration(agent, text)
        return
      }

      const userMessage: Message = { id: uid(), role: 'user', text }
      setAiActivity('reading')
      if (!delegated) setDrafts((current) => ({ ...current, [agent.id]: '' }))
      const slashResolved = await resolveSlashContext(text)
      updateAgent(agent.id, (current) => ({
        ...current,
        status: 'running',
        messages: [
          ...current.messages,
          ...(delegated ? [] : [userMessage]),
          ...(slashResolved.badges.length
            ? [
                {
                  id: uid(),
                  role: 'tool' as const,
                  text: `Loaded via /: ${slashResolved.badges.join(' · ')}`,
                },
              ]
            : []),
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
      const compactContextFiles = selectCompactWorkspaceFiles(
        files,
        activeFile?.path,
        text,
        6,
        8_000,
        45_000,
      )
      const fileContextBlock = compactContextFiles.length
        ? compactContextFiles
            .map((file) => `--- ${file.path}\n${file.content}`)
            .join('\n\n')
        : 'No workspace files loaded.'

      const systemPrompt = [
        buildTeamCollaborationPrompt(agent, agentsRef.current, projectMemText),
        bridgeEnabled
          ? buildBridgeContextPrompt(agent, agentsRef.current, bridgeMessagesRef.current)
          : '',
        slashResolved.promptBlock,
        `Workspace (${projectName}) relevant files:\n${fileContextBlock}`,
      ]
        .filter(Boolean)
        .join('\n\n')

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ...activeProvider,
            model: agent.model || activeProvider.model,
            enableTools: true,
            workspaceRoot,
            messages: [
              { role: 'system', content: systemPrompt },
              ...agent.messages
                .filter((message) => message.role !== 'tool')
                .slice(-14)
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
          throw new Error(error.detail ? `${error.error} ${error.detail}` : error.error)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let result = ''
        let pending = ''
        let realUsage: ParsedChatChunk['usage']
        const toolActivityLines: string[] = []
        const queuedToolHandoffs: Array<{ toRole: string; message: string; files?: string[] }> = []

        const handleParsedChunk = (parsed: ParsedChatChunk) => {
          if (parsed.usage) realUsage = parsed.usage
          for (const ev of parsed.events) {
            if (ev.type === 'tool.call' && ev.name) {
              const targetHint =
                ev.args?.to_role || ev.args?.path || ev.args?.query || ev.args?.command || ''
              toolActivityLines.push(`> tool: ${ev.name}${targetHint ? `(${targetHint})` : ''}`)
              setAiActivity(ev.name === 'patch_file' ? 'editing' : 'reading')
            } else if (ev.type === 'file.updated' && ev.path && typeof ev.content === 'string') {
              onApplyDirectEdit?.({
                path: ev.path,
                content: ev.content,
                summary: ev.summary || `Tool patch ${ev.path}`,
                agent,
              })
            } else if (ev.type === 'agent.handoff' && ev.toRole && ev.message) {
              queuedToolHandoffs.push({
                toRole: ev.toRole,
                message: ev.message,
                files: ev.files,
              })
            }
          }
          if (parsed.text) result += parsed.text
          const liveDisplay = [
            toolActivityLines.length ? `${toolActivityLines.join('\n')}\n\n` : '',
            result,
          ].join('')
          updateAgent(agent.id, (current) => ({
            ...current,
            messages: current.messages.map((message) =>
              message.id === 'stream' ? { ...message, text: liveDisplay } : message,
            ),
          }))
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const frames = pending.split('\n\n')
          pending = frames.pop() ?? ''
          handleParsedChunk(parseSSEChunk(frames.join('\n\n')))
        }
        if (pending) handleParsedChunk(parseSSEChunk(pending))

        const promptTokens = realUsage?.promptTokens || estimateTokens(`${systemPrompt}\n${text}`)
        const completionTokens = realUsage?.completionTokens || estimateTokens(result)
        onRecordUsage({
          id: uid(),
          providerName: activeProvider.name,
          model: agent.model || activeProvider.model,
          agentName: agent.name,
          promptTokens,
          completionTokens,
          totalTokens: realUsage?.totalTokens || promptTokens + completionTokens,
          estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens),
          timestamp: new Date().toISOString(),
        })

        // 1. Parse and apply direct AI code edits (```edit:path/to/file or ```baton-patch)
        const extractedEdits = extractProposedPatches(result)
        const editMessages: Message[] = []
        const agentRoleId = agent.roleId ?? inferRoleId(`${agent.id} ${agent.role}`)

        for (const edit of extractedEdits) {
          const territory = validateTerritoryAccess(agentRoleId, edit.path)
          const existingFile = files.find((f) => f.path === edit.path)
          const patchId = `patch-${uid()}`
          let appliedStatus: 'applied' | 'pending' = 'pending'
          let appliedRev: string | undefined

          if (territory.allowed && appSettings.autoApplyTrusted && onApplyDirectEdit) {
            setAiActivity('editing')
            const outcome = onApplyDirectEdit({
              path: edit.path,
              content: edit.content,
              summary: edit.summary,
              agent,
            })
            if (outcome.applied) {
              appliedStatus = 'applied'
              appliedRev = outcome.revisionId
            }
          }

          setProposedPatches((current) => [
            {
              id: patchId,
              taskId: 'direct-chat',
              agentId: agent.id,
              agentName: agent.name,
              roleCode: agentRoleId === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[agentRoleId].code,
              path: edit.path,
              summary: edit.summary,
              originalContent: existingFile?.content ?? '',
              proposedContent: edit.content,
              baseHash: hashText(existingFile?.content ?? ''),
              territoryViolation: territory.allowed ? undefined : territory.reason,
              requiresApiContract: territory.requiresApiContract,
              status: appliedStatus,
              previousContent: existingFile?.content ?? null,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ])

          editMessages.push({
            id: uid(),
            role: 'tool',
            change: true,
            patchId,
            codeSnippet: edit.content.slice(0, 220),
            text:
              appliedStatus === 'applied'
                ? `Applied code edit to ${edit.path}${appliedRev ? ` (${appliedRev})` : ''} and saved to workspace.`
                : !territory.allowed
                  ? `Blocked by territory rule (${edit.path}): ${territory.reason}`
                  : `Proposed edit for ${edit.path} — open Diff Review to apply.`,
          })
        }

        updateAgent(agent.id, (current) => ({
          ...current,
          status: 'idle',
          messages: [
            ...current.messages.map((message) =>
              message.id === 'stream'
                ? {
                    ...message,
                    id: uid(),
                    text: result || 'The provider returned an empty response.',
                  }
                : message,
            ),
            ...editMessages,
          ],
        }))

        // 2. Two-way reply back to requesting teammate when answering a bridged delegation
        if (bridgeEnabled && options?.replyToAgentId && result) {
          const requester = agentsRef.current.find((a) => a.id === options.replyToAgentId)
          if (requester && requester.id !== agent.id) {
            const replyPreview = result.slice(0, 600)
            publishBridgeMessage({
              from: agent,
              to: requester,
              kind: extractedEdits.length > 0 ? 'code-share' : 'reply',
              content: replyPreview,
              relatedFiles: extractedEdits.map((e) => e.path),
            })
            appendCommunicationEvent({
              type: 'worker.response.completed',
              kind: extractedEdits.length > 0 ? 'code' : 'report',
              senderId: agent.id,
              recipientId: requester.id,
              label: `Reply from ${agent.name}`,
              codeSnippet: extractedEdits[0]?.content.slice(0, 120),
              description: replyPreview,
            })
            updateAgent(requester.id, (current) => ({
              ...current,
              messages: [
                ...current.messages,
                {
                  id: uid(),
                  role: 'agent',
                  from: agent.name,
                  text: replyPreview,
                  codeSnippet: extractedEdits[0]?.content.slice(0, 220),
                },
              ],
            }))
          }
        }

        // 3. Execute live inter-agent handoffs from BOTH native `message_agent` tool calls AND text routes
        const handoffDepth = options?.handoffDepth ?? 0
        if (bridgeEnabled && handoffDepth < 3 && (result || queuedToolHandoffs.length > 0)) {
          const textRoutes = result ? extractBridgeRoutes(result, agentsRef.current, agent.id) : []
          const mergedTargets = new Map<
            string,
            { target: Agent; message: string; kind: BridgeMessageKind; files?: string[] }
          >()

          for (const th of queuedToolHandoffs) {
            if (th.toRole.toUpperCase() === 'ALL' || th.toRole.toUpperCase() === 'TEAM') {
              for (const peer of agentsRef.current.filter((a) => a.id !== agent.id).slice(0, 4)) {
                mergedTargets.set(peer.id, {
                  target: peer,
                  message: th.message,
                  kind: 'broadcast',
                  files: th.files,
                })
              }
            } else {
              const target = resolveAgentByRoleOrName(th.toRole, agentsRef.current, agent.id)
              if (target) {
                mergedTargets.set(target.id, {
                  target,
                  message: th.message,
                  kind: 'handoff',
                  files: th.files,
                })
              }
            }
          }

          for (const route of textRoutes) {
            if (mergedTargets.has(route.targetAgentId)) continue
            const target = agentsRef.current.find((a) => a.id === route.targetAgentId)
            if (target) {
              mergedTargets.set(target.id, {
                target,
                message: route.message,
                kind: route.kind,
                files: extractedEdits.map((e) => e.path),
              })
            }
          }

          for (const { target, message: handoffMsg, kind, files: relatedFiles } of mergedTargets.values()) {
            animateCommanderTypeAndSend(
              agent.id,
              `@${target.name}: ${handoffMsg.slice(0, 110)}`,
              () => {
                publishBridgeMessage({
                  from: agent,
                  to: target,
                  kind,
                  content: handoffMsg,
                  relatedFiles,
                })
                appendCommunicationEvent({
                  type: 'message.sent',
                  kind: extractedEdits.length > 0 ? 'code' : 'delegation',
                  senderId: agent.id,
                  recipientId: target.id,
                  label: extractedEdits.length > 0 ? 'Code Handoff' : 'Bridge Handoff',
                  codeSnippet: extractedEdits[0]?.content.slice(0, 100),
                  description: handoffMsg,
                })
                updateAgent(target.id, (current) => ({
                  ...current,
                  messages: [
                    ...current.messages,
                    {
                      id: uid(),
                      role: 'agent',
                      from: agent.name,
                      text: handoffMsg,
                    },
                  ],
                }))
                void sendMessage(target, handoffMsg, true, {
                  forceDirectChat: true,
                  handoffDepth: handoffDepth + 1,
                  replyToAgentId: agent.id,
                })
              },
            )
          }
        }
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
      animateCommanderTypeAndSend,
      appSettings.autoApplyTrusted,
      appendCommunicationEvent,
      bridgeEnabled,
      drafts,
      files,
      memoryNotes,
      onApplyDirectEdit,
      onPromptRollback,
      onRecordUsage,
      projectName,
      publishBridgeMessage,
      resolveProviderForAgent,
      resolveSlashContext,
      setAiActivity,
      setDrafts,
      setPendingApproval,
      setProposedPatches,
      streamOrchestration,
      updateAgent,
      workspaceRoot,
    ],
  )

  const delegateAgent = useCallback(
    (sourceId: string, targetId: string, prompt: string) => {
      const source = agentsRef.current.find((agent) => agent.id === sourceId)
      const target = agentsRef.current.find((agent) => agent.id === targetId)
      const instruction = prompt.trim()
      if (!source || !target || !instruction || sourceId === targetId) return

      animateCommanderTypeAndSend(sourceId, `@${target.name}: ${instruction}`, () => {
        publishBridgeMessage({
          from: source,
          to: target,
          kind: 'handoff',
          content: instruction,
          relatedFiles: activeFile ? [activeFile.path] : undefined,
        })
        appendCommunicationEvent({
          type: 'message.sent',
          kind: 'direct',
          senderId: sourceId,
          recipientId: targetId,
          label: 'Bridge Direct',
          description: instruction,
        })
        updateAgent(sourceId, (current) => ({
          ...current,
          messages: [
            ...current.messages,
            {
              id: uid(),
              role: 'tool',
              text: `Bridge sent to ${target.name}: "${instruction}"`,
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
        void sendMessage(target, instruction, true, {
          forceDirectChat: true,
          handoffDepth: 1,
          replyToAgentId: source.id,
        })
      })
    },
    [
      activeFile,
      animateCommanderTypeAndSend,
      appendCommunicationEvent,
      publishBridgeMessage,
      sendMessage,
      updateAgent,
    ],
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
