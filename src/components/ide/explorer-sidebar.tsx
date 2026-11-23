'use client'

import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  History,
  Minus,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildFileTree, searchWorkspaceFiles, type FileTreeItem } from '@/lib/file-tree'
import type {
  Agent,
  AgentTask,
  EditRevision,
  MemoryNote,
  SidePanel,
  WorkspaceFile,
} from './agent-types'
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
}) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false)
  const [searchRegex, setSearchRegex] = useState(false)
  const [replaceText, setReplaceText] = useState('')
  const [replaceFeedback, setReplaceFeedback] = useState('')
  const [collapsedSearchFiles, setCollapsedSearchFiles] = useState<Record<string, boolean>>({})
  const [expandedMemoryAgents, setExpandedMemoryAgents] = useState<Record<string, boolean>>({})

  const searchMatches = useMemo(() => {
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
    ahead: number
    behind: number
    changes: Array<{ path: string; indexStatus: string; worktreeStatus: string; staged: boolean }>
    commits: Array<{ hash: string; subject: string; author: string; relativeTime: string }>
    error?: string
  } | null>(null)

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
      action: 'stage' | 'stage-all' | 'unstage' | 'commit' | 'push' | 'discard',
      extra?: { path?: string; message?: string },
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
                : action === 'push'
                  ? data.output || 'Pushed to remote.'
                  : `${action} succeeded.`,
          })
          await loadGitStatus()
          if (action === 'discard') onRefresh()
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
        style={{ paddingLeft: `${indentPx + 14}px` }}
        className={`group flex w-full items-center gap-1 pr-1.5 text-[12px] ${
          compactMode ? 'py-[3px]' : 'py-1'
        } ${
          activePath === item.path
            ? 'bg-[#2c2c2c] text-white'
            : 'text-[#cccccc] hover:bg-[#222222]'
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
        <div className="min-h-0 flex-1 overflow-y-auto border-y border-[#2b2b2b] py-1">
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
                  onClick={() => {
                    const outcome = onReplaceInFiles(searchQuery, replaceText, {
                      caseSensitive: searchCaseSensitive,
                      regex: searchRegex,
                    })
                    setReplaceFeedback(
                      `Replaced ${outcome.occurrences} match(es) in ${outcome.filesUpdated} file(s) (REV saved).`,
                    )
                  }}
                  className="shrink-0 rounded bg-[#e5e5e5] px-2 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-35"
                  title="Replace all matches across workspace (auto-records REV-xxx)"
                >
                  Replace All
                </button>
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
                Search &amp; Replace across {files.length} workspace file{files.length === 1 ? '' : 's'}.
              </p>
            ) : groupedSearchMatches.length === 0 ? (
              <p className="text-[11px] text-[#858585]">
                No matches for &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="mb-1.5 text-[10px] text-[#858585]">
                  {searchMatches.length} result{searchMatches.length === 1 ? '' : 's'} in{' '}
                  {groupedSearchMatches.length} file{groupedSearchMatches.length === 1 ? '' : 's'}
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
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#e5e5e5]">
              <GitBranch size={12} />
              <span className="truncate font-mono">{gitStatus?.branch || 'git'}</span>
            </span>
            {gitStatus?.isRepo && (
              <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] text-[#a3a3a3]">
                ↑{gitStatus.ahead} ↓{gitStatus.behind}
              </span>
            )}
          </div>

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
                <div className="flex items-center gap-1.5">
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
                    disabled={gitBusyAction}
                    onClick={() => void runGitAction('push')}
                    className="flex items-center justify-center gap-1 rounded border border-[#3a3a3a] bg-[#222222] px-2 py-1 text-[10px] text-[#e5e5e5] hover:bg-[#2d2d2d] disabled:opacity-35"
                    title="git push"
                  >
                    <Upload size={11} /> Push
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
                                onClick={() => onOpenFile(item.path)}
                                className="min-w-0 flex-1 truncate text-left font-mono text-[10px]"
                              >
                                {item.path}
                              </button>
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
                                onClick={() => onOpenFile(item.path)}
                                className="min-w-0 flex-1 truncate text-left font-mono text-[10px]"
                              >
                                {item.path}
                              </button>
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
                                    if (window.confirm(`Discard uncommitted changes in ${item.path}?`)) {
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
    </aside>
  )
}
