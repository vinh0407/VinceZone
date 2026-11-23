'use client'

import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  FileCode2,
  GitCompareArrows,
  GripVertical,
  History,
  LayoutGrid,
  Mail,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  PanelTopClose,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  TerminalSquare,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentMailOverlay } from './agent-mail-overlay'
import type {
  Agent,
  AgentLayout,
  AgentTask,
  AgentView,
  AgentWorkspaceState,
  CommunicationEvent,
  PendingApprovalPlan,
  ProposedPatch,
  WorkspaceFile,
} from './agent-types'

const defaultWorkspace: AgentWorkspaceState = {
  layout: 'focus1',
  order: [],
  minimized: [],
}

export function AgentWorkspace({
  agents,
  views,
  drafts,
  files,
  tasks,
  communicationEvents,
  proposedPatches,
  pendingApproval,
  onCreate,
  onView,
  onDraft,
  onSend,
  onRemove,
  onDuplicate,
  onDelegate,
  onPause,
  onDiff,
  onApprovePlan,
  onCancelApproval,
  onPreviewMailExchange,
}: {
  agents: Agent[]
  views: Record<string, AgentView>
  drafts: Record<string, string>
  files: WorkspaceFile[]
  tasks: AgentTask[]
  communicationEvents: CommunicationEvent[]
  proposedPatches: ProposedPatch[]
  pendingApproval: PendingApprovalPlan | null
  onCreate: () => void
  onView: (id: string, view: AgentView) => void
  onDraft: (id: string, value: string) => void
  onSend: (agent: Agent) => void
  onRemove: (id: string) => void
  onDuplicate: (agent: Agent) => void
  onDelegate: (sourceId: string, targetId: string, prompt: string) => void
  onPause: (agent: Agent) => void
  onDiff: (patchId?: string) => void
  onApprovePlan: (selectedTaskIds: string[]) => void
  onCancelApproval: () => void
  onPreviewMailExchange: (layout: AgentLayout, orderedAgentIds: string[]) => void
}) {
  const [workspace, setWorkspace] = useState<AgentWorkspaceState>(defaultWorkspace)
  const [draggedId, setDraggedId] = useState('')
  const [mailLogOpen, setMailLogOpen] = useState(false)
  const [replayTrigger, setReplayTrigger] = useState(0)
  const [flightActivity, setFlightActivity] = useState<{
    sendingIds: string[]
    arrivedIds: string[]
  }>({ sendingIds: [], arrivedIds: [] })
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([])
  const gridHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pendingApproval) {
      setSelectedApprovalIds(pendingApproval.tasks.map((task) => task.id))
    } else {
      setSelectedApprovalIds([])
    }
  }, [pendingApproval])

  useEffect(() => {
    const saved = window.localStorage.getItem('baton-agent-layout')
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as AgentWorkspaceState & { layout?: string }
      setWorkspace({
        ...defaultWorkspace,
        ...parsed,
        layout:
          parsed.layout === 'equal' || parsed.layout === 'focus2' || parsed.layout === 'focus1'
            ? parsed.layout
            : defaultWorkspace.layout,
      })
    } catch {
      window.localStorage.removeItem('baton-agent-layout')
    }
  }, [])

  useEffect(() => {
    setWorkspace((current) => ({
      ...current,
      order: [
        ...current.order.filter((id) => agents.some((agent) => agent.id === id)),
        ...agents.map((agent) => agent.id).filter((id) => !current.order.includes(id)),
      ],
      minimized: current.minimized.filter((id) => agents.some((agent) => agent.id === id)),
    }))
  }, [agents])

  useEffect(() => {
    window.localStorage.setItem('baton-agent-layout', JSON.stringify(workspace))
  }, [workspace])

  const orderedAgents = useMemo(
    () =>
      workspace.order
        .map((id) => agents.find((agent) => agent.id === id))
        .filter((agent): agent is Agent => Boolean(agent)),
    [agents, workspace.order],
  )
  const visibleAgents = orderedAgents.filter((agent) => !workspace.minimized.includes(agent.id))

  const setLayout = (layout: AgentLayout) =>
    setWorkspace((current) => ({
      ...current,
      layout,
      mainAgentId:
        layout === 'focus1' ? current.mainAgentId || orderedAgents[0]?.id : current.mainAgentId,
    }))
  const mainAgent =
    visibleAgents.find((agent) => agent.id === workspace.mainAgentId) ?? visibleAgents[0]
  const agentsWithMainFirst = mainAgent
    ? [mainAgent, ...visibleAgents.filter((agent) => agent.id !== mainAgent.id)]
    : visibleAgents
  const layoutCapacity = workspace.layout === 'focus1' ? 7 : 6
  const layoutAgents = agentsWithMainFirst.slice(0, layoutCapacity)
  const overflowAgents = agentsWithMainFirst.slice(layoutCapacity)
  const pendingPatchCount = proposedPatches.filter((patch) => patch.status === 'pending').length

  const swapPanels = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return
    setWorkspace((current) => {
      const order = [...current.order]
      const source = order.indexOf(draggedId)
      const target = order.indexOf(targetId)
      if (source < 0 || target < 0) return current
      ;[order[source], order[target]] = [order[target], order[source]]
      return { ...current, order }
    })
    setDraggedId('')
  }

  const renderAgentPanel = (agent: Agent) => (
    <AgentPanel
      key={agent.id}
      agent={agent}
      topologyRole={
        workspace.layout === 'equal'
          ? 'Peer'
          : workspace.layout === 'focus2'
            ? agentsWithMainFirst.indexOf(agent) < 2
              ? 'Planner'
              : 'Worker'
            : agentsWithMainFirst.indexOf(agent) === 0
              ? 'Coordinator'
              : 'Worker'
      }
      isSendingMail={flightActivity.sendingIds.includes(agent.id)}
      justReceivedMail={flightActivity.arrivedIds.includes(agent.id)}
      layoutClass=""
      files={files}
      peers={agents.filter((peer) => peer.id !== agent.id)}
      view={views[agent.id] ?? 'chat'}
      draft={drafts[agent.id] ?? ''}
      onDragStart={() => setDraggedId(agent.id)}
      onDrop={() => swapPanels(agent.id)}
      onView={(view) => onView(agent.id, view)}
      onDraft={(value) => onDraft(agent.id, value)}
      onSend={() => onSend(agent)}
      onClose={() => onRemove(agent.id)}
      onDuplicate={() => onDuplicate(agent)}
      onDelegate={(targetId, prompt) => onDelegate(agent.id, targetId, prompt)}
      onPause={() => onPause(agent)}
      onDiff={onDiff}
      onMinimize={() =>
        setWorkspace((current) => ({
          ...current,
          minimized: [...new Set([...current.minimized, agent.id])],
        }))
      }
      onPromote={() =>
        setWorkspace((current) => ({
          ...current,
          layout: 'focus1',
          mainAgentId: agent.id,
        }))
      }
    />
  )

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#181818] px-4 py-1.5">
        <div className="flex items-center gap-2">
          <LayoutGrid size={14} className="text-[#d4d4d4]" />
          <span className="text-[12px] font-semibold text-white">
            VinceZone Multi-Agent Control Center
          </span>
          <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[10px] text-[#a3a3a3]">
            {agents.length}/7
          </span>
          {tasks.length > 0 && (
            <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
              {tasks.filter((task) => task.status === 'completed').length}/{tasks.length} tasks
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (communicationEvents.some((event) => event.recipientId)) {
                setReplayTrigger((count) => count + 1)
              } else {
                onPreviewMailExchange(
                  workspace.layout,
                  agentsWithMainFirst.map((agent) => agent.id),
                )
              }
            }}
            disabled={agents.length < 2}
            className="flex items-center gap-1.5 rounded border border-[#454545] bg-[#262626] px-2.5 py-1 text-[11px] text-[#e5e5e5] hover:bg-[#333333] disabled:opacity-30"
            title="Animate VinceZone agent mail exchange across the active topology"
          >
            {communicationEvents.some((event) => event.recipientId) ? (
              <>
                <RotateCcw size={11} /> Replay mail
              </>
            ) : (
              <>
                <Mail size={11} /> Preview mail flow
              </>
            )}
          </button>
          <button
            onClick={() => setMailLogOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] ${
              mailLogOpen
                ? 'border-[#737373] bg-[#2f2f2f] text-white'
                : 'border-[#333333] bg-[#222222] text-[#cccccc] hover:text-white'
            }`}
          >
            <History size={11} /> Mail log ({communicationEvents.length})
          </button>
          {pendingPatchCount > 0 && (
            <button
              onClick={() => onDiff()}
              className="flex items-center gap-1.5 rounded border border-[#525252] bg-[#2a2a2a] px-2.5 py-1 text-[11px] text-[#f0f0f0] hover:bg-[#383838]"
            >
              <GitCompareArrows size={11} /> Diff ({pendingPatchCount})
            </button>
          )}
          <SegmentedControl
            value={workspace.layout}
            onChange={(value) => setLayout(value as AgentLayout)}
            items={[
              { id: 'equal', label: '3:3 Peer' },
              { id: 'focus2', label: '2:4 Plan' },
              { id: 'focus1', label: '1:6 PM' },
            ]}
          />
          <button
            onClick={onCreate}
            disabled={agents.length >= 7}
            className="flex items-center gap-1.5 rounded bg-[#e5e5e5] px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-white disabled:opacity-30"
          >
            <MessageSquarePlus size={12} /> New agent
          </button>
        </div>
      </div>

      {pendingApproval && pendingApproval.tasks.length > 0 && (
        <div className="shrink-0 border-b border-amber-400/20 bg-amber-400/[0.06] px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-amber-200">
              <ShieldAlert size={14} className="text-amber-400" />
              <span className="font-semibold">Approval required before worker calls</span>
              <span className="text-[10px] text-amber-200/70">
                Select tasks to execute ({selectedApprovalIds.length}/{pendingApproval.tasks.length}
                )
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCancelApproval}
                className="rounded-md border border-white/10 px-2.5 py-1 text-[10px] text-zinc-400 hover:bg-white/5"
              >
                Cancel plan
              </button>
              <button
                onClick={() => onApprovePlan(selectedApprovalIds)}
                disabled={selectedApprovalIds.length === 0}
                className="flex items-center gap-1.5 rounded-md bg-lime-400 px-3 py-1 text-[10px] font-semibold text-black hover:bg-lime-300 disabled:opacity-30"
              >
                <Check size={11} /> Approve &amp; Execute
              </button>
            </div>
          </div>
          <div className="mt-2 grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
            {pendingApproval.tasks.map((task) => {
              const checked = selectedApprovalIds.includes(task.id)
              const assignee = agents.find((agent) => agent.id === task.assigneeId)
              return (
                <label
                  key={task.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-[10px] ${
                    checked
                      ? 'border-lime-400/30 bg-black/30 text-zinc-200'
                      : 'border-white/[0.07] bg-black/20 text-zinc-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedApprovalIds((current) =>
                        current.includes(task.id)
                          ? current.filter((id) => id !== task.id)
                          : [...current, task.id],
                      )
                    }
                    className="mt-0.5 accent-lime-400"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{task.title}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-zinc-500">
                      → {assignee?.name || task.assigneeId}
                      {task.relevantFiles.length > 0 ? ` · ${task.relevantFiles.join(', ')}` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {mailLogOpen && (
        <div className="max-h-36 shrink-0 overflow-y-auto border-b border-white/[0.07] bg-[#070707] px-4 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-wider text-zinc-500">
            <span>Agent Mail Exchange Timeline</span>
            <span>Violet: Delegation · Sky: Peer · Lime: Report</span>
          </div>
          {communicationEvents.length === 0 ? (
            <p className="text-[10px] text-zinc-600">No inter-agent messages recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {[...communicationEvents]
                .reverse()
                .slice(0, 20)
                .map((event) => {
                  const sender = agents.find((a) => a.id === event.senderId)?.name || event.senderId
                  const recipient =
                    agents.find((a) => a.id === event.recipientId)?.name || event.recipientId
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-2 rounded border border-white/[0.05] bg-white/[0.02] px-2 py-1 text-[10px]"
                    >
                      <Mail
                        size={10}
                        className={
                          event.kind === 'report'
                            ? 'text-lime-400'
                            : event.kind === 'peer'
                              ? 'text-sky-400'
                              : 'text-violet-400'
                        }
                      />
                      <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                        {event.timestamp.slice(11, 19)}
                      </span>
                      <span className="shrink-0 text-zinc-300">
                        {sender} → {recipient}
                      </span>
                      <span className="truncate text-zinc-500">{event.description}</span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      <div ref={gridHostRef} className="relative flex min-h-0 flex-1 flex-col">
        <AgentMailOverlay
          containerRef={gridHostRef}
          agents={agents}
          events={communicationEvents}
          replayTrigger={replayTrigger}
          onFlightActivity={setFlightActivity}
        />

        {(workspace.minimized.length > 0 || overflowAgents.length > 0) && (
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/[0.06] bg-black/20 px-3">
            <span className="mr-1 text-[8px] uppercase tracking-widest text-zinc-700">
              {overflowAgents.length > 0 ? 'Outside this layout' : 'Minimized'}
            </span>
            {workspace.minimized.map((id) => {
              const agent = agents.find((item) => item.id === id)
              if (!agent) return null
              return (
                <button
                  key={id}
                  data-agent-chip={agent.id}
                  onClick={() =>
                    setWorkspace((current) => ({
                      ...current,
                      minimized: current.minimized.filter((item) => item !== id),
                    }))
                  }
                  className="flex items-center gap-1 rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] text-zinc-500 hover:text-zinc-200"
                >
                  <ChevronDown size={9} /> {agent.name}
                </button>
              )
            })}
            {overflowAgents.map((agent) => (
              <button
                key={agent.id}
                data-agent-chip={agent.id}
                onClick={() =>
                  setWorkspace((current) => ({
                    ...current,
                    layout: 'focus1',
                    mainAgentId: agent.id,
                  }))
                }
                className="flex items-center gap-1 rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[9px] text-zinc-500 hover:text-zinc-200"
              >
                <Maximize2 size={9} /> {agent.name}
              </button>
            ))}
          </div>
        )}

        {agents.length === 0 ? (
          <EmptyAgents onCreate={onCreate} />
        ) : workspace.layout === 'equal' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-white/[0.08] md:grid-cols-3 md:grid-rows-2">
            {layoutAgents.map(renderAgentPanel)}
          </div>
        ) : workspace.layout === 'focus2' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-white/[0.08] md:grid-cols-2">
            <div className="grid min-h-0 grid-rows-2 gap-px bg-white/[0.08]">
              {layoutAgents.slice(0, 2).map(renderAgentPanel)}
            </div>
            <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-px bg-white/[0.08]">
              {layoutAgents.slice(2, 6).map(renderAgentPanel)}
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-white/[0.08] md:grid-cols-2">
            <div className="min-h-0">{layoutAgents[0] && renderAgentPanel(layoutAgents[0])}</div>
            <div className="grid min-h-0 grid-cols-3 grid-rows-2 gap-px bg-white/[0.08]">
              {layoutAgents.slice(1, 7).map(renderAgentPanel)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function SegmentedControl({
  value,
  items,
  onChange,
}: {
  value: string
  items: Array<{ id: string; label: string; icon?: typeof Bot }>
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center rounded-md border border-white/[0.07] bg-black/30 p-0.5">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] ${
              value === item.id ? 'bg-white/10 text-zinc-200' : 'text-zinc-600 hover:text-zinc-300'
            }`}
          >
            {Icon && <Icon size={10} />} {item.label}
          </button>
        )
      })}
    </div>
  )
}

function EmptyAgents({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid flex-1 place-items-center bg-[#101010]">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl border border-white/10 bg-white/[0.03]">
          <Bot size={22} className="text-zinc-500" />
        </div>
        <h2 className="text-sm font-semibold text-zinc-200">Build your agent team</h2>
        <p className="mt-2 text-[11px] leading-5 text-zinc-600">
          Add a coordinator and workers. Every status shown here is tied to a real provider event.
        </p>
        <button
          onClick={onCreate}
          className="mt-4 rounded-md bg-lime-400 px-3 py-2 text-[10px] font-semibold text-black"
        >
          Create first agent
        </button>
      </div>
    </div>
  )
}

function AgentPanel({
  agent,
  topologyRole,
  isSendingMail,
  justReceivedMail,
  layoutClass,
  files,
  peers,
  view,
  draft,
  onDragStart,
  onDrop,
  onView,
  onDraft,
  onSend,
  onClose,
  onDuplicate,
  onDelegate,
  onPause,
  onDiff,
  onMinimize,
  onPromote,
}: {
  agent: Agent
  topologyRole: 'Peer' | 'Planner' | 'Coordinator' | 'Worker'
  isSendingMail: boolean
  justReceivedMail: boolean
  layoutClass: string
  files: WorkspaceFile[]
  peers: Agent[]
  view: AgentView
  draft: string
  onDragStart: () => void
  onDrop: () => void
  onView: (view: AgentView) => void
  onDraft: (value: string) => void
  onSend: () => void
  onClose: () => void
  onDuplicate: () => void
  onDelegate: (targetId: string, prompt: string) => void
  onPause: () => void
  onDiff: (patchId?: string) => void
  onMinimize: () => void
  onPromote: () => void
}) {
  const [delegationOpen, setDelegationOpen] = useState(false)
  const [contextPickerOpen, setContextPickerOpen] = useState(false)
  const [delegateTarget, setDelegateTarget] = useState(peers[0]?.id ?? '')
  const [delegatePrompt, setDelegatePrompt] = useState('')
  useEffect(() => {
    if (!peers.some((peer) => peer.id === delegateTarget)) setDelegateTarget(peers[0]?.id ?? '')
  }, [delegateTarget, peers])

  return (
    <article
      data-agent-panel={agent.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`agent-chat-panel relative flex h-full min-h-[240px] min-w-0 flex-col bg-[#1e1e1e] transition-shadow ${layoutClass} ${
        agent.status === 'running' || agent.status === 'reviewing' ? 'agent-panel-running' : ''
      } ${isSendingMail ? 'mail-panel-sending' : ''} ${justReceivedMail ? 'mail-panel-arrived' : ''}`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <GripVertical size={12} className="text-[#6e6e6e]" />
          <div className="relative grid size-7 shrink-0 place-items-center rounded bg-[#252526]">
            {agent.id === 'pm' || agent.id === 'orchestrator' ? (
              <Sparkles size={14} style={{ color: agent.accent }} />
            ) : (
              <Bot size={14} style={{ color: agent.accent }} />
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-[#181818]"
              style={{ background: agent.status === 'blocked' ? '#f48771' : agent.accent }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[11px] font-semibold text-white">{agent.name}</h2>
              {agent.roleId && agent.roleId !== 'custom' && (
                <span className="rounded bg-[#262626] px-1 py-0.5 font-mono text-[8px] uppercase text-[#d4d4d4]">
                  @{agent.roleId}
                </span>
              )}
              {topologyRole !== 'Worker' && (
                <span className="rounded bg-[#333333] px-1 py-0.5 text-[7px] uppercase text-[#e5e5e5]">
                  {topologyRole}
                </span>
              )}
            </div>
            <p className="truncate text-[9px] text-[#858585]">{agent.currentTask || agent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className="agent-panel-optional mini-button"
            title="Promote to main panel"
            onClick={onPromote}
          >
            <Maximize2 size={11} />
          </button>
          <button
            className="agent-panel-optional mini-button"
            title={agent.status === 'paused' ? 'Resume' : 'Pause or stop'}
            onClick={onPause}
          >
            {agent.status === 'paused' ? <Play size={11} /> : <Pause size={11} />}
          </button>
          <button
            className="agent-panel-optional mini-button"
            title="Duplicate agent"
            onClick={onDuplicate}
          >
            <Copy size={11} />
          </button>
          <button className="mini-button" title="Minimize" onClick={onMinimize}>
            <PanelTopClose size={12} />
          </button>
          <button className="mini-button" title="Close" onClick={onClose}>
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-1.5 text-[9px] text-zinc-500">
        <span className="capitalize">{agent.status}</span>
        {isSendingMail && (
          <span className="flex items-center gap-0.5 rounded bg-[#333333] px-1.5 py-0.5 text-[8px] uppercase text-[#f5f5f5]">
            <Mail size={8} /> Sending
          </span>
        )}
        {justReceivedMail && (
          <span className="flex items-center gap-0.5 rounded bg-[#e5e5e5] px-1.5 py-0.5 text-[8px] font-medium uppercase text-[#111111]">
            <Mail size={8} /> Received
          </span>
        )}
        <span className="ml-auto max-w-[45%] truncate rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-zinc-500">
          {agent.model}
        </span>
        <button
          onClick={() => onView('chat')}
          title="Chat view"
          className={view === 'chat' ? 'text-zinc-200' : ''}
        >
          <MessageSquare size={10} />
        </button>
        <button
          onClick={() => onView('terminal')}
          title="Terminal view"
          className={view === 'terminal' ? 'text-zinc-200' : ''}
        >
          <TerminalSquare size={10} />
        </button>
      </div>
      {(agent.status === 'running' || agent.status === 'reviewing') && (
        <div className="relative flex h-7 shrink-0 items-center gap-2 overflow-hidden border-b border-lime-400/[0.08] bg-lime-400/[0.025] px-3 text-[9px] text-lime-300/70">
          <span className="agent-orbit size-1.5 rounded-full bg-lime-400" />
          {agent.status === 'reviewing' ? 'Reviewing worker reports' : 'Runtime response active'}
          <span className="agent-progress absolute inset-x-0 bottom-0 h-px bg-lime-400/70" />
        </div>
      )}
      {view === 'chat' ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {agent.messages.map((message) =>
            message.role === 'tool' ? (
              <div
                key={message.id}
                className="rounded-md border border-white/[0.06] bg-white/[0.025] p-2"
              >
                <div className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-500">
                  <TerminalSquare size={11} /> Runtime event
                  <Check size={10} className="ml-auto text-lime-400" />
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-zinc-500">{message.text}</p>
                {message.change && (
                  <button
                    onClick={() => onDiff(message.patchId)}
                    className="mt-2 flex w-full items-center justify-between rounded border border-sky-400/15 bg-sky-400/[0.05] px-2 py-1.5 text-[9px] text-sky-300 hover:bg-sky-400/10"
                  >
                    <span className="flex items-center gap-1.5">
                      <GitCompareArrows size={11} /> Review proposed changes
                    </span>
                    <span>Diff</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[94%] whitespace-pre-wrap rounded-lg px-2.5 py-2 text-[10px] leading-[1.55] ${
                    message.role === 'user'
                      ? 'bg-white/[0.07] text-zinc-300'
                      : message.role === 'agent'
                        ? 'border border-violet-400/20 bg-violet-400/[0.05] text-zinc-300'
                        : 'border border-white/[0.055] bg-[#0d0d0d] text-zinc-400'
                  }`}
                >
                  {message.role === 'agent' && (
                    <div className="mb-1 flex items-center gap-1 text-[8px] uppercase tracking-wider text-violet-300/80">
                      <Mail size={9} />
                      <span>
                        {message.from} → {agent.name}
                      </span>
                    </div>
                  )}
                  {message.text || <span className="streaming-dots">Generating</span>}
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        <AgentTerminal agent={agent} />
      )}
      <div className="shrink-0 border-t border-white/[0.06] p-2.5">
        <div className="rounded-lg border border-white/[0.09] bg-white/[0.025] focus-within:border-zinc-600">
          {contextPickerOpen && (
            <div className="max-h-32 overflow-y-auto border-b border-white/[0.07] bg-[#121212] p-1.5">
              <div className="mb-1 flex items-center justify-between px-1 text-[8px] uppercase tracking-wider text-zinc-500">
                <span>Attach file reference</span>
                <button onClick={() => setContextPickerOpen(false)}>
                  <X size={10} />
                </button>
              </div>
              {files.map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    const spacer = draft && !draft.endsWith(' ') ? ' ' : ''
                    onDraft(`${draft}${spacer}@${file.path} `)
                    setContextPickerOpen(false)
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[9px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <FileCode2 size={10} className="shrink-0 text-sky-400" />
                  <span className="truncate font-mono">{file.path}</span>
                </button>
              ))}
            </div>
          )}
          {delegationOpen && (
            <div className="border-b border-violet-400/10 bg-violet-400/[0.035] p-2">
              <div className="mb-1.5 flex items-center gap-1 text-[8px] uppercase tracking-wider text-violet-300/70">
                <Mail size={9} /> Send direct mail from {agent.name}
              </div>
              <div className="flex gap-1.5">
                <select
                  value={delegateTarget}
                  onChange={(event) => setDelegateTarget(event.target.value)}
                  className="w-28 rounded border border-white/10 bg-[#151515] px-1.5 text-[9px] text-zinc-400"
                >
                  {peers.map((peer) => (
                    <option key={peer.id} value={peer.id}>
                      {peer.name}
                    </option>
                  ))}
                </select>
                <input
                  value={delegatePrompt}
                  onChange={(event) => setDelegatePrompt(event.target.value)}
                  placeholder="Task and expected output…"
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[9px] text-zinc-300 outline-none"
                />
                <button
                  onClick={() => {
                    onDelegate(delegateTarget, delegatePrompt)
                    setDelegatePrompt('')
                    setDelegationOpen(false)
                  }}
                  disabled={!delegatePrompt.trim() || !delegateTarget}
                  className="grid size-6 place-items-center rounded bg-violet-400 text-black disabled:opacity-20"
                >
                  <Send size={10} />
                </button>
              </div>
            </div>
          )}
          <textarea
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
            rows={2}
            placeholder={`Message ${agent.name}…`}
            className="w-full resize-none bg-transparent px-2.5 pt-2 text-[10px] leading-4 text-zinc-300 outline-none placeholder:text-zinc-700"
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex gap-1">
              <button
                className={`mini-button ${contextPickerOpen ? 'bg-sky-400/15 text-sky-300' : 'text-zinc-600'}`}
                title="Attach project file reference"
                onClick={() => {
                  setContextPickerOpen((prev) => !prev)
                  setDelegationOpen(false)
                }}
              >
                <Plus size={11} />
              </button>
              <button
                className={`mini-button ${delegationOpen ? 'bg-violet-400/10 text-violet-300' : 'text-zinc-600'}`}
                title="Send direct mail / delegation"
                disabled={peers.length === 0}
                onClick={() => {
                  setDelegationOpen((current) => !current)
                  setContextPickerOpen(false)
                }}
              >
                <Mail size={11} />
              </button>
            </div>
            {agent.status === 'running' || agent.status === 'reviewing' ? (
              <button
                onClick={onPause}
                className="grid size-5 place-items-center rounded bg-zinc-700"
              >
                <Square size={9} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!draft.trim()}
                className="grid size-5 place-items-center rounded bg-[#e5e5e5] text-[#111111] hover:bg-white disabled:opacity-20"
              >
                <Send size={10} />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function AgentTerminal({ agent }: { agent: Agent }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#080a08] p-3 font-mono text-[10px] leading-[1.65] text-zinc-500">
      <p className="text-zinc-700">Baton Runtime · session {agent.id.slice(0, 8)}</p>
      <p>
        <span className="text-lime-400">●</span> provider session · {agent.status}
      </p>
      <p>
        <span className="text-sky-400">model</span> {agent.model}
      </p>
      <div className="my-3 border-t border-dashed border-white/10" />
      {agent.messages.map((message) => (
        <div key={message.id} className="mb-3">
          <p className="text-[9px] uppercase tracking-wider text-zinc-700">{message.role}</p>
          <p className="whitespace-pre-wrap">{message.text || 'runtime event active...'}</p>
        </div>
      ))}
      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
        <span className="text-lime-400">›</span>
        <span className="terminal-cursor" />
      </div>
    </div>
  )
}
