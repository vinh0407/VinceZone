'use client'

import {
  Bot,
  Check,
  ChevronDown,
  Code2,
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
  Pencil,
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
import { computeAgentGridPlan } from '@/lib/agent-layout'
import { AgentMailOverlay } from './agent-mail-overlay'
import { ChatContextMenu } from './chat-context-menu'
import { HighlightedChatText, HighlightedChatTextarea } from './highlighted-chat-input'
import type {
  Agent,
  AgentLayout,
  AgentTask,
  AgentView,
  AgentWorkspaceState,
  CommunicationEvent,
  McpServerConfig,
  PendingApprovalPlan,
  PluginConfig,
  ProposedPatch,
  ProviderConfig,
  WorkspaceFile,
} from './agent-types'
import {
  applySlashSelection,
  buildSlashCommands,
  extractActiveSlashQuery,
  SlashCommandPopover,
  type SkillComboItem,
  type SkillIndexItem,
} from './slash-command-popover'

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
  skills,
  combos = [],
  mcpServers,
  plugins,
  providers = [],
  onCreate,
  onEditAgent,
  onChangeAgentModel,
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
  skills: SkillIndexItem[]
  combos?: SkillComboItem[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  providers?: ProviderConfig[]
  onCreate: () => void
  onEditAgent: (agent: Agent) => void
  onChangeAgentModel?: (agentId: string, providerId: string, model: string) => void
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

  const gridPlan = computeAgentGridPlan(agentsWithMainFirst.length, workspace.layout)
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

  const renderAgentPanel = (agent: Agent, index: number) => (
    <AgentPanel
      key={agent.id}
      agent={agent}
      topologyRole={
        workspace.layout === 'equal'
          ? 'Peer'
          : gridPlan.kind === 'focus-split'
            ? index < gridPlan.leftCount
              ? gridPlan.leftCount === 2
                ? 'Planner'
                : 'Coordinator'
              : 'Worker'
            : index === 0
              ? 'Coordinator'
              : 'Worker'
      }
      isSendingMail={flightActivity.sendingIds.includes(agent.id)}
      justReceivedMail={flightActivity.arrivedIds.includes(agent.id)}
      files={files}
      skills={skills}
      combos={combos}
      mcpServers={mcpServers}
      plugins={plugins}
      providers={providers}
      peers={agents.filter((peer) => peer.id !== agent.id)}
      view={views[agent.id] ?? 'chat'}
      draft={drafts[agent.id] ?? ''}
      onDragStart={() => setDraggedId(agent.id)}
      onDrop={() => swapPanels(agent.id)}
      onEdit={() => onEditAgent(agent)}
      onChangeModel={(providerId, model) => onChangeAgentModel?.(agent.id, providerId, model)}
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
            {agents.length} agent{agents.length === 1 ? '' : 's'} · unlimited
          </span>
          {tasks.length > 0 && (
            <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
              {tasks.filter((task) => task.status === 'completed').length}/{tasks.length} tasks
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {communicationEvents.some((event) => event.recipientId) && (
            <button
              onClick={() => setReplayTrigger((count) => count + 1)}
              className="flex items-center gap-1 rounded border border-[#333333] bg-[#222222] px-2 py-1 text-[11px] text-[#cccccc] hover:text-white"
              title="Replay last mail flights"
            >
              <RotateCcw size={11} /> Replay
            </button>
          )}
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
            className="flex items-center gap-1.5 rounded bg-[#e5e5e5] px-3 py-1 text-[11px] font-medium text-[#111111] hover:bg-white"
          >
            <MessageSquarePlus size={12} /> New agent
          </button>
        </div>
      </div>

      {pendingApproval && pendingApproval.tasks.length > 0 && (
        <div className="shrink-0 border-b border-[#404040] bg-[#1c1c1c] px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-[#e5e5e5]">
              <ShieldAlert size={14} className="text-[#d4d4d4]" />
              <span className="font-semibold">Approval required before worker calls</span>
              <span className="text-[10px] text-[#a3a3a3]">
                Select tasks ({selectedApprovalIds.length}/{pendingApproval.tasks.length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCancelApproval}
                className="rounded border border-[#3c3c3c] px-2.5 py-1 text-[10px] text-[#cccccc] hover:bg-[#2a2a2a]"
              >
                Cancel plan
              </button>
              <button
                onClick={() => onApprovePlan(selectedApprovalIds)}
                disabled={selectedApprovalIds.length === 0}
                className="flex items-center gap-1.5 rounded bg-[#e5e5e5] px-3 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-30"
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
                  className={`flex cursor-pointer items-start gap-2 rounded border p-2 text-[10px] ${
                    checked
                      ? 'border-[#737373] bg-[#262626] text-white'
                      : 'border-[#2b2b2b] bg-[#161616] text-[#858585]'
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
                    className="mt-0.5 accent-[#e5e5e5]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{task.title}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-[#9a9a9a]">
                      → {assignee?.name || task.assigneeId}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
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

        {workspace.minimized.length > 0 && (
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-[#2b2b2b] bg-[#141414] px-3">
            <span className="mr-1 text-[9px] uppercase tracking-widest text-[#737373]">
              Minimized
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
                  className="flex items-center gap-1 rounded border border-[#333333] bg-[#222222] px-2 py-1 text-[10px] text-[#cccccc] hover:text-white"
                >
                  <ChevronDown size={10} /> {agent.name}
                </button>
              )
            })}
          </div>
        )}

        {agentsWithMainFirst.length === 0 ? (
          <EmptyAgents onCreate={onCreate} />
        ) : gridPlan.kind === 'single' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 bg-[#2b2b2b]">
            {renderAgentPanel(agentsWithMainFirst[0], 0)}
          </div>
        ) : gridPlan.kind === 'split-two' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-[#2b2b2b] md:grid-cols-2">
            {agentsWithMainFirst.map((agent, idx) => renderAgentPanel(agent, idx))}
          </div>
        ) : gridPlan.kind === 'equal-grid' ? (
          <div
            style={{
              gridTemplateColumns: `repeat(${gridPlan.cols}, minmax(0, 1fr))`,
              gridAutoRows:
                gridPlan.rows <= 2
                  ? `minmax(0, 1fr)`
                  : `minmax(280px, 1fr)`,
            }}
            className="grid min-h-0 flex-1 gap-px overflow-auto bg-[#2b2b2b]"
          >
            {agentsWithMainFirst.map((agent, idx) => renderAgentPanel(agent, idx))}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-[#2b2b2b] md:grid-cols-2">
            <div
              style={{
                gridTemplateRows: `repeat(${gridPlan.leftCount}, minmax(0, 1fr))`,
              }}
              className="grid min-h-0 gap-px bg-[#2b2b2b]"
            >
              {agentsWithMainFirst
                .slice(0, gridPlan.leftCount)
                .map((agent, idx) => renderAgentPanel(agent, idx))}
            </div>
            <div
              style={{
                gridTemplateColumns: `repeat(${gridPlan.rightCols}, minmax(0, 1fr))`,
                gridAutoRows: gridPlan.rightRows <= 3 ? `minmax(0, 1fr)` : `minmax(250px, 1fr)`,
              }}
              className="grid min-h-0 gap-px overflow-auto bg-[#2b2b2b]"
            >
              {agentsWithMainFirst
                .slice(gridPlan.leftCount)
                .map((agent, idx) => renderAgentPanel(agent, idx + gridPlan.leftCount))}
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
  items: Array<{ id: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center rounded border border-[#333333] bg-[#121212] p-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`rounded px-2 py-1 text-[10px] ${
            value === item.id ? 'bg-[#2f2f2f] text-white' : 'text-[#858585] hover:text-[#cccccc]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function EmptyAgents({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid flex-1 place-items-center bg-[#141414]">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl border border-[#333333] bg-[#1c1c1c]">
          <Bot size={22} className="text-[#a3a3a3]" />
        </div>
        <h2 className="text-sm font-semibold text-white">Build your VinceZone agent team</h2>
        <p className="mt-2 text-[11px] leading-5 text-[#858585]">
          Add unlimited agents with custom Soul, Mission, Memory, Provider, and Model.
        </p>
        <button
          onClick={onCreate}
          className="mt-4 rounded bg-[#e5e5e5] px-3 py-2 text-[11px] font-semibold text-[#111111] hover:bg-white"
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
  files,
  skills,
  combos = [],
  mcpServers,
  plugins,
  providers = [],
  peers,
  view,
  draft,
  onDragStart,
  onDrop,
  onEdit,
  onChangeModel,
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
  files: WorkspaceFile[]
  skills: SkillIndexItem[]
  combos?: SkillComboItem[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  providers?: ProviderConfig[]
  peers: Agent[]
  view: AgentView
  draft: string
  onDragStart: () => void
  onDrop: () => void
  onEdit: () => void
  onChangeModel?: (providerId: string, model: string) => void
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
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [delegateTarget, setDelegateTarget] = useState(peers[0]?.id ?? '')
  const [delegatePrompt, setDelegatePrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!peers.some((peer) => peer.id === delegateTarget)) setDelegateTarget(peers[0]?.id ?? '')
  }, [delegateTarget, peers])

  const effectiveDraft = agent.composingPrompt ?? draft
  const slashQuery = agent.composingPrompt ? null : extractActiveSlashQuery(draft)
  const slashItems = useMemo(
    () =>
      slashQuery !== null
        ? buildSlashCommands(skills, mcpServers, plugins, slashQuery, combos)
        : [],
    [combos, mcpServers, plugins, skills, slashQuery],
  )

  return (
    <article
      data-agent-panel={agent.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`agent-chat-panel relative flex h-full min-h-[220px] min-w-0 flex-col bg-[#161616] transition-shadow ${
        agent.status === 'running' || agent.status === 'reviewing' ? 'agent-panel-running' : ''
      } ${isSendingMail ? 'mail-panel-sending' : ''} ${justReceivedMail ? 'mail-panel-arrived' : ''}`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <GripVertical size={12} className="shrink-0 text-[#5c5c5c]" />
          <button
            type="button"
            onClick={() => setModelPickerOpen((prev) => !prev)}
            title="Nhấp vào hình robot để đổi Model / Provider cho Agent này"
            className={`relative grid size-7 shrink-0 place-items-center rounded transition ${
              modelPickerOpen
                ? 'bg-[#e5e5e5] text-[#111111]'
                : 'bg-[#262626] hover:bg-[#333333]'
            }`}
          >
            <Bot
              size={14}
              style={{ color: modelPickerOpen ? '#111111' : agent.accent }}
            />
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-[#181818]"
              style={{ background: agent.status === 'blocked' ? '#f48771' : agent.accent }}
            />
          </button>
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
            title="Edit role, Soul, Mission, Memory & Model"
            onClick={onEdit}
          >
            <Pencil size={11} />
          </button>
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

      <div className="flex items-center gap-2 border-b border-[#242424] bg-[#161616] px-3 py-1.5 text-[9px] text-[#858585]">
        <span className="capitalize">{agent.status}</span>
        {agent.composingPrompt && (
          <span className="rounded bg-[#333333] px-1.5 py-0.5 text-[8px] font-medium uppercase text-white">
            Typing command…
          </span>
        )}
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
        <span className="ml-auto max-w-[45%] truncate rounded border border-[#2b2b2b] bg-[#1e1e1e] px-1.5 py-0.5 text-[#a3a3a3]">
          {agent.model}
        </span>
        <button
          onClick={() => onView('chat')}
          title="Chat view"
          className={view === 'chat' ? 'text-white' : ''}
        >
          <MessageSquare size={10} />
        </button>
        <button
          onClick={() => onView('terminal')}
          title="Terminal view"
          className={view === 'terminal' ? 'text-white' : ''}
        >
          <TerminalSquare size={10} />
        </button>
      </div>

      {modelPickerOpen && (
        <div className="max-h-40 overflow-y-auto border-b border-[#333333] bg-[#141414] p-2">
          <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase text-[#a3a3a3]">
            <span>Chọn Model cho {agent.name}</span>
            <button type="button" onClick={() => setModelPickerOpen(false)} className="mini-button">
              <X size={10} />
            </button>
          </div>
          <div className="space-y-0.5">
            {providers.flatMap((p) =>
              (p.models || p.model || '')
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean)
                .map((m) => {
                  const selected = agent.model === m
                  return (
                    <button
                      key={`${p.id}:${m}`}
                      type="button"
                      onClick={() => {
                        onChangeModel?.(p.id, m)
                        setModelPickerOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[9px] ${
                        selected
                          ? 'bg-[#2e2e2e] font-semibold text-white'
                          : 'text-[#cccccc] hover:bg-[#222222]'
                      }`}
                    >
                      <span className="truncate font-mono">{m}</span>
                      <span className="ml-2 shrink-0 text-[8px] text-[#7a7a7a]">
                        {p.name || p.id}
                      </span>
                    </button>
                  )
                }),
            )}
          </div>
        </div>
      )}

      {(agent.status === 'running' || agent.status === 'reviewing') && (
        <div className="relative flex h-6 shrink-0 items-center gap-2 overflow-hidden border-b border-[#2b2b2b] bg-[#1b1b1b] px-3 text-[9px] text-[#d4d4d4]">
          <span className="agent-orbit size-1.5 rounded-full bg-[#e5e5e5]" />
          {agent.status === 'reviewing' ? 'Reviewing worker reports' : 'Runtime response active'}
          <span className="agent-progress absolute inset-x-0 bottom-0 h-px bg-[#e5e5e5]" />
        </div>
      )}

      {view === 'chat' ? (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          {agent.messages.map((message) =>
            message.role === 'tool' ? (
              <div
                key={message.id}
                className="rounded border border-[#2b2b2b] bg-[#1c1c1c] p-2"
              >
                <div className="flex items-center gap-1.5 text-[9px] font-medium text-[#a3a3a3]">
                  <TerminalSquare size={11} /> Runtime event
                  <Check size={10} className="ml-auto text-[#e5e5e5]" />
                </div>
                <p className="mt-1 text-[10px] leading-4 text-[#a3a3a3]">{message.text}</p>
                {message.codeSnippet && (
                  <pre className="mt-1.5 overflow-x-auto rounded border border-[#2f2f2f] bg-[#111111] p-2 font-mono text-[9px] text-[#e5e5e5]">
                    <code>{message.codeSnippet}</code>
                  </pre>
                )}
                {message.change && (
                  <button
                    onClick={() => onDiff(message.patchId)}
                    className="mt-2 flex w-full items-center justify-between rounded border border-[#454545] bg-[#262626] px-2 py-1.5 text-[9px] text-white hover:bg-[#333333]"
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
                      ? 'bg-[#2a2a2a] text-white'
                      : message.role === 'agent'
                        ? 'border border-[#454545] bg-[#202020] text-[#e5e5e5]'
                        : 'border border-[#2b2b2b] bg-[#1a1a1a] text-[#cccccc]'
                  }`}
                >
                  {message.role === 'agent' && (
                    <div className="mb-1 flex items-center gap-1 text-[8px] uppercase tracking-wider text-[#a3a3a3]">
                      {message.codeSnippet ? <Code2 size={9} /> : <Mail size={9} />}
                      <span>
                        {message.from} → {agent.name}
                      </span>
                    </div>
                  )}
                  {message.text ? (
                    <HighlightedChatText text={message.text} />
                  ) : (
                    <span className="streaming-dots">Generating</span>
                  )}
                  {message.codeSnippet && (
                    <pre className="mt-2 overflow-x-auto rounded border border-[#333333] bg-[#101010] p-2 font-mono text-[9px] leading-4 text-[#f0f0f0]">
                      <code>{message.codeSnippet}</code>
                    </pre>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        <AgentTerminal agent={agent} />
      )}

      <div className="shrink-0 border-t border-[#2b2b2b] bg-[#181818] p-2.5">
        <div
          className={`rounded-lg border bg-[#131313] transition ${
            agent.composingPrompt
              ? 'border-[#e5e5e5] ring-1 ring-white/20'
              : 'border-[#333333] focus-within:border-[#737373]'
          }`}
        >
          {contextPickerOpen && (
            <ChatContextMenu
              files={files}
              agents={[agent, ...peers]}
              skills={skills}
              combos={combos}
              mcpServers={mcpServers}
              plugins={plugins}
              onInsert={(token) => {
                const spacer = draft && !draft.endsWith(' ') && !draft.endsWith('\n') ? ' ' : ''
                onDraft(`${draft}${spacer}${token} `)
                textareaRef.current?.focus()
              }}
              onClose={() => setContextPickerOpen(false)}
            />
          )}
          {delegationOpen && (
            <div className="border-b border-[#2b2b2b] bg-[#1b1b1b] p-2">
              <div className="mb-1.5 flex items-center gap-1 text-[8px] uppercase tracking-wider text-[#a3a3a3]">
                <Mail size={9} /> Dispatch prompt from {agent.name}
              </div>
              <div className="flex gap-1.5">
                <select
                  value={delegateTarget}
                  onChange={(event) => setDelegateTarget(event.target.value)}
                  className="w-28 rounded border border-[#333333] bg-[#141414] px-1.5 text-[9px] text-[#cccccc]"
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
                  placeholder="Task prompt & code instructions…"
                  className="min-w-0 flex-1 rounded border border-[#333333] bg-[#101010] px-2 py-1.5 text-[9px] text-white outline-none"
                />
                <button
                  onClick={() => {
                    onDelegate(delegateTarget, delegatePrompt)
                    setDelegatePrompt('')
                    setDelegationOpen(false)
                  }}
                  disabled={!delegatePrompt.trim() || !delegateTarget}
                  className="grid size-6 place-items-center rounded bg-[#e5e5e5] text-[#111111] disabled:opacity-20"
                >
                  <Send size={10} />
                </button>
              </div>
            </div>
          )}
          {slashQuery !== null && (
            <SlashCommandPopover
              query={slashQuery}
              skills={skills}
              combos={combos}
              mcpServers={mcpServers}
              plugins={plugins}
              selectedIndex={Math.min(slashIndex, Math.max(0, slashItems.length - 1))}
              onHoverIndex={setSlashIndex}
              onSelect={(command) => {
                onDraft(applySlashSelection(draft, command))
                setSlashIndex(0)
                textareaRef.current?.focus()
              }}
            />
          )}
          <HighlightedChatTextarea
            textareaRef={textareaRef}
            value={effectiveDraft}
            readOnly={Boolean(agent.composingPrompt)}
            rows={2}
            size="sm"
            mono={Boolean(agent.composingPrompt)}
            placeholder={`Message ${agent.name}… Type / for skills, MCP & plugins`}
            onChange={(nextValue) => {
              onDraft(nextValue)
              setSlashIndex(0)
            }}
            onKeyDown={(event) => {
              if (slashQuery !== null && slashItems.length > 0) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setSlashIndex((i) => (i + 1) % slashItems.length)
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setSlashIndex((i) => (i - 1 + slashItems.length) % slashItems.length)
                  return
                }
                if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                  event.preventDefault()
                  const picked = slashItems[Math.min(slashIndex, slashItems.length - 1)]
                  if (picked) {
                    onDraft(applySlashSelection(draft, picked.command))
                    setSlashIndex(0)
                  }
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onDraft(draft.replace(/(^|\s)\/[a-z0-9:._-]*$/i, '$1'))
                  return
                }
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex gap-1">
              <button
                className={`mini-button ${contextPickerOpen ? 'bg-[#2e2e2e] text-white' : ''}`}
                title="Add Context"
                onClick={() => {
                  setContextPickerOpen((prev) => !prev)
                  setDelegationOpen(false)
                }}
              >
                <Plus size={11} />
              </button>
              <button
                className="mini-button font-mono text-[10px] font-semibold"
                title="Invoke /skill, /mcp or /plugin"
                onClick={() => {
                  onDraft(`${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}/`)
                  setSlashIndex(0)
                }}
              >
                /
              </button>
              <button
                className={`mini-button ${delegationOpen ? 'bg-[#2e2e2e] text-white' : ''}`}
                title="Dispatch prompt / delegate task to another agent"
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
                className="grid size-5 place-items-center rounded bg-[#3a3a3a] text-white"
              >
                <Square size={9} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!effectiveDraft.trim()}
                className={`grid size-5 place-items-center rounded text-[#111111] transition disabled:opacity-20 ${
                  agent.composingPrompt ? 'scale-110 bg-white shadow' : 'bg-[#e5e5e5] hover:bg-white'
                }`}
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#111111] p-3 font-mono text-[10px] leading-[1.65] text-[#9a9a9a]">
      <p className="text-[#666666]">VinceZone Runtime · session {agent.id.slice(0, 8)}</p>
      <p>
        <span className="text-[#e5e5e5]">●</span> provider session · {agent.status}
      </p>
      <p>
        <span className="text-[#d4d4d4]">model</span> {agent.model}
      </p>
      {agent.mission && <p className="text-[#737373]">mission: {agent.mission}</p>}
      <div className="my-3 border-t border-dashed border-[#2b2b2b]" />
      {agent.messages.map((message) => (
        <div key={message.id} className="mb-3">
          <p className="text-[9px] uppercase tracking-wider text-[#666666]">{message.role}</p>
          <p className="whitespace-pre-wrap text-[#cccccc]">
            {message.text || 'runtime event active...'}
          </p>
        </div>
      ))}
      <div className="mt-2 flex items-center gap-2 border-t border-[#2b2b2b] pt-2">
        <span className="text-[#d4d4d4]">›</span>
        <span className="terminal-cursor" />
      </div>
    </div>
  )
}
