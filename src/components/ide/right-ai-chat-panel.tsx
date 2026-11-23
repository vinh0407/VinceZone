'use client'

import {
  Bot,
  FileCode2,
  Maximize2,
  Plus,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Agent, McpServerConfig, PluginConfig, WorkspaceFile } from './agent-types'
import {
  applySlashSelection,
  buildSlashCommands,
  extractActiveSlashQuery,
  SlashCommandPopover,
  type SkillIndexItem,
} from './slash-command-popover'

export function RightAiChatPanel({
  agents,
  selectedAgentId,
  drafts,
  files,
  activeFilePath,
  skills,
  mcpServers,
  plugins,
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
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  onSelectAgent: (id: string) => void
  onDraft: (id: string, value: string) => void
  onSend: (agent: Agent) => void
  onPause: (agent: Agent) => void
  onOpenFullAgents: () => void
  onClose: () => void
}) {
  const [contextOpen, setContextOpen] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const agent = agents.find((item) => item.id === selectedAgentId) ?? agents[0]
  const draft = agent ? (drafts[agent.id] ?? '') : ''
  const slashQuery = extractActiveSlashQuery(draft)
  const slashItems = useMemo(
    () =>
      slashQuery !== null ? buildSlashCommands(skills, mcpServers, plugins, slashQuery) : [],
    [mcpServers, plugins, skills, slashQuery],
  )

  if (!agent) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-[#2b2b2b] bg-[#181818] p-4 text-[11px] text-[#858585]">
        No AI agents in this project.
      </aside>
    )
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[#2b2b2b] bg-[#181818]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2b2b2b] px-3">
        <div className="flex items-center gap-1.5">
          {agent.roleId === 'pm' ? (
            <Sparkles size={13} className="text-[#e5e5e5]" />
          ) : (
            <Bot size={13} className="text-[#d4d4d4]" />
          )}
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#cccccc]">
            AI Agent Chat
          </span>
        </div>
        <div className="flex items-center gap-0.5">
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

      <div className="border-b border-[#2b2b2b] bg-[#141414] p-2.5">
        <label className="block text-[9px] font-medium uppercase tracking-wider text-[#858585]">
          Select AI Agent
        </label>
        <select
          value={agent.id}
          onChange={(event) => onSelectAgent(event.target.value)}
          className="mt-1 w-full rounded border border-[#333333] bg-[#1c1c1c] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#737373]"
        >
          {agents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} {item.roleId ? `(@${item.roleId.toUpperCase()})` : ''} · {item.model}
            </option>
          ))}
        </select>
        {(agent.soul || agent.mission) && (
          <div className="mt-2 space-y-0.5 text-[10px] leading-4 text-[#8f8f8f]">
            {agent.mission && (
              <p className="truncate" title={agent.mission}>
                <span className="text-[#cccccc]">Mission:</span> {agent.mission}
              </p>
            )}
            {agent.soul && (
              <p className="truncate" title={agent.soul}>
                <span className="text-[#cccccc]">Soul:</span> {agent.soul}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-[#161616] p-3">
        {agent.messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-2 text-[11px] leading-5 ${
                message.role === 'user'
                  ? 'bg-[#2a2a2a] text-white'
                  : message.role === 'tool'
                    ? 'border border-[#333333] bg-[#1c1c1c] text-[#a3a3a3]'
                    : 'border border-[#2b2b2b] bg-[#1e1e1e] text-[#d4d4d4]'
              }`}
            >
              {message.from && (
                <p className="mb-1 text-[9px] uppercase tracking-wider text-[#9a9a9a]">
                  {message.from} → {agent.name}
                </p>
              )}
              {message.text || <span className="streaming-dots">Generating</span>}
              {message.codeSnippet && (
                <pre className="mt-2 overflow-x-auto rounded border border-[#333333] bg-[#111111] p-2 font-mono text-[10px] text-[#e5e5e5]">
                  <code>{message.codeSnippet}</code>
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-[#2b2b2b] bg-[#181818] p-2.5">
        {activeFilePath && (
          <p className="mb-1.5 truncate font-mono text-[9px] text-[#858585]">
            Context: {activeFilePath}
          </p>
        )}
        <div className="rounded-lg border border-[#333333] bg-[#141414] focus-within:border-[#737373]">
          {slashQuery !== null && (
            <SlashCommandPopover
              query={slashQuery}
              skills={skills}
              mcpServers={mcpServers}
              plugins={plugins}
              selectedIndex={Math.min(slashIndex, Math.max(0, slashItems.length - 1))}
              onHoverIndex={setSlashIndex}
              onSelect={(command) => {
                onDraft(agent.id, applySlashSelection(draft, command))
                setSlashIndex(0)
              }}
            />
          )}
          {contextOpen && (
            <div className="max-h-32 overflow-y-auto border-b border-[#2b2b2b] p-1.5">
              {files.slice(0, 20).map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    onDraft(agent.id, `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}@${file.path} `)
                    setContextOpen(false)
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-[#cccccc] hover:bg-[#2a2a2a]"
                >
                  <FileCode2 size={11} className="shrink-0 text-[#9a9a9a]" />
                  <span className="truncate font-mono">{file.path}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            value={draft}
            onChange={(event) => {
              onDraft(agent.id, event.target.value)
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
                onSend(agent)
              }
            }}
            rows={3}
            placeholder={`Ask ${agent.name}… Type / for skills, MCP & plugins`}
            className="w-full resize-none bg-transparent px-2.5 pt-2 text-[11px] leading-4 text-white outline-none placeholder:text-[#6e6e6e]"
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setContextOpen((prev) => !prev)}
                className="mini-button"
                title="Attach @file reference"
              >
                <Plus size={12} />
              </button>
              <button
                onClick={() => {
                  onDraft(agent.id, `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}/`)
                  setSlashIndex(0)
                }}
                className="mini-button font-mono text-[11px] font-semibold"
                title="Invoke /skill, /mcp or /plugin"
              >
                /
              </button>
            </div>
            {agent.status === 'running' || agent.status === 'reviewing' ? (
              <button
                onClick={() => onPause(agent)}
                className="grid size-6 place-items-center rounded bg-[#3a3a3a] text-white"
                title="Stop generation"
              >
                <Square size={9} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => onSend(agent)}
                disabled={!draft.trim()}
                className="grid size-6 place-items-center rounded bg-[#e5e5e5] text-[#111111] hover:bg-white disabled:opacity-25"
                title="Send message"
              >
                <Send size={10} />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
