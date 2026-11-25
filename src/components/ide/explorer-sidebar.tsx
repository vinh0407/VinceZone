'use client'

import {
  Archive,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  History,
  Minus,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildFileTree, searchWorkspaceFiles, type FileTreeItem } from '@/lib/file-tree'
import { extractSymbolsFromSource } from '@/lib/symbol-outline'
import type {
  Agent,
  AgentTask,
  EditRevision,
  MemoryNote,
  SidePanel,
  WorkspaceFile,
} from './agent-types'
import { ContextMenu, type ContextMenuItem } from './context-menu'
import { fileIcon } from './workspace-defaults'

const statusStyles: Record<AgentTask['status'], { dot: string; label: string }> = {
  planned: { dot: 'bg-[#a3a3a3]', label: 'ASSIGNED' },
  'awaiting-approval': { dot: 'bg-[#d4d4d4]', label: 'APPROVAL' },
  running: { dot: 'bg-[#f5f5f5]', label: 'IN_PROGRESS' },
  completed: { dot: 'bg-[#8f8f8f]', label: 'COMPLETED' },
  failed: { dot: 'bg-[#f48771]', label: 'FAILED' },
  blocked: { dot: 'bg-[#737373]', label: 'BLOCKED' },
}

export function ExplorerSidebar({
  sidePanel,
  width = 256,
  projectName,
  rootPath,
  files,
  activePath,
  agentTasks,
  agents,
  revisions,
  memoryNotes,
  collapsedGroups,
  searchQuery,
  compactMode,
  onSearchQueryChange,
  onReplaceInFiles,
  onToggleGroup,
  onOpenFile,
  onOpenLocalDirectory,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
  onRestoreRevision,
  onAddMemoryNote,
  onDeleteMemoryNote,
  onCollapse,
  onRefresh,
  onOpenSettings,
  onOpenAgents,
  onOpenDiff,
  onOpenGitDiff,
  onCopyRelativePath,
  onAddFileToChat,
  onRevealInExplorer,
  onGitBranchChanged,
  onRequestConfirm,
  provider,
}: {
  sidePanel: SidePanel
  width?: number
  projectName: string
  rootPath?: string
  files: WorkspaceFile[]
  activePath: string
  agentTasks: AgentTask[]
  agents: Agent[]
  revisions: EditRevision[]
  memoryNotes: MemoryNote[]
  collapsedGroups: Record<string, boolean>
  searchQuery: string
  compactMode: boolean
  onSearchQueryChange: (query: string) => void
  onReplaceInFiles?: (
    query: string,
    replacement: string,
    options: { caseSensitive: boolean; regex: boolean },
  ) => { filesUpdated: number; occurrences: number }
  onToggleGroup: (key: string) => void
  onOpenFile: (path: string, line?: number) => void
  onOpenLocalDirectory: () => void
  onCreateFile?: () => void
  onCreateFolder?: () => void
  onRenameFile?: (path: string) => void
  onDeleteFile?: (path: string) => void
  onRestoreRevision: (revisionId: string) => void
  onAddMemoryNote: (title: string, content: string) => void
  onDeleteMemoryNote: (id: string) => void
  onCollapse: () => void
  onRefresh: () => void
  onOpenSettings: () => void
  onOpenAgents: () => void
  onOpenDiff: () => void
  onOpenGitDiff?: (path: string) => void
  onCopyRelativePath?: (path: string) => void
  onAddFileToChat?: (path: string) => void
  onRevealInExplorer?: (path: string) => void
  onGitBranchChanged?: (branch: string, branches: string[]) => void
  onRequestConfirm?: (opts: {
    title: string
    description?: string
    confirmLabel?: string
    danger?: boolean
    onConfirm: () => void
  }) => void
  provider?: { baseUrl?: string; apiKey?: string; model?: string }
}) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false)
  const [searchRegex, setSearchRegex] = useState(false)
  const [searchIncludeGlob, setSearchIncludeGlob] = useState('')
  const [searchExcludeGlob, setSearchExcludeGlob] = useState('')
  const [diskSearchResults, setDiskSearchResults] = useState<
    Array<{ path: string; name: string; line: number; preview: string }> | null
  >(null)
  const [diskSearchStats, setDiskSearchStats] = useState<{ scanned: number; loading: boolean }>({
    scanned: 0,
    loading: false,
  })
  const [replaceText, setReplaceText] = useState('')
  const [replaceFeedback, setReplaceFeedback] = useState('')
  const [collapsedSearchFiles, setCollapsedSearchFiles] = useState<Record<string, boolean>>({})
  const [expandedMemoryAgents, setExpandedMemoryAgents] = useState<Record<string, boolean>>({})
  const [treeContextMenu, setTreeContextMenu] = useState<{
    x: number
    y: number
    path: string
    isFolder: boolean
  } | null>(null)
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('feat/')
  const [outlineOpen, setOutlineOpen] = useState(true)

  const activeFileObj = useMemo(
    () => files.find((f) => f.path === activePath),
    [files, activePath],
  )
  const outlineSymbols = useMemo(
    () =>
      activeFileObj && activeFileObj.content
        ? extractSymbolsFromSource(activeFileObj.path, activeFileObj.content)
        : [],
    [activeFileObj],
  )

  // 2A: Disk Search API across all 5,000 files (including lazy files!) when workspace is on disk
  useEffect(() => {
    if (sidePanel !== 'search') return
    const q = searchQuery.trim()
    if (!q || !rootPath) {
      setDiskSearchResults(null)
      setDiskSearchStats({ scanned: 0, loading: false })
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setDiskSearchStats((prev) => ({ ...prev, loading: true }))
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            action: 'search',
            root: rootPath,
            query: q,
            caseSensitive: searchCaseSensitive,
            regex: searchRegex,
            includeGlob: searchIncludeGlob,
            excludeGlob: searchExcludeGlob,
          }),
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          ok?: boolean
          matches?: Array<{ path: string; line: number; preview: string }>
          totalFilesScanned?: number
        }
        if (data.ok && Array.isArray(data.matches)) {
          setDiskSearchResults(
            data.matches.map((m) => ({
              ...m,
              name: m.path.split('/').pop() || m.path,
            })),
          )
          setDiskSearchStats({ scanned: data.totalFilesScanned ?? 0, loading: false })
        }
      } catch {
        setDiskSearchStats((prev) => ({ ...prev, loading: false }))
      }
    }, 240)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [
    rootPath,
    searchCaseSensitive,
    searchExcludeGlob,
    searchIncludeGlob,
    searchQuery,
    searchRegex,
    sidePanel,
  ])

  const memorySearchMatches = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return []
    if (!searchCaseSensitive && !searchRegex) {
      return searchWorkspaceFiles(files, q)
    }
    const matches: Array<{ path: string; name: string; line: number; preview: string }> = []
    let compiled: RegExp | null = null
    if (searchRegex) {
      try {
        compiled = new RegExp(q, searchCaseSensitive ? '' : 'i')
      } catch {
        return []
      }
    }
    for (const file of files) {
      const lines = file.content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i += 1) {
        const lineText = lines[i]
        const hit = compiled
          ? compiled.test(lineText)
          : searchCaseSensitive
            ? lineText.includes(q)
            : lineText.toLowerCase().includes(q.toLowerCase())
        if (hit) {
          matches.push({
            path: file.path,
            name: file.name,
            line: i + 1,
            preview: lineText.trim().slice(0, 120),
          })
          if (matches.length >= 160) return matches
        }
      }
    }
    return matches
  }, [files, searchCaseSensitive, searchQuery, searchRegex])

  const searchMatches = diskSearchResults ?? memorySearchMatches

  const groupedSearchMatches = useMemo(() => {
    const map = new Map<
      string,
      { path: string; name: string; hits: Array<{ line: number; preview: string }> }
    >()
    for (const match of searchMatches) {
      const group = map.get(match.path) ?? { path: match.path, name: match.name, hits: [] }
      group.hits.push({ line: match.line, preview: match.preview })
      map.set(match.path, group)
    }
    return Array.from(map.values())
  }, [searchMatches])
  const dirtyFiles = useMemo(() => files.filter((file) => file.dirty), [files])
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [memTitle, setMemTitle] = useState('')
  const [memContent, setMemContent] = useState('')

  // Real Git GUI state
  const [gitLoading, setGitLoading] = useState(false)
  const [gitBusyAction, setGitBusyAction] = useState(false)
  const [gitCommitMessage, setGitCommitMessage] = useState('')
  const [gitFeedback, setGitFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [gitStatus, setGitStatus] = useState<{
    isRepo: boolean
    branch: string
    branches?: string[]
    stashes?: Array<{ ref: string; message: string }>
    conflicts?: string[]
    ahead: number
    behind: number
    changes: Array<{
      path: string
      indexStatus: string
      worktreeStatus: string
      staged: boolean
      conflicted?: boolean
    }>
    commits: Array<{ hash: string; subject: string; author: string; relativeTime: string }>
    error?: string
  } | null>(null)
  const [aiCommitLoading, setAiCommitLoading] = useState(false)

  const loadGitStatus = useCallback(async () => {
    setGitLoading(true)
    try {
      const query = rootPath ? `?root=${encodeURIComponent(rootPath)}` : ''
      const response = await fetch(`/api/git${query}`, { cache: 'no-store' })
      if (!response.ok) {
        setGitStatus({
          isRepo: false,
          branch: 'detached',
          ahead: 0,
          behind: 0,
          changes: [],
          commits: [],
          error: `Git API HTTP ${response.status}`,
        })
        return
      }
      const data = await response.json()
      setGitStatus(data)
      if (data?.isRepo && data.branch) {
        onGitBranchChanged?.(data.branch, data.branches ?? [])
      }
    } catch (error) {
      setGitStatus({
        isRepo: false,
        branch: 'detached',
        ahead: 0,
        behind: 0,
        changes: [],
        commits: [],
        error: error instanceof Error ? error.message : 'Unable to reach /api/git.',
      })
    } finally {
      setGitLoading(false)
    }
  }, [rootPath])

  useEffect(() => {
    if (sidePanel === 'git') {
      void loadGitStatus()
    }
  }, [sidePanel, loadGitStatus])

  const runGitAction = useCallback(
    async (
      action:
        | 'stage'
        | 'stage-all'
        | 'unstage'
        | 'commit'
        | 'push'
        | 'pull'
        | 'fetch'
        | 'checkout'
        | 'create-branch'
        | 'stash-push'
        | 'stash-pop'
        | 'resolve-conflict'
        | 'discard',
      extra?: { path?: string; message?: string; branch?: string; strategy?: 'ours' | 'theirs' | 'both' },
    ) => {
      setGitBusyAction(true)
      setGitFeedback(null)
      try {
        const response = await fetch('/api/git', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, root: rootPath, ...extra }),
        })
        const data = (await response.json()) as { ok?: boolean; output?: string; error?: string }
        if (!response.ok || !data.ok) {
          setGitFeedback({ ok: false, text: data.error || `Git ${action} failed.` })
        } else {
          if (action === 'commit') setGitCommitMessage('')
          setGitFeedback({
            ok: true,
            text:
              action === 'commit'
                ? 'Committed cleanly.'
                : data.output || `${action} succeeded.`,
          })
          await loadGitStatus()
          if (
            action === 'discard' ||
            action === 'pull' ||
            action === 'checkout' ||
            action === 'stash-pop' ||
            action === 'resolve-conflict'
          ) {
            onRefresh()
          }
        }
      } catch (error) {
        setGitFeedback({
          ok: false,
          text: error instanceof Error ? error.message : 'Git action failed.',
        })
      } finally {
        setGitBusyAction(false)
      }
    },
    [loadGitStatus, onRefresh, rootPath],
  )

  const visibleTasks = showAllTasks ? agentTasks : agentTasks.slice(-4)
  const completedCount = agentTasks.filter((task) => task.status === 'completed').length

  const renderTreeItem = (item: FileTreeItem, depth: number) => {
    const indentPx = 10 + depth * 12
    if (item.type === 'folder') {
      const collapsed = Boolean(collapsedGroups[item.path])
      return (
        <div key={item.path}>
          <button
            onClick={() => onToggleGroup(item.path)}
            onContextMenu={(event) => {
              event.preventDefault()
              setTreeContextMenu({
                x: event.clientX,
                y: event.clientY,
                path: item.path,
                isFolder: true,
              })
            }}
            style={{ paddingLeft: `${indentPx}px` }}
            className="flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[12px] text-[#cccccc] hover:bg-[#2a2d2e]"
          >
            {collapsed ? (
              <ChevronRight size={13} className="shrink-0 text-[#858585]" />
            ) : (
              <ChevronDown size={13} className="shrink-0 text-[#858585]" />
            )}
            <Folder size={14} className="shrink-0 text-[#d4a76a]" />
            <span className="truncate">{item.name}</span>
          </button>
          {!collapsed && item.children.map((child) => renderTreeItem(child, depth + 1))}
        </div>
      )
    }

    return (
      <div
        key={item.path}
        onContextMenu={(event) => {
          event.preventDefault()
          setTreeContextMenu({
            x: event.clientX,
            y: event.clientY,
            path: item.path,
            isFolder: false,
          })
        }}
        style={{ paddingLeft: `${indentPx + 14}px` }}
        className={`group flex w-full items-center gap-1 pr-1.5 text-[12px] ${
          compactMode ? 'py-[3px]' : 'py-1'
        } ${
          activePath === item.path
            ? 'border-l-2 border-[#c9a24d] bg-[#c9a24d]/12 text-[#f5e7c4]'
            : 'text-[#cccccc] hover:bg-[#24211b]'
        }`}
      >
        <button
          onClick={() => onOpenFile(item.path)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {fileIcon(item.file)}
          <span className="truncate">{item.name}</span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {onRenameFile && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRenameFile(item.path)
              }}
              className="hidden rounded p-0.5 text-[#858585] hover:bg-[#333333] hover:text-white group-hover:inline-flex"
              title="Rename file"
            >
              <Pencil size={11} />
            </button>
          )}
          {onDeleteFile && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onDeleteFile(item.path)
              }}
              className="hidden rounded p-0.5 text-[#858585] hover:bg-[#333333] hover:text-[#f48771] group-hover:inline-flex"
              title="Delete file"
            >
              <Trash2 size={11} />
            </button>
          )}
          {item.file.dirty && (
            <span className="pl-0.5 font-mono text-[10px] font-semibold text-[#e5e5e5]">M</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <aside
      style={{ width }}
      className="flex shrink-0 flex-col border-r border-[#2b2b2b] bg-[#181818]"
    >
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#bbbbbb]">
          {sidePanel === 'explorer'
            ? 'Explorer'
            : sidePanel === 'search'
              ? 'Search'
              : sidePanel === 'revisions'
                ? 'Edit Memory'
                : sidePanel === 'memory'
                  ? 'Memory'
                  : 'Source Control'}
        </span>
        <div className="flex gap-0.5">
          {sidePanel === 'explorer' && (
            <>
              {onCreateFile && (
                <button className="mini-button" title="New File" onClick={onCreateFile}>
                  <FilePlus size={12} />
                </button>
              )}
              {onCreateFolder && (
                <button className="mini-button" title="New Folder" onClick={onCreateFolder}>
                  <FolderPlus size={12} />
                </button>
              )}
              <button
                className="mini-button"
                title="Open Local Folder from Disk"
                onClick={onOpenLocalDirectory}
              >
                <FolderOpen size={13} />
              </button>
            </>
          )}
          <button
            className="mini-button"
            title={sidePanel === 'git' ? 'Refresh Git Status' : 'Refresh from Disk'}
            onClick={() => {
              if (sidePanel === 'git') void loadGitStatus()
              else onRefresh()
            }}
          >
            <RefreshCw size={12} className={sidePanel === 'git' && gitLoading ? 'animate-spin' : ''} />
          </button>
          <button className="mini-button" title="Collapse Side Bar" onClick={onCollapse}>
            <PanelLeftClose size={13} />
          </button>
          <button className="mini-button" title="Settings" onClick={onOpenSettings}>
            <MoreHorizontal size={13} />
          </button>
        </div>
      </div>

      {sidePanel === 'explorer' && (
        <div className="flex min-h-0 flex-1 flex-col border-y border-[#2b2b2b]">
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <button
              onClick={() => onToggleGroup('__root')}
              className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wide text-[#cccccc] hover:bg-[#2a2d2e]"
              title={rootPath || projectName}
            >
              {collapsedGroups.__root ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              <span className="truncate">{projectName}</span>
              {rootPath && (
                <span className="ml-auto rounded bg-[#262626] px-1 text-[9px] font-normal lowercase text-[#a3a3a3]">
                  disk
                </span>
              )}
            </button>
            {!collapsedGroups.__root &&
              (tree.length > 0 ? (
                tree.map((item) => renderTreeItem(item, 0))
              ) : (
                <p className="px-3 py-2 text-[11px] text-[#858585]">No files loaded.</p>
              ))}
          </div>
          <div className="shrink-0 border-t border-[#2b2b2b] bg-[#161616]">
            <button
              type="button"
              onClick={() => setOutlineOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#b5b5b5] hover:bg-[#232323] hover:text-white"
            >
              <span className="flex items-center gap-1">
                {outlineOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Outline
              </span>
              <span className="rounded bg-[#262626] px-1 font-mono text-[9px] text-[#9a9a9a]">
                {outlineSymbols.length}
              </span>
            </button>
            {outlineOpen && (
              <div className="max-h-40 overflow-y-auto px-1 pb-1.5">
                {outlineSymbols.length === 0 ? (
                  <p className="px-2 py-1 text-[10px] text-[#6e6e6e]">
                    {activeFileObj ? 'No symbols detected in file.' : 'Open a file to inspect Outline.'}
                  </p>
                ) : (
                  outlineSymbols.slice(0, 80).map((sym) => (
                    <button
                      key={`${sym.name}:${sym.line}`}
                      type="button"
                      onClick={() => onOpenFile(sym.path, sym.line)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[10.5px] text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white"
                      title={sym.signature}
                    >
                      <span className="shrink-0 rounded border border-[#c9a24d]/30 bg-[#c9a24d]/10 px-1 font-mono text-[8.5px] uppercase text-[#e6cfa0]">
                        {sym.kind.slice(0, 3)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono">{sym.name}</span>
                      <span className="shrink-0 font-mono text-[9px] text-[#737373]">
                        :{sym.line}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {sidePanel === 'search' && (
        <div className="flex min-h-0 flex-1 flex-col border-y border-[#2b2b2b] p-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 rounded border border-[#3c3c3c] bg-[#222222] px-2 py-1 focus-within:border-[#737373]">
              <Search size={12} className="shrink-0 text-[#858585]" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => {
                  onSearchQueryChange(event.target.value)
                  setReplaceFeedback('')
                }}
                placeholder="Search across files..."
                className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-[#858585]"
              />
              <button
                type="button"
                onClick={() => setSearchCaseSensitive((v) => !v)}
                className={`rounded px-1 font-mono text-[10px] ${
                  searchCaseSensitive ? 'bg-[#e5e5e5] text-[#111111]' : 'text-[#858585] hover:text-white'
                }`}
                title="Match Case (Aa)"
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => setSearchRegex((v) => !v)}
                className={`rounded px-1 font-mono text-[10px] ${
                  searchRegex ? 'bg-[#e5e5e5] text-[#111111]' : 'text-[#858585] hover:text-white'
                }`}
                title="Use Regular Expression (.*)"
              >
                .*
              </button>
              {searchQuery && (
                <button
                  onClick={() => onSearchQueryChange('')}
                  className="text-[#858585] hover:text-white"
                  title="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {onReplaceInFiles && (
              <div className="flex items-center gap-1">
                <input
                  value={replaceText}
                  onChange={(event) => setReplaceText(event.target.value)}
                  placeholder="Replace with..."
                  className="min-w-0 flex-1 rounded border border-[#333333] bg-[#1a1a1a] px-2 py-1 text-[11px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-[#737373]"
                />
                <button
                  type="button"
                  disabled={!searchQuery.trim() || searchMatches.length === 0}
                  onClick={async () => {
                    if (rootPath) {
                      const res = await fetch('/api/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'replace',
                          root: rootPath,
                          query: searchQuery,
                          replacement: replaceText,
                          caseSensitive: searchCaseSensitive,
                          regex: searchRegex,
                          includeGlob: searchIncludeGlob,
                          excludeGlob: searchExcludeGlob,
                        }),
                      }).catch(() => null)
                      if (res?.ok) {
                        const data = (await res.json()) as {
                          filesUpdated?: number
                          occurrences?: number
                        }
                        setReplaceFeedback(
                          `Disk replaced ${data.occurrences ?? 0} match(es) in ${data.filesUpdated ?? 0} file(s).`,
                        )
                        onRefresh()
                        return
                      }
                    }
                    const outcome = onReplaceInFiles(searchQuery, replaceText, {
                      caseSensitive: searchCaseSensitive,
                      regex: searchRegex,
                    })
                    setReplaceFeedback(
                      `Replaced ${outcome.occurrences} match(es) in ${outcome.filesUpdated} file(s) (REV saved).`,
                    )
                  }}
                  className="shrink-0 rounded bg-[#e5e5e5] px-2 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-35"
                  title="Replace all matches across workspace (including lazy disk files)"
                >
                  Replace All
                </button>
              </div>
            )}
            {rootPath && (
              <div className="grid grid-cols-2 gap-1">
                <input
                  value={searchIncludeGlob}
                  onChange={(e) => setSearchIncludeGlob(e.target.value)}
                  placeholder="Include (*.ts)"
                  className="min-w-0 rounded border border-[#2c2c2c] bg-[#121212] px-1.5 py-1 font-mono text-[9.5px] text-[#cccccc] outline-none placeholder:text-[#666666] focus:border-[#555555]"
                />
                <input
                  value={searchExcludeGlob}
                  onChange={(e) => setSearchExcludeGlob(e.target.value)}
                  placeholder="Exclude (*.test.ts)"
                  className="min-w-0 rounded border border-[#2c2c2c] bg-[#121212] px-1.5 py-1 font-mono text-[9.5px] text-[#cccccc] outline-none placeholder:text-[#666666] focus:border-[#555555]"
                />
              </div>
            )}
            {replaceFeedback && (
              <p className="rounded bg-[#1f1f1f] px-2 py-1 text-[10px] text-[#e5e5e5]">
                {replaceFeedback}
              </p>
            )}
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {!searchQuery.trim() ? (
              <p className="text-[11px] leading-4 text-[#858585]">
                Disk Search &amp; Replace across {files.length} workspace file{files.length === 1 ? '' : 's'} (including lazy files).
              </p>
            ) : diskSearchStats.loading ? (
              <p className="text-[11px] text-[#a3a3a3]">Scanning workspace disk…</p>
            ) : groupedSearchMatches.length === 0 ? (
              <p className="text-[11px] text-[#858585]">
                No matches for &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="mb-1.5 text-[10px] text-[#858585]">
                  {searchMatches.length} result{searchMatches.length === 1 ? '' : 's'} in{' '}
                  {groupedSearchMatches.length} file{groupedSearchMatches.length === 1 ? '' : 's'}
                  {diskSearchStats.scanned > 0 ? ` · ${diskSearchStats.scanned} disk files` : ''}
                </p>
                {groupedSearchMatches.map((group) => {
                  const collapsed = Boolean(collapsedSearchFiles[group.path])
                  return (
                    <div key={group.path} className="rounded border border-[#242424] bg-[#141414]">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedSearchFiles((prev) => ({
                            ...prev,
                            [group.path]: !prev[group.path],
                          }))
                        }
                        className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-medium text-[#e5e5e5] hover:bg-[#222222]"
                        title={group.path}
                      >
                        {collapsed ? (
                          <ChevronRight size={11} className="shrink-0 text-[#858585]" />
                        ) : (
                          <ChevronDown size={11} className="shrink-0 text-[#858585]" />
                        )}
                        <span className="truncate">{group.name}</span>
                        <span className="ml-auto rounded bg-[#262626] px-1 font-mono text-[9px] text-[#a3a3a3]">
                          {group.hits.length}
                        </span>
                      </button>
                      {!collapsed && (
                        <div className="border-t border-[#202020] py-0.5">
                          {group.hits.map((hit, idx) => (
                            <button
                              key={`${group.path}:${hit.line}:${idx}`}
                              onClick={() => onOpenFile(group.path, hit.line)}
                              className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left font-mono text-[10px] text-[#a3a3a3] hover:bg-[#262626] hover:text-white"
                            >
                              <span className="shrink-0 text-[#737373]">:{hit.line}</span>
                              <span className="truncate">{hit.preview}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {sidePanel === 'git' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-y border-[#2b2b2b] p-2.5">
          <div className="mb-2 flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <GitBranch size={12} className="shrink-0 text-[#d4d4d4]" />
              {gitStatus?.branches && gitStatus.branches.length > 0 ? (
                <select
                  value={gitStatus.branch}
                  disabled={gitBusyAction}
                  onChange={(e) => void runGitAction('checkout', { branch: e.target.value })}
                  className="min-w-0 flex-1 truncate rounded border border-[#333333] bg-[#141414] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5] outline-none"
                  title="Switch Git branch"
                >
                  {gitStatus.branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="truncate font-mono text-[11px] font-semibold text-[#e5e5e5]">
                  {gitStatus?.branch || 'git'}
                </span>
              )}
              {gitStatus?.isRepo && (
                <button
                  type="button"
                  disabled={gitBusyAction}
                  onClick={() => {
                    setNewBranchName('feat/')
                    setNewBranchOpen((prev) => !prev)
                  }}
                  className="mini-button shrink-0"
                  title="Create new branch (git checkout -b)"
                >
                  <Plus size={11} />
                </button>
              )}
            </div>
            {gitStatus?.isRepo && (
              <span className="shrink-0 rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] text-[#a3a3a3]">
                ↑{gitStatus.ahead} ↓{gitStatus.behind}
              </span>
            )}
          </div>

          {newBranchOpen && gitStatus?.isRepo && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const trimmed = newBranchName.trim()
                if (!trimmed) return
                setNewBranchOpen(false)
                void runGitAction('create-branch', { branch: trimmed })
              }}
              className="mb-2 flex items-center gap-1 rounded border border-[#3e3e3e] bg-[#141414] p-1"
            >
              <input
                type="text"
                autoFocus
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setNewBranchOpen(false)
                }}
                placeholder="feat/new-branch"
                className="min-w-0 flex-1 bg-transparent px-1 font-mono text-[10px] text-white outline-none"
              />
              <button
                type="submit"
                disabled={!newBranchName.trim()}
                className="rounded bg-[#e5e5e5] px-1.5 py-0.5 text-[10px] font-medium text-[#111111] hover:bg-white disabled:opacity-40"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setNewBranchOpen(false)}
                className="mini-button"
              >
                <X size={10} />
              </button>
            </form>
          )}

          {gitStatus?.isRepo ? (
            <>
              <div className="mb-2.5 space-y-1.5 rounded border border-[#2b2b2b] bg-[#141414] p-2">
                <textarea
                  rows={2}
                  value={gitCommitMessage}
                  onChange={(event) => setGitCommitMessage(event.target.value)}
                  placeholder="Commit message (e.g. feat: upgrade editor)…"
                  className="w-full resize-none rounded border border-[#333333] bg-[#1b1b1b] px-2 py-1 text-[11px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-[#737373]"
                />
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    disabled={gitBusyAction || !gitCommitMessage.trim()}
                    onClick={() => void runGitAction('commit', { message: gitCommitMessage.trim() })}
                    className="flex flex-1 items-center justify-center gap-1 rounded bg-[#e5e5e5] py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-35"
                  >
                    <Check size={11} /> Commit
                  </button>
                  <button
                    type="button"
                    disabled={aiCommitLoading}
                    onClick={async () => {
                      setAiCommitLoading(true)
                      try {
                        const res = await fetch('/api/git', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'ai-commit-message',
                            root: rootPath,
                            baseUrl: provider?.baseUrl,
                            apiKey: provider?.apiKey,
                            model: provider?.model,
                          }),
                        })
                        const data = (await res.json()) as {
                          ok?: boolean
                          message?: string
                          error?: string
                        }
                        if (data.ok && data.message) {
                          setGitCommitMessage(data.message)
                          setGitFeedback({ ok: true, text: 'AI generated commit message.' })
                        } else {
                          setGitFeedback({
                            ok: false,
                            text: data.error || 'Could not generate commit message.',
                          })
                        }
                      } finally {
                        setAiCommitLoading(false)
                      }
                    }}
                    className="flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#222222] px-2 py-1 text-[10px] text-[#e5e5e5] hover:bg-[#2d2d2d] disabled:opacity-35"
                    title="AI tạo Commit Message tự động từ git diff"
                  >
                    <Sparkles size={10} className={aiCommitLoading ? 'animate-spin' : ''} /> AI
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    disabled={gitBusyAction}
                    onClick={() => void runGitAction('pull')}
                    className="flex items-center justify-center gap-1 rounded border border-[#333333] bg-[#1e1e1e] py-1 text-[9.5px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white disabled:opacity-35"
                    title="git pull --ff-only"
                  >
                    <Download size={10} /> Pull
                  </button>
                  <button
                    type="button"
                    disabled={gitBusyAction}
                    onClick={() => void runGitAction('push')}
                    className="flex items-center justify-center gap-1 rounded border border-[#333333] bg-[#1e1e1e] py-1 text-[9.5px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white disabled:opacity-35"
                    title="git push"
                  >
                    <Upload size={10} /> Push
                  </button>
                  <button
                    type="button"
                    disabled={gitBusyAction}
                    onClick={() => void runGitAction('stash-push')}
                    className="flex items-center justify-center gap-1 rounded border border-[#333333] bg-[#1e1e1e] py-1 text-[9.5px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white disabled:opacity-35"
                    title="git stash push"
                  >
                    <Archive size={10} /> Stash
                  </button>
                  <button
                    type="button"
                    disabled={gitBusyAction || !(gitStatus.stashes?.length)}
                    onClick={() => void runGitAction('stash-pop')}
                    className="flex items-center justify-center gap-1 rounded border border-[#333333] bg-[#1e1e1e] py-1 text-[9.5px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                    title={`git stash pop (${gitStatus.stashes?.length ?? 0} stashed)`}
                  >
                    Pop{gitStatus.stashes?.length ? ` (${gitStatus.stashes.length})` : ''}
                  </button>
                </div>
                {gitFeedback && (
                  <p
                    className={`rounded px-1.5 py-1 text-[10px] ${
                      gitFeedback.ok
                        ? 'bg-[#1f1f1f] text-[#e5e5e5]'
                        : 'bg-[#2a1414] text-[#f48771]'
                    }`}
                  >
                    {gitFeedback.text}
                  </p>
                )}
              </div>

              {gitStatus.conflicts && gitStatus.conflicts.length > 0 && (
                <div className="mb-3 rounded border border-[#6e2e2e] bg-[#241414] p-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#f48771]">
                    Merge Conflicts ({gitStatus.conflicts.length})
                  </p>
                  <div className="space-y-1.5">
                    {gitStatus.conflicts.map((cPath) => (
                      <div key={cPath} className="rounded bg-[#181010] p-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenFile(cPath)}
                          className="block w-full truncate text-left font-mono text-[10px] text-white hover:underline"
                        >
                          {cPath}
                        </button>
                        <div className="mt-1 grid grid-cols-3 gap-1">
                          {(['ours', 'theirs', 'both'] as const).map((strategy) => (
                            <button
                              key={strategy}
                              type="button"
                              disabled={gitBusyAction}
                              onClick={() =>
                                void runGitAction('resolve-conflict', { path: cPath, strategy })
                              }
                              className="rounded border border-[#444444] bg-[#262626] py-0.5 text-[9px] font-medium capitalize text-[#e5e5e5] hover:bg-[#383838]"
                            >
                              {strategy === 'ours'
                                ? 'Current'
                                : strategy === 'theirs'
                                  ? 'Incoming'
                                  : 'Both'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const staged = gitStatus.changes.filter((item) => item.staged)
                const unstaged = gitStatus.changes.filter(
                  (item) =>
                    !item.staged ||
                    (item.worktreeStatus && item.worktreeStatus !== ' ' && item.worktreeStatus !== '?'),
                )
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#9d9d9d]">
                        <span>Staged Changes</span>
                        <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] text-[#d4d4d4]">
                          {staged.length}
                        </span>
                      </div>
                      {staged.length === 0 ? (
                        <p className="text-[10px] text-[#737373]">No staged files.</p>
                      ) : (
                        <div className="space-y-0.5">
                          {staged.map((item) => (
                            <div
                              key={`staged-${item.path}`}
                              className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[#e5e5e5] hover:bg-[#222222]"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenGitDiff ? onOpenGitDiff(item.path) : onOpenFile(item.path)
                                }
                                className="min-w-0 flex-1 truncate text-left font-mono text-[10px]"
                                title="Mở Monaco Side-by-Side Diff (HEAD vs hiện tại)"
                              >
                                {item.path}
                              </button>
                              {onOpenGitDiff && (
                                <button
                                  type="button"
                                  onClick={() => onOpenGitDiff(item.path)}
                                  className="rounded p-0.5 text-[#858585] hover:bg-[#333333] hover:text-white"
                                  title="Side-by-Side Diff"
                                >
                                  <GitCompareArrows size={10} />
                                </button>
                              )}
                              <span className="font-mono text-[9px] text-[#a3a3a3]">
                                {item.indexStatus}
                              </span>
                              <button
                                type="button"
                                disabled={gitBusyAction}
                                onClick={() => void runGitAction('unstage', { path: item.path })}
                                className="rounded p-0.5 text-[#9d9d9d] hover:bg-[#333333] hover:text-white"
                                title="Unstage"
                              >
                                <Minus size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#9d9d9d]">
                        <span>Changes ({unstaged.length})</span>
                        {unstaged.length > 0 && (
                          <button
                            type="button"
                            disabled={gitBusyAction}
                            onClick={() => void runGitAction('stage-all')}
                            className="rounded border border-[#3a3a3a] px-1.5 py-0.5 text-[9px] font-normal normal-case text-[#d4d4d4] hover:bg-[#2a2a2a]"
                          >
                            Stage All
                          </button>
                        )}
                      </div>
                      {unstaged.length === 0 ? (
                        <p className="text-[10px] text-[#737373]">Working tree clean.</p>
                      ) : (
                        <div className="space-y-0.5">
                          {unstaged.map((item) => (
                            <div
                              key={`work-${item.path}`}
                              className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[#cccccc] hover:bg-[#222222]"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenGitDiff ? onOpenGitDiff(item.path) : onOpenFile(item.path)
                                }
                                className="min-w-0 flex-1 truncate text-left font-mono text-[10px]"
                                title="Mở Monaco Side-by-Side Diff (HEAD vs hiện tại)"
                              >
                                {item.path}
                              </button>
                              {onOpenGitDiff && (
                                <button
                                  type="button"
                                  onClick={() => onOpenGitDiff(item.path)}
                                  className="rounded p-0.5 text-[#858585] hover:bg-[#333333] hover:text-white"
                                  title="Side-by-Side Diff"
                                >
                                  <GitCompareArrows size={10} />
                                </button>
                              )}
                              <span className="font-mono text-[9px] text-[#e2c08d]">
                                {item.worktreeStatus === '?' ? 'U' : item.worktreeStatus || 'M'}
                              </span>
                              <button
                                type="button"
                                disabled={gitBusyAction}
                                onClick={() => void runGitAction('stage', { path: item.path })}
                                className="rounded p-0.5 text-[#9d9d9d] hover:bg-[#333333] hover:text-white"
                                title="Stage file"
                              >
                                <Plus size={11} />
                              </button>
                              {item.worktreeStatus !== '?' && (
                                <button
                                  type="button"
                                  disabled={gitBusyAction}
                                  onClick={() => {
                                    if (onRequestConfirm) {
                                      onRequestConfirm({
                                        title: 'Discard Uncommitted Changes',
                                        description: `Revert all local changes in "${item.path}"? This cannot be undone.`,
                                        confirmLabel: 'Discard',
                                        danger: true,
                                        onConfirm: () =>
                                          void runGitAction('discard', { path: item.path }),
                                      })
                                    } else {
                                      void runGitAction('discard', { path: item.path })
                                    }
                                  }}
                                  className="rounded p-0.5 text-[#858585] hover:bg-[#333333] hover:text-[#f48771]"
                                  title="Discard changes"
                                >
                                  <RotateCcw size={10} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {gitStatus.commits.length > 0 && (
                      <div className="border-t border-[#2b2b2b] pt-2">
                        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#9d9d9d]">
                          <GitCommitHorizontal size={11} /> Recent Commits
                        </p>
                        <div className="space-y-1">
                          {gitStatus.commits.slice(0, 6).map((commit) => (
                            <div
                              key={commit.hash}
                              className="rounded border border-[#262626] bg-[#141414] px-2 py-1.5 text-[10px]"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono text-[9px] text-[#e5e5e5]">
                                  {commit.hash}
                                </span>
                                <span className="text-[9px] text-[#737373]">
                                  {commit.relativeTime}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[#cccccc]">{commit.subject}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-[#858585]">
                {gitLoading
                  ? 'Reading Git repository...'
                  : gitStatus?.error || 'Not a Git repository.'}
              </p>
              {dirtyFiles.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase text-[#9d9d9d]">
                    Unsaved Editor Buffers ({dirtyFiles.length})
                  </p>
                  {dirtyFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => onOpenFile(file.path)}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-[#cccccc] hover:bg-[#2a2d2e]"
                    >
                      {fileIcon(file)}
                      <span className="truncate">{file.path}</span>
                      <span className="ml-auto font-mono text-[#e2c08d]">M</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onOpenDiff}
            className="mt-4 w-full rounded border border-[#3c3c3c] bg-[#252526] py-1.5 text-[11px] text-[#cccccc] hover:bg-[#2a2d2e]"
          >
            Open Agent Diff Review
          </button>
        </div>
      )}

      {sidePanel === 'memory' && (
        <div className="flex min-h-0 flex-1 flex-col border-y border-[#2b2b2b] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
              <Brain size={12} /> Project Memory
            </span>
            <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] text-[#d4d4d4]">
              {memoryNotes.length}
            </span>
          </div>
          <div className="mb-2.5 space-y-1.5 rounded border border-[#2b2b2b] bg-[#141414] p-2">
            <input
              value={memTitle}
              onChange={(event) => setMemTitle(event.target.value)}
              placeholder="Memory title (e.g. API rule)…"
              className="w-full rounded border border-[#333333] bg-[#1b1b1b] px-2 py-1 text-[11px] text-white outline-none placeholder:text-[#6e6e6e]"
            />
            <textarea
              value={memContent}
              onChange={(event) => setMemContent(event.target.value)}
              rows={2}
              placeholder="Persistent rule, architecture fact, or agent note…"
              className="w-full resize-none rounded border border-[#333333] bg-[#1b1b1b] px-2 py-1 text-[11px] text-white outline-none placeholder:text-[#6e6e6e]"
            />
            <button
              disabled={!memTitle.trim() || !memContent.trim()}
              onClick={() => {
                onAddMemoryNote(memTitle.trim(), memContent.trim())
                setMemTitle('')
                setMemContent('')
              }}
              className="flex w-full items-center justify-center gap-1 rounded bg-[#e5e5e5] py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-30"
            >
              <Plus size={11} /> Save to Memory
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {memoryNotes.map((note) => (
              <div
                key={note.id}
                className="rounded border border-[#2b2b2b] bg-[#141414] p-2 text-[10px]"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-semibold text-[#e5e5e5]">{note.title}</span>
                  <button
                    onClick={() => onDeleteMemoryNote(note.id)}
                    className="text-[#6e6e6e] hover:text-[#f48771]"
                    title="Delete memory note"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap leading-4 text-[#a3a3a3]">{note.content}</p>
              </div>
            ))}
            <div className="pt-2">
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#858585]">
                Agent Role Memory
              </p>
              {agents.map((agent) => {
                const isExpanded = Boolean(expandedMemoryAgents[agent.id])
                return (
                  <div
                    key={agent.id}
                    className="mb-1.5 rounded border border-[#2b2b2b] bg-[#141414] p-2 text-[10px]"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMemoryAgents((prev) => ({
                          ...prev,
                          [agent.id]: !prev[agent.id],
                        }))
                      }
                      className="flex w-full items-center justify-between gap-1 text-left"
                    >
                      <span className="truncate font-semibold text-[#d4d4d4]">
                        {agent.name} {agent.roleId ? `(@${agent.roleId.toUpperCase()})` : ''}
                      </span>
                      <span className="shrink-0 font-mono text-[8px] uppercase text-[#737373]">
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </span>
                    </button>
                    {agent.soul && (
                      <p
                        className={`mt-1 text-[#8f8f8f] ${
                          isExpanded ? 'whitespace-pre-wrap leading-4' : 'line-clamp-2'
                        }`}
                      >
                        <span className="font-medium text-[#bbbbbb]">Soul:</span>{' '}
                        {isExpanded ? `\n${agent.soul}` : agent.soul.split('\n')[0]}
                      </p>
                    )}
                    {agent.mission && (
                      <p
                        className={`mt-1 text-[#8f8f8f] ${
                          isExpanded ? 'whitespace-pre-wrap leading-4' : 'line-clamp-2'
                        }`}
                      >
                        <span className="font-medium text-[#bbbbbb]">Mission:</span>{' '}
                        {isExpanded ? `\n${agent.mission}` : agent.mission.split('\n')[0]}
                      </p>
                    )}
                    {agent.memory && (
                      <p
                        className={`mt-1 text-[#8f8f8f] ${
                          isExpanded ? 'whitespace-pre-wrap leading-4' : 'line-clamp-2'
                        }`}
                      >
                        <span className="font-medium text-[#bbbbbb]">Role Memory:</span>{' '}
                        {isExpanded ? `\n${agent.memory}` : agent.memory.split('\n')[0]}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {sidePanel === 'revisions' && (
        <div className="min-h-0 flex-1 overflow-y-auto border-y border-[#2b2b2b] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9d9d9d]">
              Edit Memory Snapshots
            </span>
            <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] text-[#d4d4d4]">
              {revisions.length}
            </span>
          </div>
          {revisions.length === 0 ? (
            <p className="rounded border border-[#2b2b2b] bg-[#141414] p-2.5 text-[11px] leading-4 text-[#858585]">
              No revisions yet. Saving a file or applying an agent patch automatically records
              REV-001, REV-002… for instant rollback.
            </p>
          ) : (
            <div className="space-y-1.5">
              {[...revisions].reverse().map((rev) => (
                <div
                  key={rev.id}
                  className="rounded border border-[#2b2b2b] bg-[#141414] p-2 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-semibold text-[#e5e5e5]">
                      {rev.id}
                    </span>
                    <span className="text-[9px] text-[#858585]">
                      {rev.timestamp.slice(11, 19)}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-[#cccccc]">{rev.path}</p>
                  <p className="mt-0.5 truncate text-[10px] text-[#858585]">
                    {rev.actor} · {rev.summary}
                  </p>
                  <button
                    onClick={() => onRestoreRevision(rev.id)}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-[#3c3c3c] bg-[#242424] py-1 text-[10px] text-[#d4d4d4] hover:border-[#737373] hover:text-white"
                  >
                    <RotateCcw size={10} /> Restore before {rev.id}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sidePanel === 'explorer' && (
        <div className="shrink-0 border-t border-[#2b2b2b] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={onOpenAgents}
              className="text-[10px] font-semibold uppercase tracking-wider text-[#bbbbbb] hover:text-white"
            >
              Task Registry
            </button>
            <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[9px] text-[#d4d4d4]">
              {completedCount}/{agentTasks.length}
            </span>
          </div>
          {visibleTasks.length === 0 ? (
            <p className="rounded border border-[#2b2b2b] bg-[#141414] p-2 text-[10px] leading-4 text-[#858585]">
              Central PM Task Registry empty. Open Agent Control Center to delegate work.
            </p>
          ) : (
            <div className="space-y-1.5">
              {visibleTasks.map((task) => {
                const style = statusStyles[task.status]
                const assignee = agents.find((agent) => agent.id === task.assigneeId)
                return (
                  <button
                    key={task.id}
                    onClick={onOpenAgents}
                    className="block w-full rounded border border-[#2b2b2b] bg-[#141414] p-2 text-left hover:border-[#525252]"
                  >
                    <div className="flex items-center gap-1.5 text-[9px] text-[#9d9d9d]">
                      <span className={`size-1.5 rounded-full ${style.dot}`} />
                      <span className="truncate font-semibold text-[#cccccc]">
                        {assignee?.name || task.assigneeId}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[8px] text-[#858585]">
                        {style.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-[#cccccc]">{task.title}</p>
                  </button>
                )
              })}
              {agentTasks.length > 4 && (
                <button
                  onClick={() => setShowAllTasks((prev) => !prev)}
                  className="w-full pt-0.5 text-center text-[10px] text-[#858585] hover:text-white"
                >
                  {showAllTasks ? 'Show fewer' : `Show all ${agentTasks.length} tasks`}
                </button>
              )}
            </div>
          )}
          {revisions.length > 0 && (
            <div className="mt-2 flex items-center justify-between border-t border-[#2b2b2b] pt-2 text-[10px] text-[#858585]">
              <span className="flex items-center gap-1">
                <History size={11} className="text-[#d4d4d4]" /> Latest:{' '}
                {revisions[revisions.length - 1].id}
              </span>
              <button
                onClick={() => onRestoreRevision(revisions[revisions.length - 1].id)}
                className="text-[#e5e5e5] hover:underline"
              >
                Undo
              </button>
            </div>
          )}
        </div>
      )}

      {treeContextMenu && (
        <ContextMenu
          x={treeContextMenu.x}
          y={treeContextMenu.y}
          onClose={() => setTreeContextMenu(null)}
          items={
            [
              ...(onCreateFile
                ? [{ label: 'New File…', shortcut: 'Ctrl+N', onSelect: () => onCreateFile() }]
                : []),
              ...(onCreateFolder
                ? [{ label: 'New Folder…', onSelect: () => onCreateFolder() }]
                : []),
              { type: 'separator' },
              ...(!treeContextMenu.isFolder && onRenameFile
                ? [{ label: 'Rename…', onSelect: () => onRenameFile(treeContextMenu.path) }]
                : []),
              ...(!treeContextMenu.isFolder && onDeleteFile
                ? [
                    {
                      label: 'Delete',
                      danger: true,
                      onSelect: () => onDeleteFile(treeContextMenu.path),
                    },
                  ]
                : []),
              { type: 'separator' },
              ...(onCopyRelativePath
                ? [
                    {
                      label: 'Copy Relative Path',
                      onSelect: () => onCopyRelativePath(treeContextMenu.path),
                    },
                  ]
                : []),
              ...(!treeContextMenu.isFolder && onAddFileToChat
                ? [
                    {
                      label: 'Add to AI Chat (@file)',
                      onSelect: () => onAddFileToChat(treeContextMenu.path),
                    },
                  ]
                : []),
              ...(rootPath && onRevealInExplorer
                ? [
                    {
                      label: 'Reveal in File Explorer',
                      onSelect: () => onRevealInExplorer(treeContextMenu.path),
                    },
                  ]
                : []),
            ] satisfies ContextMenuItem[]
          }
        />
      )}
    </aside>
  )
}
