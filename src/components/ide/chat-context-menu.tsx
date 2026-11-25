'use client'

import {
  ChevronLeft,
  FileCode2,
  Folder,
  Globe,
  HardDrive,
  Paperclip,
  Search,
  Slash,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { ROLE_TERRITORIES } from '@/lib/vincezone-protocol'
import type { Agent, McpServerConfig, PluginConfig, WorkspaceFile } from './agent-types'
import {
  buildSlashCommands,
  type SkillComboItem,
  type SkillIndexItem,
} from './slash-command-popover'

type ContextCategory = 'root' | 'files' | 'folder' | 'mentions' | 'actions' | 'browser' | 'drive'

export function ChatContextMenu({
  files,
  agents,
  skills,
  combos = [],
  mcpServers,
  plugins,
  onInsert,
  onClose,
}: {
  files: WorkspaceFile[]
  agents: Agent[]
  skills: SkillIndexItem[]
  combos?: SkillComboItem[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  onInsert: (token: string) => void
  onClose: () => void
}) {
  const [category, setCategory] = useState<ContextCategory>('root')
  const [filter, setFilter] = useState('')
  const [browserUrl, setBrowserUrl] = useState('https://')
  const [driveUrl, setDriveUrl] = useState('')
  const diskFileInputRef = useRef<HTMLInputElement>(null)
  const driveFileInputRef = useRef<HTMLInputElement>(null)

  const folders = useMemo(() => {
    const set = new Set<string>()
    for (const file of files) {
      const normalized = file.path.replace(/\\/g, '/')
      const parts = normalized.split('/')
      let acc = ''
      for (let i = 0; i < parts.length - 1; i += 1) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i]
        set.add(acc)
      }
    }
    return [...set].sort()
  }, [files])

  const filteredFiles = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = q
      ? files.filter(
          (f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
        )
      : files
    return list.slice(0, 40)
  }, [files, filter])

  const filteredFolders = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = q ? folders.filter((d) => d.toLowerCase().includes(q)) : folders
    return list.slice(0, 40)
  }, [folders, filter])

  const mentionItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const activeRoles = agents.map((a) => ({
      token: a.roleId ? `@${a.roleId.toUpperCase()}` : `@${a.name}`,
      label: a.name,
      detail: a.model,
    }))
    const standardRoles = Object.values(ROLE_TERRITORIES)
      .filter((r) => !activeRoles.some((a) => a.token === `@${r.code}`))
      .map((r) => ({
        token: `@${r.code}`,
        label: r.title,
        detail: r.recommendedModel,
      }))
    const all = [...activeRoles, ...standardRoles]
    return q
      ? all.filter(
          (item) =>
            item.token.toLowerCase().includes(q) || item.label.toLowerCase().includes(q),
        )
      : all
  }, [agents, filter])

  const actionItems = useMemo(
    () => buildSlashCommands(skills, mcpServers, plugins, filter, combos).slice(0, 30),
    [combos, filter, mcpServers, plugins, skills],
  )

  const handleDiskFilesPicked = async (
    event: React.ChangeEvent<HTMLInputElement>,
    prefix: 'file' | 'drive',
  ) => {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!picked.length) return
    const refs: string[] = []
    for (const file of picked.slice(0, 5)) {
      const label = prefix === 'drive' ? `@drive:${file.name}` : `@${file.name}`
      try {
        if (file.size <= 32_000) {
          const text = await file.text()
          refs.push(`${label}\n\`\`\`\n${text.slice(0, 4000)}\n\`\`\``)
        } else {
          refs.push(label)
        }
      } catch {
        refs.push(label)
      }
    }
    onInsert(refs.join('\n'))
    onClose()
  }

  const rootItems: Array<{
    id: Exclude<ContextCategory, 'root'>
    label: string
    icon: typeof Paperclip
  }> = [
    { id: 'files', label: 'Files', icon: Paperclip },
    { id: 'folder', label: 'Folder', icon: Folder },
    { id: 'mentions', label: 'Mentions', icon: Users },
    { id: 'actions', label: 'Actions', icon: Slash },
    { id: 'browser', label: 'Browser', icon: Globe },
    { id: 'drive', label: 'Drive', icon: HardDrive },
  ]

  return (
    <div className="border-b border-[#2b2b2b] bg-[#181818] p-1.5 text-[11px] text-[#e5e5e5]">
      <input
        ref={diskFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleDiskFilesPicked(e, 'file')}
      />
      <input
        ref={driveFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleDiskFilesPicked(e, 'drive')}
      />

      <div className="mb-1 flex items-center justify-between px-1.5 py-0.5">
        <div className="flex items-center gap-1">
          {category !== 'root' && (
            <button
              type="button"
              onClick={() => {
                setCategory('root')
                setFilter('')
              }}
              className="rounded p-0.5 text-[#a3a3a3] hover:bg-[#2a2a2a] hover:text-white"
              title="Back to Add Context"
            >
              <ChevronLeft size={12} />
            </button>
          )}
          <span className="text-[11px] font-medium text-[#a3a3a3]">
            {category === 'root'
              ? 'Add Context'
              : category === 'files'
                ? 'Add Context · Files'
                : category === 'folder'
                  ? 'Add Context · Folder'
                  : category === 'mentions'
                    ? 'Add Context · Mentions'
                    : category === 'actions'
                      ? 'Add Context · Actions'
                      : category === 'browser'
                        ? 'Add Context · Browser'
                        : 'Add Context · Drive'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-[#737373] hover:bg-[#2a2a2a] hover:text-white"
          title="Close"
        >
          <X size={11} />
        </button>
      </div>

      {category === 'root' && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1 border-b border-[#262626] px-1 pb-1.5">
            {[
              { token: '@errors', label: '@errors', title: 'Đính kèm lỗi IDE Problems hiện tại' },
              { token: '@git', label: '@git', title: 'Đính kèm git status & commits mới nhất' },
              { token: '@terminal', label: '@terminal', title: 'Đính kèm output Terminal gần nhất' },
              { token: '@semantic:', label: '@semantic:', title: 'Tìm code theo ngữ nghĩa trong toàn dự án' },
              { token: '@url:https://', label: '@url:', title: 'Tải nội dung tài liệu từ URL' },
            ].map((chip) => (
              <button
                key={chip.token}
                type="button"
                title={chip.title}
                onClick={() => {
                  onInsert(chip.token)
                  onClose()
                }}
                className="rounded border border-[#c9a24d]/35 bg-[#c9a24d]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#e6cfa0] transition hover:border-[#c9a24d]/70 hover:bg-[#c9a24d]/20 hover:text-white"
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="space-y-0.5">
            {rootItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setCategory(item.id)
                    setFilter('')
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] text-[#e5e5e5] transition hover:bg-[#2a2a2a] hover:text-white"
                >
                  {item.id === 'mentions' ? (
                    <span className="grid size-4 place-items-center font-mono text-[13px] font-medium text-[#b5b5b5]">
                      @
                    </span>
                  ) : item.id === 'actions' ? (
                    <span className="grid size-4 place-items-center rounded border border-[#737373] font-mono text-[10px] font-semibold text-[#d4d4d4]">
                      /
                    </span>
                  ) : (
                    <Icon size={14} className="shrink-0 text-[#b5b5b5]" />
                  )}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(category === 'files' ||
        category === 'folder' ||
        category === 'mentions' ||
        category === 'actions') && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded border border-[#2f2f2f] bg-[#121212] px-2 py-1">
          <Search size={11} className="shrink-0 text-[#737373]" />
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={
              category === 'files'
                ? 'Search workspace files…'
                : category === 'folder'
                  ? 'Search folders…'
                  : category === 'mentions'
                    ? 'Search @ROLE agents…'
                    : 'Search /skill, /combo, /mcp, /plugin…'
            }
            className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-[#666666]"
          />
        </div>
      )}

      {category === 'files' && (
        <div className="max-h-44 space-y-0.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => diskFileInputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] font-medium text-white hover:bg-[#2a2a2a]"
          >
            <Upload size={11} className="shrink-0 text-[#cccccc]" />
            <span>Attach file from computer…</span>
          </button>
          {filteredFiles.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => {
                onInsert(`@${file.path}`)
                onClose()
              }}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white"
            >
              <FileCode2 size={11} className="shrink-0 text-[#9a9a9a]" />
              <span className="truncate font-mono">{file.path}</span>
            </button>
          ))}
        </div>
      )}

      {category === 'folder' && (
        <div className="max-h-44 space-y-0.5 overflow-y-auto">
          {filteredFolders.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-[#737373]">No folders found.</p>
          ) : (
            filteredFolders.map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => {
                  onInsert(`@folder:${dir}`)
                  onClose()
                }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white"
              >
                <Folder size={11} className="shrink-0 text-[#a3a3a3]" />
                <span className="truncate font-mono">{dir}/</span>
              </button>
            ))
          )}
        </div>
      )}

      {category === 'mentions' && (
        <div className="max-h-44 space-y-0.5 overflow-y-auto">
          {mentionItems.map((item) => (
            <button
              key={`${item.token}-${item.label}`}
              type="button"
              onClick={() => {
                onInsert(item.token)
                onClose()
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[10px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white"
            >
              <span className="truncate">
                <strong className="font-mono text-white">{item.token}</strong> · {item.label}
              </span>
              <span className="shrink-0 font-mono text-[9px] text-[#737373]">{item.detail}</span>
            </button>
          ))}
        </div>
      )}

      {category === 'actions' && (
        <div className="max-h-44 space-y-0.5 overflow-y-auto">
          {actionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onInsert(item.command)
                onClose()
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[10px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white"
            >
              <span className="truncate font-mono font-bold text-white">{item.command}</span>
              <span className="shrink-0 rounded bg-[#262626] px-1 py-0.5 font-mono text-[8px] text-[#a3a3a3]">
                {item.badge}
              </span>
            </button>
          ))}
        </div>
      )}

      {category === 'browser' && (
        <div className="space-y-2 p-1">
          <p className="text-[10px] text-[#9d9d9d]">
            Attach a web page or localhost URL for the agent to inspect:
          </p>
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={browserUrl}
              onChange={(e) => setBrowserUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && browserUrl.trim()) {
                  e.preventDefault()
                  onInsert(`@url:${browserUrl.trim()}`)
                  onClose()
                }
              }}
              placeholder="https://example.com/docs"
              className="min-w-0 flex-1 rounded border border-[#333333] bg-[#101010] px-2 py-1 text-[10px] text-white outline-none focus:border-[#737373]"
            />
            <button
              type="button"
              disabled={!browserUrl.trim()}
              onClick={() => {
                onInsert(`@url:${browserUrl.trim()}`)
                onClose()
              }}
              className="rounded bg-[#e5e5e5] px-2.5 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {category === 'drive' && (
        <div className="space-y-2 p-1">
          <button
            type="button"
            onClick={() => driveFileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-[#3a3a3a] bg-[#222222] py-1.5 text-[10px] font-medium text-white hover:bg-[#2e2e2e]"
          >
            <HardDrive size={11} /> Pick files from Local Drive…
          </button>
          <div className="flex gap-1.5">
            <input
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && driveUrl.trim()) {
                  e.preventDefault()
                  onInsert(`@drive:${driveUrl.trim()}`)
                  onClose()
                }
              }}
              placeholder="Or paste Google Drive / cloud file link…"
              className="min-w-0 flex-1 rounded border border-[#333333] bg-[#101010] px-2 py-1 text-[10px] text-white outline-none focus:border-[#737373]"
            />
            <button
              type="button"
              disabled={!driveUrl.trim()}
              onClick={() => {
                onInsert(`@drive:${driveUrl.trim()}`)
                onClose()
              }}
              className="rounded bg-[#e5e5e5] px-2.5 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
