'use client'

import { useCallback, useRef } from 'react'
import type {
  Agent,
  AgentLayout,
  AgentTask,
  AppSettings,
  CommunicationEvent,
  MailKind,
  Message,
  PendingApprovalPlan,
  ProposedPatch,
  ProviderConfig,
  RuntimeEvent,
  WorkspaceFile,
} from '@/components/ide/agent-types'
import { uid } from '@/components/ide/workspace-defaults'
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
  onPromptRollback,
}: {
  agents: Agent[]
  files: WorkspaceFile[]
  activeFile?: WorkspaceFile
  projectName: string
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
  onPromptRollback?: (prompt: string) => { restored: boolean; message: string } | null
}) {
  const aborters = useRef<Record<string, AbortController>>({})
  const agentsRef = useRef(agents)
  agentsRef.current = agents

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
              text: `Proposed edit for ${patch.path}: ${patch.summary}`,
            },
          ],
        }))
        return
      }
      if (event.type === 'message.sent' && event.senderId && event.recipientId) {
        const sender = agentsRef.current.find((agent) => agent.id === event.senderId)
        const isPlanningExchange = Boolean(event.taskId?.startsWith('PLAN-'))
        const isTerritoryAlert = Boolean(event.taskId?.startsWith('TERRITORY-'))
        const kind: MailKind = isTerritoryAlert
          ? 'conflict'
          : isPlanningExchange
            ? 'peer'
            : 'delegation'
        appendCommunicationEvent({
          type: event.type,
          kind,
          timestamp: event.timestamp,
          senderId: event.senderId,
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
        updateAgent(event.recipientId, (current) => ({
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
            {
              id: uid(),
              role: 'tool',
              text: 'Task graph generated and delegation policy applied.',
            },
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
          messages: [
            ...current.messages,
            { id: uid(), role: 'assistant', text: event.result || '' },
          ],
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
    [appendCommunicationEvent, setAgentTasks, setPendingApproval, setProposedPatches, updateAgent],
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
            provider: savedProvider,
            coordinatorId: coordinator.id,
            agents: agentsRef.current.map(({ id, name, role, model }) => ({
              id,
              name,
              role,
              model,
            })),
            instruction,
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
            // Skip malformed SSE frame without crashing the entire session.
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const frames = pending.split('\n\n')
          pending = frames.pop() ?? ''
          for (const frame of frames) {
            dispatchFrame(frame)
          }
        }
        if (pending.trim()) {
          dispatchFrame(pending)
        }
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
      projectName,
      savedProvider,
      setAiActivity,
      updateAgent,
    ],
  )

  const sendMessage = useCallback(
    async (agent: Agent, delegatedText?: string, delegated = false) => {
      const text = delegatedText?.trim() || drafts[agent.id]?.trim()
      if (!text) return

      // Support VinceZone natural-language rollback prompts (e.g. "rollback REV-001", "revert page.tsx")
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

      const topology = readSavedTopology(agentsRef.current)
      const autonomousAgentIds =
        topology.mode === 'peer'
          ? topology.orderedAgentIds.slice(0, 6)
          : topology.mode === 'dual-coordinator'
            ? topology.orderedAgentIds.slice(0, 2)
            : topology.orderedAgentIds.slice(0, 1)

      if (!delegated && autonomousAgentIds.includes(agent.id) && savedProvider.apiKey) {
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

      if (!savedProvider.apiKey) {
        updateAgent(agent.id, (current) => ({
          ...current,
          status: 'idle',
          messages: current.messages.map((message) =>
            message.id === 'stream'
              ? {
                  ...message,
                  id: uid(),
                  text: `Provider is not connected. Open Settings → Providers to add a session-only API key for ${savedProvider.name}. No runtime request was started.`,
                }
              : message,
          ),
        }))
        setAiActivity('idle')
        return
      }

      const controller = new AbortController()
      aborters.current[agent.id] = controller
      try {
        const activeContext = activeFile
          ? `The active file is ${activeFile.path}:\n${activeFile.content.slice(0, 12000)}`
          : 'No file is currently open in the editor.'
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ...savedProvider,
            model: agent.model || savedProvider.model,
            messages: [
              {
                role: 'system',
                content: `You are ${agent.name}, ${agent.role}. Be concise. ${activeContext}`,
              },
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
        updateAgent(agent.id, (current) => ({
          ...current,
          status: 'idle',
          messages: current.messages.map((message) =>
            message.id === 'stream'
              ? {
                  ...message,
                  id: uid(),
                  text: result || 'The provider returned an empty response.',
                }
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
      onPromptRollback,
      savedProvider,
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

      appendCommunicationEvent({
        type: 'message.sent',
        kind: 'direct',
        senderId: sourceId,
        recipientId: targetId,
        label: 'Direct mail',
        description: instruction,
      })
      updateAgent(sourceId, (current) => ({
        ...current,
        messages: [
          ...current.messages,
          {
            id: uid(),
            role: 'tool',
            text: `Mail delivered to ${target.name}. Runtime invocation started.`,
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
    },
    [appendCommunicationEvent, sendMessage, updateAgent],
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
    (layout: AgentLayout, orderedAgentIds: string[]) => {
      if (orderedAgentIds.length < 2) return
      const [first, second, ...rest] = orderedAgentIds

      if (layout === 'equal') {
        // Peer-to-peer ring mail preview
        orderedAgentIds.forEach((senderId, index) => {
          const recipientId = orderedAgentIds[(index + 1) % orderedAgentIds.length]
          appendCommunicationEvent({
            type: 'message.sent',
            kind: 'peer',
            senderId,
            recipientId,
            label: 'Peer proposal',
            description: 'Preview: peer proposal exchange across 3:3 room.',
          })
        })
        return
      }

      if (layout === 'focus2' && second) {
        appendCommunicationEvent({
          type: 'message.sent',
          kind: 'peer',
          senderId: first,
          recipientId: second,
          label: 'Plan sync',
          description: 'Preview: planner alignment between dual coordinators.',
        })
        rest.slice(0, 4).forEach((workerId, idx) => {
          appendCommunicationEvent({
            type: 'message.sent',
            kind: 'delegation',
            senderId: idx % 2 === 0 ? first : second,
            recipientId: workerId,
            label: `TASK-${idx + 1}`,
            description: 'Preview: task mail assigned to worker.',
          })
        })
        return
      }

      // 1:6 coordinator -> workers, then worker report return
      const targets = orderedAgentIds.slice(1, 7)
      targets.forEach((workerId, idx) => {
        appendCommunicationEvent({
          type: 'message.sent',
          kind: 'delegation',
          senderId: first,
          recipientId: workerId,
          label: `TASK-${idx + 1}`,
          description: 'Preview: coordinator delegating structured task.',
        })
      })
      window.setTimeout(() => {
        targets.forEach((workerId, idx) => {
          appendCommunicationEvent({
            type: 'worker.response.completed',
            kind: 'report',
            senderId: workerId,
            recipientId: first,
            label: `Report #${idx + 1}`,
            description: 'Preview: worker delivering completed report to coordinator.',
          })
        })
      }, 950)
    },
    [appendCommunicationEvent],
  )

  return {
    sendMessage,
    streamOrchestration,
    delegateAgent,
    pauseAgent,
    previewMailExchange,
  }
}
