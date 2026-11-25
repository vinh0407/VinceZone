'use client'

import {
  ArrowRightLeft,
  BookMarked,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Download,
  History,
  ImagePlus,
  Link2,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Minimize2,
  Plus,
  Search,
  Send,
  Shield,
  Square,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePromptLibrary } from '@/hooks/use-prompt-library'
import type { BridgeMessage } from '@/lib/agent-bridge'
import { exportAgentChatToMarkdown } from '@/lib/chat-export'
import { copyTextToClipboard } from '@/lib/clipboard'
import { getCaptainAgent, getViceCaptainAgent } from '@/lib/command-hierarchy'
import { extractImagesFromFileList } from '@/lib/image-attachment'
import { estimateContextMeter } from '@/lib/project-rules'
import { inferRoleId, ROLE_TERRITORIES } from '@/lib/vincezone-protocol'
import type {
  Agent,
  ChatImageAttachment,
  ChatThreadSnapshot,
  CommandApprovalItem,
  McpServerConfig,
  PluginConfig,
  ProviderConfig,
  WorkspaceFile,
} from './agent-types'
import { ChatContextMenu } from './chat-context-menu'
import { CommandApprovalList } from './command-approval-card'
import { HighlightedChatText, HighlightedChatTextarea } from './highlighted-chat-input'
import { MarkdownReply } from './markdown-reply'
import { PromptLibraryPopover } from './prompt-library-popover'
import {
  applySlashSelection,
  buildSlashCommands,
  extractActiveSlashQuery,
  SlashCommandPopover,
  type SkillComboItem,
  type SkillIndexItem,
} from './slash-command-popover'

export function RightAiChatPanel({
  agents,
  selectedAgentId,
  drafts,
  files,
  activeFilePath,
  skills,
  combos = [],
  mcpServers,
  plugins,
  providers = [],
  width = 320,
  bridgeEnabled = true,
  bridgeMessages = [],
  commandApprovals = [],
  chatThreads = [],
  focusSeq = 0,
  autoRunCommands = false,
  onToggleAutoRunCommands,
  onApproveCommand,
  onRejectCommand,
  onAssignCaptain,
  onToggleViceCaptain,
  onNewThread,
  onSelectThread,
  onUndoTurn,
  onCompactAgent,
  onToggleBridge,
  onRelayToAgent,
  onChangeAgentModel,
  onSelectAgent,
  onDraft,
  onSend,
  onPause,
  onOpenFullAgents,
  onClose,
}: {
  agents: Agent[]
  selectedAgentId: string
  drafts: Record<string, string>
  files: WorkspaceFile[]
  activeFilePath?: string
  skills: SkillIndexItem[]
  combos?: SkillComboItem[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  providers?: ProviderConfig[]
  width?: number
  bridgeEnabled?: boolean
  bridgeMessages?: BridgeMessage[]
  commandApprovals?: CommandApprovalItem[]
  chatThreads?: ChatThreadSnapshot[]
  focusSeq?: number
  autoRunCommands?: boolean
  onToggleAutoRunCommands?: () => void
  onApproveCommand?: (id: string) => void
  onRejectCommand?: (id: string) => void
  onAssignCaptain?: (agentId: string) => void
  onToggleViceCaptain?: (agentId: string) => void
  onNewThread?: () => void
  onSelectThread?: (threadId: string) => void
  onUndoTurn?: (agentId: string, messageId: string) => void
  onCompactAgent?: (agentId: string) => void
  onToggleBridge?: () => void
  onRelayToAgent?: (fromAgentId: string, toAgentId: string, prompt: string) => void
  onChangeAgentModel?: (agentId: string, providerId: string, model: string) => void
  onSelectAgent: (id: string) => void
  onDraft: (id: string, value: string) => void
  onSend: (agent: Agent, images?: ChatImageAttachment[]) => void
  onPause: (agent: Agent) => void
  onOpenFullAgents: () => void
  onClose: () => void
}) {
  const [contextOpen, setContextOpen] = useState(false)
  const [promptLibOpen, setPromptLibOpen] = useState(false)
  const { prompts: promptTemplates, savePrompt, deletePrompt } = usePromptLibrary()
  const [bridgeDrawerOpen, setBridgeDrawerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelFilter, setModelFilter] = useState('')
  const [relayTargetId, setRelayTargetId] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [pendingImages, setPendingImages] = useState<ChatImageAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
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
    if (!agent) return
    const imgs = pendingImages
    if (!draft.trim() && imgs.length === 0) return
    stickToBottomRef.current = true
    setPendingImages([])
    onSend(agent, imgs.length > 0 ? imgs : undefined)
  }
  const captainAgent = getCaptainAgent(agents)
  const viceAgent = getViceCaptainAgent(agents)
  const agent = agents.find((item) => item.id === selectedAgentId) ?? captainAgent ?? agents[0]
  const isCaptain = Boolean(agent && captainAgent?.id === agent.id)
  const isVice = Boolean(agent && viceAgent?.id === agent.id)
  const peers = useMemo(
    () => agents.filter((item) => item.id !== agent?.id),
    [agents, agent?.id],
  )
  const draft = agent ? (drafts[agent.id] ?? '') : ''
  const slashQuery = extractActiveSlashQuery(draft)
  const slashItems = useMemo(
    () =>
      slashQuery !== null
        ? buildSlashCommands(skills, mcpServers, plugins, slashQuery, combos)
        : [],
    [combos, mcpServers, plugins, skills, slashQuery],
  )

  const providerModelChoices = useMemo(() => {
    const q = modelFilter.trim().toLowerCase()
    const list: Array<{ providerId: string; providerName: string; model: string }> = []
    for (const p of providers) {
      const models = (p.models || p.model || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
      for (const m of models) {
        if (
          !q ||
          m.toLowerCase().includes(q) ||
          (p.name || p.id).toLowerCase().includes(q)
        ) {
          list.push({ providerId: p.id, providerName: p.name || p.id, model: m })
        }
      }
    }
    return list
  }, [modelFilter, providers])

  const lastMsg = agent?.messages[agent.messages.length - 1]
  const lastMsgSignature = `${agent?.messages.length ?? 0}:${lastMsg?.id ?? ''}:${lastMsg?.text.length ?? 0}:${commandApprovals.length}`

  // Always jump directly to the latest message when opening or switching to an agent
  useLayoutEffect(() => {
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
  }, [agent?.id])

  // Follow new / streaming messages automatically when user is near the bottom
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lastMsgSignature])

  useEffect(() => {
    if (focusSeq > 0) {
      textareaRef.current?.focus()
    }
  }, [focusSeq])

  const contextMeter = useMemo(
    () => estimateContextMeter(agent?.messages ?? []),
    [agent?.messages],
  )

  if (!agent) {
    return (
      <aside
        style={{ width }}
        className="flex shrink-0 flex-col border-l border-[#2b2b2b] bg-[#181818] p-4 text-[11px] text-[#858585]"
      >
        No AI agents in this project.
      </aside>
    )
  }

  const effectiveRelayTarget = relayTargetId && peers.some((p) => p.id === relayTargetId)
    ? relayTargetId
    : peers[0]?.id || ''

  return (
    <aside
      style={{ width }}
      className="flex shrink-0 flex-col border-l border-[#2b2b2b] bg-[#181818]"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2b2b2b] px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setModelPickerOpen((prev) => !prev)
              setBridgeDrawerOpen(false)
            }}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition ${
              modelPickerOpen
                ? 'bg-[#e5e5e5] text-[#111111]'
                : 'border border-[#333333] bg-[#222222] text-white hover:border-[#666666] hover:bg-[#2c2c2c]'
            }`}
            title="Nhấp vào hình robot để đổi Model / Provider cho Agent này"
          >
            <Bot size={13} />
            <span className="max-w-[96px] truncate font-mono text-[9px] font-medium">
              {agent.model}
            </span>
          </button>
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#cccccc]">
            AI Agent Chat
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {onToggleAutoRunCommands && (
            <button
              type="button"
              onClick={onToggleAutoRunCommands}
              className={`mr-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold transition ${
                autoRunCommands
                  ? 'border-[#c9a24d]/60 bg-[#c9a24d]/20 text-[#f0d394]'
                  : 'border-[#333333] bg-[#202020] text-[#858585] hover:text-white'
              }`}
              title={
                autoRunCommands
                  ? 'Auto-Run ĐANG BẬT: AI Agent được phép tự chạy code, lệnh, skill & Git commit/push'
                  : 'Auto-Run ĐANG TẮT: Bấm để cho phép AI Agent tự chạy code/lệnh/Git mà không cần bấm Allow từng bước'
              }
            >
              {autoRunCommands ? 'Auto-Run ON' : 'Auto-Run'}
            </button>
          )}
          {(onNewThread || onSelectThread) && (
            <button
              type="button"
              className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${
                historyOpen
                  ? 'border-[#c9a24d]/60 bg-[#c9a24d]/20 text-[#f0d394]'
                  : 'border-[#333333] bg-[#202020] text-[#cccccc] hover:text-white'
              }`}
              title="Chat Menu — New Chat & Project Chat History"
              onClick={() => setHistoryOpen((prev) => !prev)}
            >
              <MessageSquare size={10} />
              <span>Chat</span>
              {chatThreads.length > 0 && (
                <span className="font-mono text-[8.5px] text-[#e6cfa0]">({chatThreads.length})</span>
              )}
              <ChevronDown
                size={10}
                className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          <button
            type="button"
            className="mini-button"
            title="Xuất đoạn chat này ra file Markdown (.md)"
            onClick={() => {
              const md = exportAgentChatToMarkdown(agent, activeFilePath || 'VinceZone Studio')
              const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `vincezone-chat-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
              document.body.appendChild(link)
              link.click()
              link.remove()
              URL.revokeObjectURL(url)
            }}
          >
            <Download size={12} />
          </button>
          <button
            className="mini-button"
            title="Open Full Multi-Agent Control Center"
            onClick={onOpenFullAgents}
          >
            <Maximize2 size={11} />
          </button>
          <button className="mini-button" title="Close AI Chat Panel" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
      </div>

      {historyOpen && (
        <div className="max-h-56 overflow-y-auto border-b border-[#333333] bg-[#141414] p-2">
          {onNewThread && (
            <button
              type="button"
              onClick={() => {
                onNewThread()
                setHistoryOpen(false)
              }}
              className="mb-2 flex w-full items-center gap-1.5 rounded border border-[#c9a24d]/40 bg-[#c9a24d]/15 px-2.5 py-1.5 text-left text-[10.5px] font-semibold text-[#f0d394] transition hover:bg-[#c9a24d]/25"
            >
              <Plus size={12} className="shrink-0" />
              <span>New Chat (Current Project)</span>
            </button>
          )}
          <div className="mb-1 flex items-center justify-between text-[9.5px] font-semibold uppercase text-[#a3a3a3]">
            <span>Project Chat History ({chatThreads.length})</span>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="mini-button"
            >
              <X size={10} />
            </button>
          </div>
          {chatThreads.length === 0 ? (
            <p className="py-1.5 text-[10px] text-[#737373]">
              No archived chats in this project yet. Click &ldquo;New Chat&rdquo; above to start a
              fresh session.
            </p>
          ) : (
            <div className="space-y-1">
              {chatThreads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelectThread?.(t.id)
                    setHistoryOpen(false)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-left text-[10px] text-[#cccccc] hover:border-[#4a4a4a] hover:text-white"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                  <span className="shrink-0 font-mono text-[8.5px] text-[#7a7a7a]">
                    {t.messageCount} msgs
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {modelPickerOpen && (
        <div className="border-b border-[#333333] bg-[#141414] p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-white">
              <Bot size={11} /> Đổi Model cho {agent.name}
            </span>
            <button
              type="button"
              onClick={() => setModelPickerOpen(false)}
              className="mini-button"
              title="Đóng"
            >
              <X size={11} />
            </button>
          </div>
          <div className="mb-1.5 flex items-center gap-1.5 rounded border border-[#2f2f2f] bg-[#101010] px-2 py-1">
            <Search size={11} className="shrink-0 text-[#737373]" />
            <input
              autoFocus
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder="Tìm model hoặc OmniRoute combo…"
              className="min-w-0 flex-1 bg-transparent text-[10px] text-white outline-none placeholder:text-[#666666]"
            />
          </div>
          <div className="max-h-44 space-y-0.5 overflow-y-auto">
            {providerModelChoices.length === 0 ? (
              <p className="px-2 py-2 text-[10px] text-[#737373]">
                Không tìm thấy model phù hợp. Mở Settings → Providers để đồng bộ.
              </p>
            ) : (
              providerModelChoices.map((choice) => {
                const isSelected =
                  agent.model === choice.model &&
                  (!agent.providerId || agent.providerId === choice.providerId)
                return (
                  <button
                    key={`${choice.providerId}:${choice.model}`}
                    type="button"
                    onClick={() => {
                      onChangeAgentModel?.(agent.id, choice.providerId, choice.model)
                      setModelPickerOpen(false)
                      setModelFilter('')
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[10px] transition ${
                      isSelected
                        ? 'bg-[#2e2e2e] font-semibold text-white'
                        : 'text-[#cccccc] hover:bg-[#222222] hover:text-white'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {isSelected ? (
                        <Check size={10} className="shrink-0 text-white" />
                      ) : (
                        <span className="inline-block size-2.5 shrink-0" />
                      )}
                      <span className="truncate font-mono">{choice.model}</span>
                    </span>
                    <span className="shrink-0 text-[9px] text-[#7a7a7a]">
                      {choice.providerName}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      <div className="border-b border-[#2b2b2b] bg-[#141414] p-2.5">
        <label className="block text-[9px] font-medium uppercase tracking-wider text-[#858585]">
          Select AI Agent
        </label>
        <select
          value={agent.id}
          onChange={(event) => onSelectAgent(event.target.value)}
          className="mt-1 w-full rounded border border-[#333333] bg-[#1c1c1c] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#737373]"
        >
          {agents.map((item) => {
            const rankTag =
              captainAgent?.id === item.id
                ? ' [Đội trưởng]'
                : viceAgent?.id === item.id
                  ? ' [Đội phó]'
                  : ''
            return (
              <option key={item.id} value={item.id}>
                {item.name}
                {rankTag} {item.roleId ? `(@${item.roleId.toUpperCase()})` : ''} · {item.model}
              </option>
            )
          })}
        </select>

        {/* Captain / Optional Vice Captain Quick Assignment Buttons */}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onAssignCaptain?.(agent.id)}
            className={`flex items-center justify-center gap-1 rounded border px-2 py-1 text-[9.5px] font-semibold transition ${
              isCaptain
                ? 'border-[#6b5629] bg-[#2e2614] text-[#f0d394]'
                : 'border-[#333333] bg-[#1a1a1a] text-[#a3a3a3] hover:border-[#6b5629] hover:text-[#f0d394]'
            }`}
            title="Gán Agent này làm Đội trưởng (ra lệnh, lên kế hoạch & tự gửi prompt cho cả nhóm)"
          >
            <Crown size={10} /> {isCaptain ? 'Đang là Đội trưởng' : 'Gán Đội trưởng'}
          </button>
          <button
            type="button"
            disabled={isCaptain}
            onClick={() => onToggleViceCaptain?.(agent.id)}
            className={`flex items-center justify-center gap-1 rounded border px-2 py-1 text-[9.5px] font-semibold transition disabled:opacity-30 ${
              isVice
                ? 'border-[#2e5770] bg-[#152733] text-[#9cdcfe]'
                : 'border-[#333333] bg-[#1a1a1a] text-[#a3a3a3] hover:border-[#2e5770] hover:text-[#9cdcfe]'
            }`}
            title={
              isCaptain
                ? 'Đội trưởng không cần kiêm Đội phó'
                : isVice
                  ? 'Bấm để Bỏ Đội phó (chỉ giữ 1 Đội trưởng)'
                  : 'Gán Agent này làm Đội phó (tùy chọn)'
            }
          >
            <Shield size={10} /> {isVice ? 'Bỏ Đội phó' : 'Gán Đội phó'}
          </button>
        </div>
        {isCaptain && peers.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-[9px] text-[#e5cb8d]">
            <Crown size={9} className="shrink-0" />
            <span>
              Đội trưởng sẽ tự phân tích, lên kế hoạch &amp; gửi prompt cho {peers.length} thành viên
            </span>
          </p>
        )}

        {/* Multi-Agent Communication Bridge Bar */}
        <div className="mt-2 flex items-center justify-between gap-1.5 rounded border border-[#2b2b2b] bg-[#181818] px-2 py-1">
          <button
            type="button"
            onClick={onToggleBridge}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold transition ${
              bridgeEnabled
                ? 'bg-[#e5e5e5] text-[#111111]'
                : 'border border-[#3a3a3a] text-[#858585]'
            }`}
            title="Toggle automatic Multi-Agent Communication Bridge (@ROLE handoffs & shared team bus)"
          >
            <Link2 size={10} />
            Bridge {bridgeEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => setBridgeDrawerOpen((prev) => !prev)}
            className="flex items-center gap-1 text-[9px] text-[#a3a3a3] hover:text-white"
            title="Inspect live inter-agent messages on the Communication Bridge"
          >
            <ArrowRightLeft size={10} />
            Bus ({bridgeMessages.length})
          </button>
        </div>

        {bridgeDrawerOpen && (
          <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto rounded border border-[#2b2b2b] bg-[#121212] p-2">
            {peers.length > 0 && onRelayToAgent && (
              <div className="flex items-center gap-1 border-b border-[#262626] pb-1.5">
                <select
                  value={effectiveRelayTarget}
                  onChange={(e) => setRelayTargetId(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-[#333333] bg-[#1b1b1b] px-1.5 py-0.5 text-[9px] text-[#e5e5e5] outline-none"
                >
                  {peers.map((peer) => {
                    const rid = peer.roleId ?? inferRoleId(`${peer.id} ${peer.role}`)
                    const code = rid === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[rid].code
                    return (
                      <option key={peer.id} value={peer.id}>
                        @{code} · {peer.name}
                      </option>
                    )
                  })}
                </select>
                <button
                  type="button"
                  disabled={!effectiveRelayTarget}
                  onClick={() => {
                    const textToSend =
                      draft.trim() ||
                      `Collaborate with ${agent.name} on ${activeFilePath || 'current task'} and report findings back.`
                    onRelayToAgent(agent.id, effectiveRelayTarget, textToSend)
                    if (draft.trim()) onDraft(agent.id, '')
                  }}
                  className="shrink-0 rounded bg-[#e5e5e5] px-2 py-0.5 text-[9px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                  title="Send current prompt across Bridge to selected teammate"
                >
                  Bridge →
                </button>
              </div>
            )}
            {bridgeMessages.length === 0 ? (
              <p className="text-[9px] text-[#737373]">
                No bridge messages yet. Type <span className="font-mono text-[#cccccc]">@BE</span>,{' '}
                <span className="font-mono text-[#cccccc]">@FE</span>,{' '}
                <span className="font-mono text-[#cccccc]">@QA</span> or click{' '}
                <span className="text-[#cccccc]">Bridge →</span> to connect agents.
              </p>
            ) : (
              [...bridgeMessages]
                .reverse()
                .slice(0, 12)
                .map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => onSelectAgent(msg.toAgentId)}
                    className="block w-full rounded border border-[#242424] bg-[#181818] px-2 py-1 text-left hover:border-[#4a4a4a]"
                  >
                    <div className="flex items-center justify-between gap-1 text-[9px]">
                      <span className="truncate font-semibold text-[#e5e5e5]">
                        @{msg.fromRole} → @{msg.toRole}
                      </span>
                      <span className="shrink-0 font-mono text-[8px] uppercase text-[#858585]">
                        {msg.kind}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[9px] text-[#a3a3a3]">{msg.content}</p>
                  </button>
                ))
            )}
          </div>
        )}

        {(agent.soul || agent.mission) && !bridgeDrawerOpen && (
          <div className="mt-2 space-y-0.5 text-[10px] leading-4 text-[#8f8f8f]">
            {agent.mission && (
              <p className="truncate" title={agent.mission}>
                <span className="text-[#cccccc]">Mission:</span> {agent.mission.split('\n')[0]}
              </p>
            )}
            {agent.soul && (
              <p className="truncate" title={agent.soul}>
                <span className="text-[#cccccc]">Soul:</span> {agent.soul.split('\n')[0]}
              </p>
            )}
          </div>
        )}
      </div>

      <div
        ref={messagesScrollRef}
        onScroll={(event) => {
          const el = event.currentTarget
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
        }}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-[#161616] p-3"
      >
        {agent.messages.map((message) => (
          <div
            key={message.id}
            className={`group flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`min-w-0 select-text rounded-lg px-3 py-2.5 ${
                message.role === 'user'
                  ? 'max-w-[90%] whitespace-pre-wrap bg-[#2a2a2a] text-[11px] leading-5 text-white'
                  : message.role === 'tool'
                    ? 'max-w-[96%] whitespace-pre-wrap border border-[#333333] bg-[#1c1c1c] text-[10.5px] leading-4 text-[#a3a3a3]'
                    : 'w-full max-w-[98%] border border-[#2b2b2b] bg-[#1b1b1b] text-[#d4d4d4]'
              }`}
            >
              {message.from && (
                <p className="mb-1.5 border-b border-[#2a2a2a] pb-1 text-[9px] font-semibold uppercase tracking-wider text-[#9a9a9a]">
                  {message.from} → {agent.name}
                </p>
              )}
              {message.images && message.images.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {message.images.map((img) => (
                    <img
                      key={img.id}
                      src={img.dataUrl}
                      alt={img.name}
                      className="max-h-28 max-w-[180px] rounded border border-[#444444] object-cover"
                    />
                  ))}
                </div>
              )}
              {message.text ? (
                message.role === 'user' || message.role === 'tool' ? (
                  <HighlightedChatText text={message.text} />
                ) : (
                  <MarkdownReply text={message.text} />
                )
              ) : (
                <span className="streaming-dots">Generating</span>
              )}
              {message.codeSnippet && (
                <pre className="mt-2 overflow-x-auto rounded border border-[#333333] bg-[#111111] p-2 font-mono text-[10px] text-[#e5e5e5]">
                  <code>{message.codeSnippet}</code>
                </pre>
              )}
            </div>
            {(message.role === 'user' || message.role === 'assistant') && message.text && (
              <div className="mt-1 flex items-center gap-1 px-0.5 text-[9.5px] text-[#8a8a8a] opacity-75 transition group-hover:opacity-100">
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
                      <Check size={10} className="text-[#ddb968]" />
                      <span className="text-[#ddb968]">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy size={10} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                {message.role === 'user' && onUndoTurn && (
                  <button
                    type="button"
                    onClick={() => onUndoTurn(agent.id, message.id)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#2a2720] hover:text-[#ddb968]"
                    title="Hoàn tác lệnh này, khôi phục file code đã sửa và đưa lệnh về ô nhập"
                  >
                    <Undo2 size={10} />
                    <span>Undo</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <CommandApprovalList
          items={commandApprovals.filter(
            (item) => item.agentId === agent.id || item.status === 'pending',
          )}
          onApprove={onApproveCommand}
          onReject={onRejectCommand}
        />
      </div>

      <div className="shrink-0 border-t border-[#2b2b2b] bg-[#181818] p-2.5">
        {activeFilePath && (
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <p className="truncate font-mono text-[9px] text-[#858585]">
              Context: {activeFilePath}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {[
                { label: 'Explain', prefix: 'Explain this code concisely: ' },
                { label: 'Refactor', prefix: 'Refactor cleanly with minimal diff: ' },
                { label: 'Fix', prefix: 'Find and fix any bugs here: ' },
              ].map((quick) => (
                <button
                  key={quick.label}
                  type="button"
                  onClick={() => {
                    onDraft(agent.id, `${quick.prefix}${draft || `@${activeFilePath}`}`)
                    textareaRef.current?.focus()
                  }}
                  className="rounded border border-[#2f2f2f] bg-[#141414] px-1.5 py-0.5 text-[9px] text-[#a3a3a3] hover:border-[#555555] hover:text-white"
                >
                  {quick.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer?.files?.length) {
              void handleAddImages(e.dataTransfer.files)
            }
          }}
          className={`rounded-lg border bg-[#141414] transition focus-within:border-[#737373] ${
            dragOver ? 'border-[#e5e5e5] ring-1 ring-white/30' : 'border-[#333333]'
          }`}
        >
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
            <div className="flex flex-wrap gap-1.5 border-b border-[#262626] p-2">
              {pendingImages.map((img) => (
                <div
                  key={img.id}
                  className="group relative overflow-hidden rounded border border-[#444444] bg-[#101010]"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="h-12 w-16 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPendingImages((prev) => prev.filter((item) => item.id !== img.id))
                    }
                    className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/80 text-white hover:bg-black"
                    title="Remove image"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
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
                onDraft(agent.id, applySlashSelection(draft, command))
                setSlashIndex(0)
                textareaRef.current?.focus()
              }}
            />
          )}
          {promptLibOpen && (
            <PromptLibraryPopover
              prompts={promptTemplates}
              currentDraft={draft}
              onInsert={(content) => {
                onDraft(agent.id, content)
                textareaRef.current?.focus()
              }}
              onSavePrompt={savePrompt}
              onDeletePrompt={deletePrompt}
              onClose={() => setPromptLibOpen(false)}
            />
          )}
          {contextOpen && (
            <ChatContextMenu
              files={files}
              agents={agents}
              skills={skills}
              combos={combos}
              mcpServers={mcpServers}
              plugins={plugins}
              onInsert={(token) => {
                const spacer = draft && !draft.endsWith(' ') && !draft.endsWith('\n') ? ' ' : ''
                onDraft(agent.id, `${draft}${spacer}${token} `)
                textareaRef.current?.focus()
              }}
              onClose={() => setContextOpen(false)}
            />
          )}
          <HighlightedChatTextarea
            textareaRef={textareaRef}
            value={draft}
            rows={3}
            size="md"
            placeholder={`Ask ${agent.name}… Ctrl+V dán ảnh Vision, @BE/@FE hoặc / skill`}
            onChange={(nextValue) => {
              onDraft(agent.id, nextValue)
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
                    onDraft(agent.id, applySlashSelection(draft, picked.command))
                    setSlashIndex(0)
                  }
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onDraft(agent.id, draft.replace(/(^|\s)\/[a-z0-9:._-]*$/i, '$1'))
                  return
                }
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                triggerSend()
              }
            }}
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setContextOpen((prev) => !prev)
                  setPromptLibOpen(false)
                }}
                className={`mini-button ${contextOpen ? 'bg-[#2e2e2e] text-white' : ''}`}
                title="Add Context"
              >
                <Plus size={12} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPromptLibOpen((prev) => !prev)
                  setContextOpen(false)
                }}
                className={`mini-button ${promptLibOpen ? 'bg-[#2e2e2e] text-[#ddb968]' : ''}`}
                title="Prompt Library (mẫu prompt tái sử dụng)"
              >
                <BookMarked size={12} />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className={`mini-button ${pendingImages.length > 0 ? 'bg-[#2e2e2e] text-white' : ''}`}
                title="Đính kèm ảnh / Screenshot (hoặc dán Ctrl+V)"
              >
                <ImagePlus size={12} />
              </button>
              <button
                onClick={() => {
                  onDraft(agent.id, `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}/`)
                  textareaRef.current?.focus()
                }}
                className="mini-button font-mono text-[11px]"
                title="Insert / slash command (skills, MCP, plugins)"
              >
                /
              </button>
              <button
                onClick={() => {
                  onDraft(agent.id, `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}@`)
                  textareaRef.current?.focus()
                }}
                className="mini-button font-mono text-[11px]"
                title="Mention @errors, @git, @terminal, @url: or @ROLE"
              >
                @
              </button>
              <div
                className="ml-1 flex items-center gap-1.5"
                title={`Context window ước tính: ~${contextMeter.usedTokens.toLocaleString()} / ${contextMeter.maxTokens.toLocaleString()} tokens (${contextMeter.percent}%)`}
              >
                <div className="h-1.5 w-11 overflow-hidden rounded-full bg-[#262626]">
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
                <span className="font-mono text-[9.5px] text-[#8a8a8a]">
                  {contextMeter.percent}%
                </span>
                {onCompactAgent && agent.messages.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => onCompactAgent(agent.id)}
                    className="flex items-center gap-0.5 rounded border border-[#c9a24d]/35 bg-[#c9a24d]/10 px-1.5 py-0.5 text-[9.5px] text-[#e6cfa0] transition hover:bg-[#c9a24d]/20 hover:text-white"
                    title="Nén các tin nhắn cũ thành tóm tắt để giải phóng context window"
                  >
                    <Minimize2 size={9} /> Compact
                  </button>
                )}
              </div>
            </div>
            {agent.status === 'running' ? (
              <button
                onClick={() => onPause(agent)}
                className="flex size-6 items-center justify-center rounded bg-[#333333] text-[#f48771] hover:bg-[#444444]"
                title="Stop generation"
              >
                <Square size={10} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={triggerSend}
                disabled={!draft.trim() && pendingImages.length === 0}
                className="flex size-6 items-center justify-center rounded bg-gradient-to-b from-[#d1ab59] to-[#a98336] text-[#111111] shadow-[0_1px_6px_rgba(201,162,77,0.25)] transition hover:from-[#e0bc6c] hover:to-[#bc9542] disabled:opacity-30"
                title="Send message (Enter)"
              >
                <Send size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
