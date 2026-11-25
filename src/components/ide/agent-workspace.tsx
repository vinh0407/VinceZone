'use client'

import {
  Bot,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Crown,
  FileCode2,
  GitCompareArrows,
  GripVertical,
  History,
  ImagePlus,
  LayoutGrid,
  Mail,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Minimize2,
  PanelTopClose,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Square,
  TerminalSquare,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { computeAgentGridPlan } from '@/lib/agent-layout'
import { copyTextToClipboard } from '@/lib/clipboard'
import { getCaptainAgent, getViceCaptainAgent } from '@/lib/command-hierarchy'
import { extractImagesFromFileList } from '@/lib/image-attachment'
import { estimateContextMeter } from '@/lib/project-rules'
import { AgentMailOverlay } from './agent-mail-overlay'
import { ChatContextMenu } from './chat-context-menu'
import { CommandApprovalList } from './command-approval-card'
import { HighlightedChatText, HighlightedChatTextarea } from './highlighted-chat-input'
import { MarkdownReply } from './markdown-reply'
import type {
  Agent,
  AgentLayout,
  AgentTask,
  AgentView,
  AgentWorkspaceState,
  ChatImageAttachment,
  ChatThreadSnapshot,
  CommandApprovalItem,
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
  commandApprovals = [],
  chatThreads = [],
  skills,
  combos = [],
  mcpServers,
  plugins,
  providers = [],
  onApproveCommand,
  onRejectCommand,
  onAssignCaptain,
  onToggleViceCaptain,
  onClearViceCaptain,
  onNewThread,
  onSelectThread,
  onUndoTurn,
  onCompactAgent,
  onRetryTask,
  onUpdateTaskStatus,
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
  commandApprovals?: CommandApprovalItem[]
  chatThreads?: ChatThreadSnapshot[]
  skills: SkillIndexItem[]
  combos?: SkillComboItem[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  providers?: ProviderConfig[]
  onApproveCommand?: (id: string) => void
  onRejectCommand?: (id: string) => void
  onAssignCaptain?: (agentId: string) => void
  onToggleViceCaptain?: (agentId: string) => void
  onClearViceCaptain?: () => void
  onNewThread?: () => void
  onSelectThread?: (threadId: string) => void
  onUndoTurn?: (agentId: string, messageId: string) => void
  onCompactAgent?: (agentId: string) => void
  onRetryTask?: (task: AgentTask) => void
  onUpdateTaskStatus?: (taskId: string, status: AgentTask['status']) => void
  onCreate: () => void
  onEditAgent: (agent: Agent) => void
  onChangeAgentModel?: (agentId: string, providerId: string, model: string) => void
  onView: (id: string, view: AgentView) => void
  onDraft: (id: string, value: string) => void
  onSend: (agent: Agent, images?: ChatImageAttachment[]) => void
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
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [tasksExpanded, setTasksExpanded] = useState(false)
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
  const isSolo = gridPlan.kind === 'single'
  const captainAgent = getCaptainAgent(agents)
  const viceAgent = getViceCaptainAgent(agents)
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
      isSolo={isSolo}
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
      isCaptain={captainAgent?.id === agent.id}
      isViceCaptain={viceAgent?.id === agent.id}
      onAssignCaptain={() => onAssignCaptain?.(agent.id)}
      onToggleViceCaptain={() => onToggleViceCaptain?.(agent.id)}
      commandApprovals={commandApprovals.filter((c) => c.agentId === agent.id)}
      onApproveCommand={onApproveCommand}
      onRejectCommand={onRejectCommand}
      peers={agents.filter((peer) => peer.id !== agent.id)}
      view={views[agent.id] ?? 'chat'}
      draft={drafts[agent.id] ?? ''}
      onDragStart={() => setDraggedId(agent.id)}
      onDrop={() => swapPanels(agent.id)}
      onEdit={() => onEditAgent(agent)}
      onChangeModel={(providerId, model) => onChangeAgentModel?.(agent.id, providerId, model)}
      onView={(view) => onView(agent.id, view)}
      onDraft={(value) => onDraft(agent.id, value)}
      onSend={(images) => onSend(agent, images)}
      onClose={() => onRemove(agent.id)}
      onDuplicate={() => onDuplicate(agent)}
      onDelegate={(targetId, prompt) => onDelegate(agent.id, targetId, prompt)}
      onPause={() => onPause(agent)}
      onDiff={onDiff}
      onUndoTurn={onUndoTurn ? (msgId) => onUndoTurn(agent.id, msgId) : undefined}
      onCompact={onCompactAgent ? () => onCompactAgent(agent.id) : undefined}
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
      <div
        className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#181818] ${
          isSolo ? 'min-h-12 px-5 py-2' : 'min-h-10 px-4 py-1.5'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <LayoutGrid size={isSolo ? 17 : 14} className="text-[#d4d4d4]" />
          <span className={`font-semibold text-white ${isSolo ? 'text-[14px]' : 'text-[12px]'}`}>
            VinceZone Multi-Agent Control Center
          </span>
          <span
            className={`rounded bg-[#262626] font-mono text-[#a3a3a3] ${
              isSolo ? 'px-2 py-0.5 text-[11.5px]' : 'px-1.5 py-0.5 text-[10px]'
            }`}
          >
            {agents.length} agent{agents.length === 1 ? '' : 's'} · unlimited
          </span>
          {tasks.length > 0 && (
            <button
              type="button"
              onClick={() => setTasksExpanded((prev) => !prev)}
              className={`flex items-center gap-1 rounded border font-mono transition ${
                tasksExpanded
                  ? 'border-[#c9a24d]/50 bg-[#c9a24d]/15 text-[#f0d394]'
                  : 'border-[#333333] bg-[#2a2a2a] text-[#e5e5e5] hover:border-[#555555]'
              } ${isSolo ? 'px-2 py-0.5 text-[11.5px]' : 'px-1.5 py-0.5 text-[10px]'}`}
              title="Mở bảng quản lý Sub-Tasks (Retry / Skip từng tác vụ con)"
            >
              {tasks.filter((task) => task.status === 'completed').length}/{tasks.length} tasks
              <ChevronDown
                size={isSolo ? 12 : 10}
                className={`transition-transform ${tasksExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          {captainAgent && (
            <span
              className={`flex items-center gap-1 rounded border border-[#5e4d26] bg-[#262013] font-medium text-[#f0d394] ${
                isSolo ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-2 py-0.5 text-[10px]'
              }`}
              title="Đội trưởng sẽ phân tích, lên kế hoạch và tự gửi prompt cho cả nhóm"
            >
              <Crown size={isSolo ? 13 : 10} /> Đội trưởng: {captainAgent.name}
            </span>
          )}
          {viceAgent ? (
            <span
              className={`flex items-center gap-1 rounded border border-[#2a4a5e] bg-[#14222c] font-medium text-[#9cdcfe] ${
                isSolo ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-2 py-0.5 text-[10px]'
              }`}
            >
              <Shield size={isSolo ? 13 : 10} /> Đội phó: {viceAgent.name}
              {onClearViceCaptain && (
                <button
                  type="button"
                  onClick={onClearViceCaptain}
                  title="Bỏ Đội phó (chỉ giữ 1 Đội trưởng)"
                  className="ml-0.5 rounded p-0.5 hover:bg-white/10 hover:text-white"
                >
                  <X size={isSolo ? 11 : 9} />
                </button>
              )}
            </span>
          ) : (
            <span
              className={`rounded border border-[#2b2b2b] bg-[#141414] text-[#7a7a7a] ${
                isSolo ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[9.5px]'
              }`}
            >
              Không có Đội phó
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {communicationEvents.some((event) => event.recipientId) && (
            <button
              onClick={() => setReplayTrigger((count) => count + 1)}
              className={`flex items-center gap-1.5 rounded border border-[#333333] bg-[#222222] text-[#cccccc] hover:text-white ${
                isSolo ? 'px-3 py-1.5 text-[12.5px]' : 'px-2 py-1 text-[11px]'
              }`}
              title="Replay last mail flights"
            >
              <RotateCcw size={isSolo ? 14 : 11} /> Replay
            </button>
          )}
          {pendingPatchCount > 0 && (
            <button
              onClick={() => onDiff()}
              className={`flex items-center gap-1.5 rounded border border-[#525252] bg-[#2a2a2a] text-[#f0f0f0] hover:bg-[#383838] ${
                isSolo ? 'px-3 py-1.5 text-[12.5px]' : 'px-2.5 py-1 text-[11px]'
              }`}
            >
              <GitCompareArrows size={isSolo ? 14 : 11} /> Diff ({pendingPatchCount})
            </button>
          )}
          <SegmentedControl
            value={workspace.layout}
            large={isSolo}
            onChange={(value) => setLayout(value as AgentLayout)}
            items={[
              { id: 'equal', label: '3:3 Peer' },
              { id: 'focus2', label: '2:4 Plan' },
              { id: 'focus1', label: '1:6 PM' },
            ]}
          />
          {onNewThread && (
            <button
              type="button"
              onClick={onNewThread}
              className={`flex items-center gap-1 rounded border border-[#333333] bg-[#222222] text-[#cccccc] hover:text-white ${
                isSolo ? 'px-3 py-1.5 text-[12.5px]' : 'px-2 py-1 text-[11px]'
              }`}
              title="Bắt đầu cuộc trò chuyện mới (lưu thread hiện tại vào lịch sử)"
            >
              <Plus size={isSolo ? 14 : 11} /> New Chat
            </button>
          )}
          {onSelectThread && chatThreads.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setThreadsOpen((prev) => !prev)}
                className={`flex items-center gap-1 rounded border border-[#333333] bg-[#222222] text-[#cccccc] hover:text-white ${
                  isSolo ? 'px-3 py-1.5 text-[12.5px]' : 'px-2 py-1 text-[11px]'
                }`}
                title="Xem lịch sử các đoạn chat cũ của dự án này"
              >
                <History size={isSolo ? 14 : 11} /> History ({chatThreads.length})
              </button>
              {threadsOpen && (
                <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-[#3a3a3a] bg-[#161616] p-1.5 shadow-2xl">
                  {chatThreads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectThread(t.id)
                        setThreadsOpen(false)
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-[11px] text-[#cccccc] hover:bg-[#262626] hover:text-white"
                    >
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="shrink-0 font-mono text-[9px] text-[#7a7a7a]">
                        {t.messageCount}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={onCreate}
            className={`flex items-center gap-1.5 rounded bg-[#e5e5e5] font-medium text-[#111111] hover:bg-white ${
              isSolo ? 'px-3.5 py-1.5 text-[12.5px]' : 'px-3 py-1 text-[11px]'
            }`}
          >
            <MessageSquarePlus size={isSolo ? 15 : 12} /> New agent
          </button>
        </div>
      </div>

      {tasksExpanded && tasks.length > 0 && (
        <div className="shrink-0 border-b border-[#2b2b2b] bg-[#161616] px-4 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-[#a3a3a3]">
            <span className="font-semibold uppercase tracking-wider text-[#d4d4d4]">
              Delegated Sub-Tasks ({tasks.length})
            </span>
            <button
              type="button"
              onClick={() => setTasksExpanded(false)}
              className="rounded p-0.5 text-[#7a7a7a] hover:bg-[#262626] hover:text-white"
            >
              <X size={11} />
            </button>
          </div>
          <div className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => {
              const assignee = agents.find((a) => a.id === task.assigneeId)
              const statusColor =
                task.status === 'completed'
                  ? 'border-[#33543a] bg-[#132417] text-[#89d185]'
                  : task.status === 'failed' || task.status === 'blocked'
                    ? 'border-[#5a2a2a] bg-[#261414] text-[#f48771]'
                    : task.status === 'running'
                      ? 'border-[#c9a24d]/45 bg-[#c9a24d]/10 text-[#f0d394]'
                      : 'border-[#333333] bg-[#1d1d1d] text-[#cccccc]'
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-2 rounded border border-[#2b2b2b] bg-[#1b1b1b] px-2.5 py-1.5 text-[10.5px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded border px-1 py-0.5 font-mono text-[8.5px] uppercase ${statusColor}`}>
                        {task.status}
                      </span>
                      <span className="truncate font-medium text-[#e5e5e5]" title={task.title}>
                        {task.title}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[9.5px] text-[#858585]">
                      → {assignee?.name || task.assigneeId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {onRetryTask && (
                      <button
                        type="button"
                        onClick={() => onRetryTask(task)}
                        className="flex items-center gap-1 rounded border border-[#c9a24d]/35 bg-[#c9a24d]/10 px-1.5 py-0.5 text-[9.5px] text-[#e6cfa0] hover:bg-[#c9a24d]/20 hover:text-white"
                        title="Chạy lại sub-task này cho agent phụ trách"
                      >
                        <RotateCcw size={9} /> Retry
                      </button>
                    )}
                    {onUpdateTaskStatus && task.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => onUpdateTaskStatus(task.id, 'completed')}
                        className="flex items-center gap-0.5 rounded border border-[#333333] bg-[#222222] px-1.5 py-0.5 text-[9.5px] text-[#a3a3a3] hover:bg-[#2c2c2c] hover:text-white"
                        title="Bỏ qua / đánh dấu đã xong sub-task này"
                      >
                        <SkipForward size={9} /> Skip
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
          <div
            className={`flex shrink-0 items-center border-b border-[#2b2b2b] bg-[#141414] ${
              isSolo ? 'h-10 gap-2 px-5' : 'h-8 gap-1.5 px-3'
            }`}
          >
            <span
              className={`mr-1 uppercase tracking-widest text-[#737373] ${
                isSolo ? 'text-[11px]' : 'text-[9px]'
              }`}
            >
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
                  className={`flex items-center gap-1 rounded border border-[#333333] bg-[#222222] text-[#cccccc] hover:text-white ${
                    isSolo ? 'px-2.5 py-1 text-[12px]' : 'px-2 py-1 text-[10px]'
                  }`}
                >
                  <ChevronDown size={isSolo ? 13 : 10} /> {agent.name}
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
  large = false,
  onChange,
}: {
  value: string
  items: Array<{ id: string; label: string }>
  large?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center rounded border border-[#333333] bg-[#121212] p-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`rounded ${large ? 'px-3 py-1.5 text-[12px]' : 'px-2 py-1 text-[10px]'} ${
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
  isSolo = false,
  isCaptain = false,
  isViceCaptain = false,
  topologyRole,
  isSendingMail,
  justReceivedMail,
  files,
  skills,
  combos = [],
  mcpServers,
  plugins,
  providers = [],
  commandApprovals = [],
  onApproveCommand,
  onRejectCommand,
  onAssignCaptain,
  onToggleViceCaptain,
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
  onUndoTurn,
  onCompact,
  onMinimize,
  onPromote,
}: {
  agent: Agent
  isSolo?: boolean
  isCaptain?: boolean
  isViceCaptain?: boolean
  topologyRole: 'Peer' | 'Planner' | 'Coordinator' | 'Worker'
  isSendingMail: boolean
  justReceivedMail: boolean
  files: WorkspaceFile[]
  skills: SkillIndexItem[]
  combos?: SkillComboItem[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  providers?: ProviderConfig[]
  commandApprovals?: CommandApprovalItem[]
  onApproveCommand?: (id: string) => void
  onRejectCommand?: (id: string) => void
  onAssignCaptain?: () => void
  onToggleViceCaptain?: () => void
  peers: Agent[]
  view: AgentView
  draft: string
  onDragStart: () => void
  onDrop: () => void
  onEdit: () => void
  onChangeModel?: (providerId: string, model: string) => void
  onView: (view: AgentView) => void
  onDraft: (value: string) => void
  onSend: (images?: ChatImageAttachment[]) => void
  onClose: () => void
  onDuplicate: () => void
  onDelegate: (targetId: string, prompt: string) => void
  onPause: () => void
  onDiff: (patchId?: string) => void
  onUndoTurn?: (messageId: string) => void
  onCompact?: () => void
  onMinimize: () => void
  onPromote: () => void
}) {
  const [delegationOpen, setDelegationOpen] = useState(false)
  const contextMeter = useMemo(() => estimateContextMeter(agent.messages), [agent.messages])
  const [contextPickerOpen, setContextPickerOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [delegateTarget, setDelegateTarget] = useState(peers[0]?.id ?? '')
  const [delegatePrompt, setDelegatePrompt] = useState('')
  const [pendingImages, setPendingImages] = useState<ChatImageAttachment[]>([])
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  const handleAddImages = async (fileList: FileList | File[]) => {
    const added = await extractImagesFromFileList(fileList)
    if (added.length > 0) {
      setPendingImages((prev) => [...prev, ...added].slice(0, 4))
    }
  }

  const triggerSend = () => {
    const imgs = pendingImages
    if (!effectiveDraft.trim() && imgs.length === 0) return
    stickToBottomRef.current = true
    setPendingImages([])
    onSend(imgs.length > 0 ? imgs : undefined)
  }

  const lastMsg = agent.messages[agent.messages.length - 1]
  const lastMsgSignature = `${agent.messages.length}:${lastMsg?.id ?? ''}:${lastMsg?.text.length ?? 0}:${commandApprovals.length}`

  // Jump immediately to the latest message whenever entering this agent panel or switching back to chat view
  useLayoutEffect(() => {
    if (view !== 'chat') return
    stickToBottomRef.current = true
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    const raf = window.requestAnimationFrame(() => {
      if (messagesScrollRef.current) {
        messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight
      }
    })
    return () => window.cancelAnimationFrame(raf)
  }, [agent.id, view])

  // Stay anchored at the latest message during new replies & streaming unless user scrolled up
  useEffect(() => {
    if (view !== 'chat' || !stickToBottomRef.current) return
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lastMsgSignature, view])
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

  const headerBtnClass = isSolo
    ? 'grid size-8 place-items-center rounded-md text-[#b3b3b3] transition hover:bg-[#2a2a2a] hover:text-white'
    : 'mini-button'
  const headerIconSize = isSolo ? 16 : 11
  const headerCloseIconSize = isSolo ? 17 : 12

  return (
    <article
      data-agent-panel={agent.id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className={`agent-chat-panel relative flex h-full min-h-[220px] min-w-0 flex-col bg-[#161616] transition-shadow ${
        agent.status === 'running' || agent.status === 'reviewing' ? 'agent-panel-running' : ''
      } ${isSendingMail ? 'mail-panel-sending' : ''} ${justReceivedMail ? 'mail-panel-arrived' : ''}`}
    >
      <div
        draggable
        onDragStart={onDragStart}
        className={`flex shrink-0 cursor-grab items-center justify-between border-b border-[#2b2b2b] bg-[#181818] active:cursor-grabbing ${
          isSolo ? 'h-16 px-5' : 'h-11 px-3'
        }`}
      >
        <div className={`flex min-w-0 items-center ${isSolo ? 'gap-3.5' : 'gap-2.5'}`}>
          <GripVertical size={isSolo ? 16 : 12} className="shrink-0 text-[#5c5c5c]" />
          <button
            type="button"
            onClick={() => setModelPickerOpen((prev) => !prev)}
            title="Nhấp vào hình robot để đổi Model / Provider cho Agent này"
            className={`relative grid shrink-0 place-items-center transition ${
              isSolo ? 'size-10 rounded-lg' : 'size-7 rounded'
            } ${
              modelPickerOpen
                ? 'bg-[#e5e5e5] text-[#111111]'
                : 'bg-[#262626] hover:bg-[#333333]'
            }`}
          >
            <Bot
              size={isSolo ? 21 : 14}
              style={{ color: modelPickerOpen ? '#111111' : agent.accent }}
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#181818] ${
                isSolo ? 'size-2.5' : 'size-2'
              }`}
              style={{ background: agent.status === 'blocked' ? '#f48771' : agent.accent }}
            />
          </button>
          <div className="min-w-0">
            <div className={`flex items-center ${isSolo ? 'gap-2' : 'gap-1.5'}`}>
              <h2
                className={`truncate font-semibold text-white ${
                  isSolo ? 'text-[15.5px]' : 'text-[11px]'
                }`}
              >
                {agent.name}
              </h2>
              {agent.roleId && agent.roleId !== 'custom' && (
                <span
                  className={`rounded bg-[#262626] font-mono uppercase text-[#d4d4d4] ${
                    isSolo ? 'px-2 py-0.5 text-[11px]' : 'px-1 py-0.5 text-[8px]'
                  }`}
                >
                  @{agent.roleId}
                </span>
              )}
              {isCaptain ? (
                <span
                  className={`flex shrink-0 items-center gap-1 rounded border border-[#5e4d26] bg-[#2a2313] font-semibold uppercase text-[#f0d394] ${
                    isSolo ? 'px-2 py-0.5 text-[10.5px]' : 'px-1.5 py-0.5 text-[8px]'
                  }`}
                >
                  <Crown size={isSolo ? 11 : 8} /> Đội trưởng
                </span>
              ) : isViceCaptain ? (
                <span
                  className={`flex shrink-0 items-center gap-1 rounded border border-[#2a4a5e] bg-[#14222c] font-semibold uppercase text-[#9cdcfe] ${
                    isSolo ? 'px-2 py-0.5 text-[10.5px]' : 'px-1.5 py-0.5 text-[8px]'
                  }`}
                >
                  <Shield size={isSolo ? 11 : 8} /> Đội phó
                </span>
              ) : topologyRole !== 'Worker' ? (
                <span
                  className={`rounded bg-[#333333] uppercase text-[#e5e5e5] ${
                    isSolo ? 'px-2 py-0.5 text-[10.5px]' : 'px-1 py-0.5 text-[7px]'
                  }`}
                >
                  {topologyRole}
                </span>
              ) : null}
            </div>
            <p
              className={`truncate text-[#8f8f8f] ${
                isSolo ? 'mt-0.5 text-[12.5px]' : 'text-[9px]'
              }`}
            >
              {agent.currentTask || agent.role}
            </p>
          </div>
        </div>
        <div className={`flex items-center ${isSolo ? 'gap-1.5' : 'gap-0.5'}`}>
          <button
            type="button"
            className={`${headerBtnClass} ${
              isCaptain
                ? '!bg-[#352b15] !text-[#f0d394] ring-1 ring-[#6b5629]'
                : 'hover:!text-[#f0d394]'
            }`}
            title={
              isCaptain
                ? 'Đang là Đội trưởng (tự phân tích, lập kế hoạch & gửi prompt cho cả nhóm)'
                : 'Gán làm Đội trưởng'
            }
            onClick={onAssignCaptain}
          >
            <Crown size={headerIconSize} />
          </button>
          <button
            type="button"
            disabled={isCaptain}
            className={`${headerBtnClass} disabled:opacity-25 ${
              isViceCaptain
                ? '!bg-[#172b38] !text-[#9cdcfe] ring-1 ring-[#2e5770]'
                : 'hover:!text-[#9cdcfe]'
            }`}
            title={
              isCaptain
                ? 'Đội trưởng không cần kiêm Đội phó'
                : isViceCaptain
                  ? 'Bấm để Bỏ Đội phó (chỉ giữ 1 Đội trưởng)'
                  : 'Gán làm Đội phó (tùy chọn)'
            }
            onClick={onToggleViceCaptain}
          >
            <Shield size={headerIconSize} />
          </button>
          <button
            className={`agent-panel-optional ${headerBtnClass}`}
            title="Edit role, Soul, Mission, Memory & Model"
            onClick={onEdit}
          >
            <Pencil size={headerIconSize} />
          </button>
          <button
            className={`agent-panel-optional ${headerBtnClass}`}
            title="Promote to main panel"
            onClick={onPromote}
          >
            <Maximize2 size={headerIconSize} />
          </button>
          <button
            className={`agent-panel-optional ${headerBtnClass}`}
            title={agent.status === 'paused' ? 'Resume' : 'Pause or stop'}
            onClick={onPause}
          >
            {agent.status === 'paused' ? (
              <Play size={headerIconSize} />
            ) : (
              <Pause size={headerIconSize} />
            )}
          </button>
          <button
            className={`agent-panel-optional ${headerBtnClass}`}
            title="Duplicate agent"
            onClick={onDuplicate}
          >
            <Copy size={headerIconSize} />
          </button>
          <button className={headerBtnClass} title="Minimize" onClick={onMinimize}>
            <PanelTopClose size={headerCloseIconSize} />
          </button>
          <button className={headerBtnClass} title="Close" onClick={onClose}>
            <X size={headerCloseIconSize} />
          </button>
        </div>
      </div>

      <div
        className={`flex items-center border-b border-[#242424] bg-[#161616] text-[#9a9a9a] ${
          isSolo ? 'gap-3 px-5 py-2.5 text-[12.5px]' : 'gap-2 px-3 py-1.5 text-[9px]'
        }`}
      >
        <span className="capitalize">{agent.status}</span>
        {agent.composingPrompt && (
          <span
            className={`rounded bg-[#333333] font-medium uppercase text-white ${
              isSolo ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[8px]'
            }`}
          >
            Typing command…
          </span>
        )}
        {isSendingMail && (
          <span
            className={`flex items-center gap-1 rounded bg-[#333333] uppercase text-[#f5f5f5] ${
              isSolo ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[8px]'
            }`}
          >
            <Mail size={isSolo ? 12 : 8} /> Sending
          </span>
        )}
        {justReceivedMail && (
          <span
            className={`flex items-center gap-1 rounded bg-[#e5e5e5] font-medium uppercase text-[#111111] ${
              isSolo ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[8px]'
            }`}
          >
            <Mail size={isSolo ? 12 : 8} /> Received
          </span>
        )}
        <button
          type="button"
          onClick={() => setModelPickerOpen((prev) => !prev)}
          title="Đổi Model / Provider"
          className={`ml-auto max-w-[45%] truncate rounded border border-[#2b2b2b] bg-[#1e1e1e] font-mono text-[#c8c8c8] transition hover:border-[#4b4b4b] hover:text-white ${
            isSolo ? 'px-3 py-1 text-[12px]' : 'px-1.5 py-0.5'
          }`}
        >
          {agent.model}
        </button>
        <button
          onClick={() => onView('chat')}
          title="Chat view"
          className={`${
            isSolo
              ? 'grid size-8 place-items-center rounded-md hover:bg-[#262626]'
              : ''
          } ${view === 'chat' ? 'bg-[#262626] text-white' : ''}`}
        >
          <MessageSquare size={isSolo ? 16 : 10} />
        </button>
        <button
          onClick={() => onView('terminal')}
          title="Terminal view"
          className={`${
            isSolo
              ? 'grid size-8 place-items-center rounded-md hover:bg-[#262626]'
              : ''
          } ${view === 'terminal' ? 'bg-[#262626] text-white' : ''}`}
        >
          <TerminalSquare size={isSolo ? 16 : 10} />
        </button>
      </div>

      {modelPickerOpen && (
        <div
          className={`overflow-y-auto border-b border-[#333333] bg-[#141414] ${
            isSolo ? 'max-h-64 p-3.5' : 'max-h-40 p-2'
          }`}
        >
          <div
            className={`mb-1.5 flex items-center justify-between font-semibold uppercase text-[#a3a3a3] ${
              isSolo ? 'text-[12px]' : 'text-[9px]'
            }`}
          >
            <span>Chọn Model cho {agent.name}</span>
            <button
              type="button"
              onClick={() => setModelPickerOpen(false)}
              className={headerBtnClass}
            >
              <X size={isSolo ? 15 : 10} />
            </button>
          </div>
          <div className={isSolo ? 'space-y-1' : 'space-y-0.5'}>
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
                      className={`flex w-full items-center justify-between rounded text-left ${
                        isSolo ? 'px-3 py-2 text-[13px]' : 'px-2 py-1 text-[9px]'
                      } ${
                        selected
                          ? 'bg-[#2e2e2e] font-semibold text-white'
                          : 'text-[#cccccc] hover:bg-[#222222]'
                      }`}
                    >
                      <span className="truncate font-mono">{m}</span>
                      <span
                        className={`ml-2 shrink-0 text-[#7a7a7a] ${
                          isSolo ? 'text-[11px]' : 'text-[8px]'
                        }`}
                      >
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
        <div
          className={`relative flex shrink-0 items-center overflow-hidden border-b border-[#2b2b2b] bg-[#1b1b1b] text-[#d4d4d4] ${
            isSolo ? 'h-9 gap-2.5 px-5 text-[12.5px]' : 'h-6 gap-2 px-3 text-[9px]'
          }`}
        >
          <span
            className={`agent-orbit rounded-full bg-[#e5e5e5] ${isSolo ? 'size-2' : 'size-1.5'}`}
          />
          {agent.status === 'reviewing' ? 'Reviewing worker reports' : 'Runtime response active'}
          <span className="agent-progress absolute inset-x-0 bottom-0 h-px bg-[#e5e5e5]" />
        </div>
      )}

      {view === 'chat' ? (
        <div
          ref={messagesScrollRef}
          onScroll={(event) => {
            const el = event.currentTarget
            stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
          }}
          className={`min-h-0 flex-1 overflow-y-auto ${
            isSolo ? 'px-6 py-5' : 'space-y-2.5 p-3'
          }`}
        >
          <div className={isSolo ? 'mx-auto w-full max-w-5xl space-y-4' : 'space-y-2.5'}>
            {agent.messages.map((message) =>
              message.role === 'tool' ? (
                <div
                  key={message.id}
                  className={`rounded-lg border border-[#2b2b2b] bg-[#1c1c1c] ${
                    isSolo ? 'p-3.5' : 'p-2'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 font-medium text-[#a3a3a3] ${
                      isSolo ? 'text-[12.5px]' : 'text-[9px]'
                    }`}
                  >
                    <TerminalSquare size={isSolo ? 15 : 11} /> Runtime event
                    <Check size={isSolo ? 14 : 10} className="ml-auto text-[#e5e5e5]" />
                  </div>
                  <p
                    className={`mt-1.5 text-[#b5b5b5] ${
                      isSolo ? 'text-[13px] leading-5' : 'text-[10px] leading-4'
                    }`}
                  >
                    {message.text}
                  </p>
                  {message.codeSnippet && (
                    <pre
                      className={`mt-2 overflow-x-auto rounded border border-[#2f2f2f] bg-[#111111] font-mono text-[#e5e5e5] ${
                        isSolo ? 'p-3 text-[12.5px] leading-5' : 'p-2 text-[9px]'
                      }`}
                    >
                      <code>{message.codeSnippet}</code>
                    </pre>
                  )}
                  {message.change && (
                    <button
                      onClick={() => onDiff(message.patchId)}
                      className={`mt-2.5 flex w-full items-center justify-between rounded border border-[#454545] bg-[#262626] text-white hover:bg-[#333333] ${
                        isSolo ? 'px-3.5 py-2 text-[12.5px]' : 'px-2 py-1.5 text-[9px]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <GitCompareArrows size={isSolo ? 15 : 11} /> Review proposed changes
                      </span>
                      <span>Diff</span>
                    </button>
                  )}
                </div>
              ) : (
                <div
                  key={message.id}
                  className={`group flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`min-w-0 select-text ${
                      isSolo ? 'rounded-xl' : 'rounded-lg'
                    } ${
                      message.role === 'user'
                        ? isSolo
                          ? 'max-w-[78%] whitespace-pre-wrap bg-[#2a2a2a] px-4 py-3 text-[14.5px] leading-[1.6] text-white'
                          : 'max-w-[90%] whitespace-pre-wrap bg-[#2a2a2a] px-3 py-2 text-[10.5px] leading-[1.55] text-white'
                        : message.role === 'agent'
                          ? `w-full max-w-[98%] border border-[#454545] bg-[#202020] text-[#e5e5e5] ${
                              isSolo ? 'px-5 py-4' : 'px-3 py-2'
                            }`
                          : `w-full max-w-[98%] border border-[#2b2b2b] bg-[#1a1a1a] text-[#cccccc] ${
                              isSolo ? 'px-5 py-4' : 'px-3 py-2'
                            }`
                    }`}
                  >
                    {message.role === 'agent' && (
                      <div
                        className={`mb-2 flex items-center gap-1.5 border-b border-[#323232] pb-1.5 font-semibold uppercase tracking-wider text-[#a3a3a3] ${
                          isSolo ? 'text-[11px]' : 'text-[8.5px]'
                        }`}
                      >
                        {message.codeSnippet ? (
                          <Code2 size={isSolo ? 13 : 9} />
                        ) : (
                          <Mail size={isSolo ? 13 : 9} />
                        )}
                        <span>
                          {message.from} → {agent.name}
                        </span>
                      </div>
                    )}
                    {message.images && message.images.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {message.images.map((img) => (
                          <img
                            key={img.id}
                            src={img.dataUrl}
                            alt={img.name}
                            className={`rounded border border-[#444444] object-cover ${
                              isSolo ? 'max-h-48 max-w-[280px]' : 'max-h-24 max-w-[160px]'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    {message.text ? (
                      message.role === 'user' ? (
                        <HighlightedChatText text={message.text} />
                      ) : (
                        <MarkdownReply
                          text={message.text}
                          size={isSolo ? 'large' : 'compact'}
                        />
                      )
                    ) : (
                      <span className={`streaming-dots ${isSolo ? 'text-[14px]' : ''}`}>
                        Generating
                      </span>
                    )}
                    {message.codeSnippet && (
                      <pre
                        className={`mt-2.5 overflow-x-auto rounded border border-[#333333] bg-[#101010] font-mono text-[#f0f0f0] ${
                          isSolo ? 'p-3.5 text-[12.5px] leading-5' : 'p-2 text-[9px] leading-4'
                        }`}
                      >
                        <code>{message.codeSnippet}</code>
                      </pre>
                    )}
                  </div>
                  {(message.role === 'user' || message.role === 'assistant') && message.text && (
                    <div
                      className={`mt-1 flex items-center gap-1 px-0.5 text-[#8a8a8a] opacity-75 transition group-hover:opacity-100 ${
                        isSolo ? 'text-[11.5px]' : 'text-[9.5px]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          void copyTextToClipboard(message.text).then((ok) => {
                            if (ok) {
                              setCopiedMsgId(message.id)
                              window.setTimeout(
                                () => setCopiedMsgId((cur) => (cur === message.id ? null : cur)),
                                1500,
                              )
                            }
                          })
                        }}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#2a2720] hover:text-[#e6cfa0]"
                        title="Sao chép nội dung tin nhắn này"
                      >
                        {copiedMsgId === message.id ? (
                          <>
                            <Check size={isSolo ? 12 : 10} className="text-[#ddb968]" />
                            <span className="text-[#ddb968]">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy size={isSolo ? 12 : 10} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      {message.role === 'user' && onUndoTurn && (
                        <button
                          type="button"
                          onClick={() => onUndoTurn(message.id)}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#2a2720] hover:text-[#ddb968]"
                          title="Hoàn tác lệnh này, khôi phục file code đã sửa và đưa lệnh về ô nhập"
                        >
                          <Undo2 size={isSolo ? 12 : 10} />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ),
            )}
            <CommandApprovalList
              items={commandApprovals}
              large={isSolo}
              onApprove={onApproveCommand}
              onReject={onRejectCommand}
            />
          </div>
        </div>
      ) : (
        <AgentTerminal agent={agent} isSolo={isSolo} />
      )}

      <div
        className={`shrink-0 border-t border-[#2b2b2b] bg-[#181818] ${
          isSolo ? 'px-6 py-4' : 'p-2.5'
        }`}
      >
        <div
          className={`${isSolo ? 'mx-auto w-full max-w-5xl rounded-xl' : 'rounded-lg'} border bg-[#131313] transition ${
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
            <div className={`border-b border-[#2b2b2b] bg-[#1b1b1b] ${isSolo ? 'p-3.5' : 'p-2'}`}>
              <div
                className={`mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[#a3a3a3] ${
                  isSolo ? 'text-[11px]' : 'text-[8px]'
                }`}
              >
                <Mail size={isSolo ? 13 : 9} /> Dispatch prompt from {agent.name}
              </div>
              <div className="flex gap-2">
                <select
                  value={delegateTarget}
                  onChange={(event) => setDelegateTarget(event.target.value)}
                  className={`rounded border border-[#333333] bg-[#141414] text-[#cccccc] ${
                    isSolo ? 'w-40 px-2.5 py-2 text-[12.5px]' : 'w-28 px-1.5 text-[9px]'
                  }`}
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
                  className={`min-w-0 flex-1 rounded border border-[#333333] bg-[#101010] text-white outline-none ${
                    isSolo ? 'px-3 py-2 text-[13px]' : 'px-2 py-1.5 text-[9px]'
                  }`}
                />
                <button
                  onClick={() => {
                    onDelegate(delegateTarget, delegatePrompt)
                    setDelegatePrompt('')
                    setDelegationOpen(false)
                  }}
                  disabled={!delegatePrompt.trim() || !delegateTarget}
                  className={`grid place-items-center rounded bg-[#e5e5e5] text-[#111111] disabled:opacity-20 ${
                    isSolo ? 'size-9' : 'size-6'
                  }`}
                >
                  <Send size={isSolo ? 15 : 10} />
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
          {isCaptain && peers.length > 0 && (
            <div
              className={`flex items-center gap-1.5 border-b border-[#2a2417] bg-[#1a1710] text-[#e5cb8d] ${
                isSolo ? 'px-4 py-1.5 text-[12px]' : 'px-2.5 py-1 text-[9px]'
              }`}
            >
              <Crown size={isSolo ? 13 : 10} className="shrink-0" />
              <span className="truncate">
                Chế độ Đội trưởng: tự phân tích, lên kế hoạch &amp; gửi prompt cho cả nhóm (
                {peers.length} thành viên)
              </span>
            </div>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleAddImages(e.target.files)
              e.target.value = ''
            }}
          />
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-[#262626] p-2">
              {pendingImages.map((img) => (
                <div
                  key={img.id}
                  className="relative overflow-hidden rounded border border-[#444444] bg-[#101010]"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className={isSolo ? 'h-16 w-24 object-cover' : 'h-11 w-14 object-cover'}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPendingImages((prev) => prev.filter((item) => item.id !== img.id))
                    }
                    className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/80 text-white"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <HighlightedChatTextarea
            textareaRef={textareaRef}
            value={effectiveDraft}
            readOnly={Boolean(agent.composingPrompt)}
            rows={isSolo ? 3 : 2}
            size={isSolo ? 'lg' : 'sm'}
            mono={Boolean(agent.composingPrompt)}
            placeholder={
              isCaptain && peers.length > 0
                ? `Ra lệnh cho Đội trưởng ${agent.name}… (Ctrl+V dán ảnh Vision) — Đội trưởng sẽ tự phân tích, lập kế hoạch & gửi prompt cho cả nhóm`
                : `Message ${agent.name}… Ctrl+V dán ảnh Vision hoặc / cho skills`
            }
            onChange={(nextValue) => {
              onDraft(nextValue)
              setSlashIndex(0)
            }}
            onPasteImages={(imgs) => void handleAddImages(imgs)}
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
                triggerSend()
              }
            }}
          />
          <div
            className={`flex items-center justify-between ${
              isSolo ? 'px-3.5 pb-3 pt-1' : 'px-2 pb-1.5'
            }`}
          >
            <div className={`flex ${isSolo ? 'gap-2' : 'gap-1'}`}>
              <button
                className={`${
                  isSolo
                    ? 'grid size-9 place-items-center rounded-md text-[#b3b3b3] transition hover:bg-[#2a2a2a] hover:text-white'
                    : 'mini-button'
                } ${contextPickerOpen ? 'bg-[#2e2e2e] text-white' : ''}`}
                title="Add Context"
                onClick={() => {
                  setContextPickerOpen((prev) => !prev)
                  setDelegationOpen(false)
                }}
              >
                <Plus size={isSolo ? 18 : 11} />
              </button>
              <button
                type="button"
                className={`${
                  isSolo
                    ? 'grid size-9 place-items-center rounded-md text-[#b3b3b3] transition hover:bg-[#2a2a2a] hover:text-white'
                    : 'mini-button'
                } ${pendingImages.length > 0 ? 'bg-[#2e2e2e] text-white' : ''}`}
                title="Đính kèm ảnh / Screenshot (hoặc Ctrl+V)"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={isSolo ? 17 : 11} />
              </button>
              <button
                className={`${
                  isSolo
                    ? 'grid size-9 place-items-center rounded-md font-mono text-[16px] font-bold text-[#b3b3b3] transition hover:bg-[#2a2a2a] hover:text-white'
                    : 'mini-button font-mono text-[10px] font-semibold'
                }`}
                title="Invoke /skill, /mcp or /plugin"
                onClick={() => {
                  onDraft(`${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}/`)
                  setSlashIndex(0)
                }}
              >
                /
              </button>
              <button
                className={`${
                  isSolo
                    ? 'grid size-9 place-items-center rounded-md text-[#b3b3b3] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30'
                    : 'mini-button'
                } ${delegationOpen ? 'bg-[#2e2e2e] text-white' : ''}`}
                title="Dispatch prompt / delegate task to another agent"
                disabled={peers.length === 0}
                onClick={() => {
                  setDelegationOpen((current) => !current)
                  setContextPickerOpen(false)
                }}
              >
                <Mail size={isSolo ? 17 : 11} />
              </button>
              <div
                className="ml-1 flex items-center gap-1.5"
                title={`Context window ước tính: ~${contextMeter.usedTokens.toLocaleString()} / ${contextMeter.maxTokens.toLocaleString()} tokens (${contextMeter.percent}%)`}
              >
                <div className={`overflow-hidden rounded-full bg-[#262626] ${isSolo ? 'h-1.5 w-14' : 'h-1 w-9'}`}>
                  <div
                    className={`h-full transition-all ${
                      contextMeter.level === 'high'
                        ? 'bg-[#e06c75]'
                        : contextMeter.level === 'medium'
                          ? 'bg-[#c9a24d]'
                          : 'bg-[#6b8e6b]'
                    }`}
                    style={{ width: `${Math.max(4, contextMeter.percent)}%` }}
                  />
                </div>
                <span className={`font-mono text-[#8a8a8a] ${isSolo ? 'text-[10.5px]' : 'text-[8.5px]'}`}>
                  {contextMeter.percent}%
                </span>
                {onCompact && agent.messages.length >= 6 && (
                  <button
                    type="button"
                    onClick={onCompact}
                    className={`flex items-center gap-0.5 rounded border border-[#c9a24d]/35 bg-[#c9a24d]/10 text-[#e6cfa0] transition hover:bg-[#c9a24d]/20 hover:text-white ${
                      isSolo ? 'px-2 py-0.5 text-[10.5px]' : 'px-1 py-0.5 text-[8.5px]'
                    }`}
                    title="Nén các tin nhắn cũ thành tóm tắt để giải phóng context"
                  >
                    <Minimize2 size={isSolo ? 11 : 8} /> Compact
                  </button>
                )}
              </div>
            </div>
            {agent.status === 'running' || agent.status === 'reviewing' ? (
              <button
                onClick={onPause}
                className={`grid place-items-center rounded-md bg-[#3a3a3a] text-white hover:bg-[#4a4a4a] ${
                  isSolo ? 'size-9' : 'size-5 rounded'
                }`}
              >
                <Square size={isSolo ? 14 : 9} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={triggerSend}
                disabled={!effectiveDraft.trim() && pendingImages.length === 0}
                className={`grid place-items-center text-[#111111] transition disabled:opacity-20 ${
                  isSolo ? 'size-9 rounded-lg' : 'size-5 rounded'
                } ${
                  agent.composingPrompt
                    ? 'scale-110 bg-[#ddb968] shadow-[0_0_12px_rgba(201,162,77,0.45)]'
                    : 'bg-gradient-to-b from-[#d1ab59] to-[#a98336] hover:from-[#e0bc6c] hover:to-[#bc9542]'
                }`}
              >
                <Send size={isSolo ? 16 : 10} />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function AgentTerminal({ agent, isSolo = false }: { agent: Agent; isSolo?: boolean }) {
  return (
    <div
      className={`min-h-0 flex-1 overflow-y-auto bg-[#111111] font-mono text-[#9a9a9a] ${
        isSolo ? 'p-6 text-[13px] leading-[1.75]' : 'p-3 text-[10px] leading-[1.65]'
      }`}
    >
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
          <p
            className={`uppercase tracking-wider text-[#666666] ${
              isSolo ? 'text-[11px]' : 'text-[9px]'
            }`}
          >
            {message.role}
          </p>
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
