'use client'

import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  History,
  MoreHorizontal,
  PanelLeftClose,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { buildFileTree, searchWorkspaceFiles, type FileTreeItem } from '@/lib/file-tree'
import type { Agent, AgentTask, EditRevision, SidePanel, WorkspaceFile } from './agent-types'
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
  projectName,
  rootPath,
  files,
  activePath,
  agentTasks,
  agents,
  revisions,
  collapsedGroups,
  searchQuery,
  compactMode,
  onSearchQueryChange,
  onToggleGroup,
  onOpenFile,
  onOpenLocalDirectory,
  onRestoreRevision,
  onCollapse,
  onRefresh,
  onOpenSettings,
  onOpenAgents,
  onOpenDiff,
}: {
  sidePanel: SidePanel
  projectName: string
  rootPath?: string
  files: WorkspaceFile[]
  activePath: string
  agentTasks: AgentTask[]
  agents: Agent[]
  revisions: EditRevision[]
  collapsedGroups: Record<string, boolean>
  searchQuery: string
  compactMode: boolean
  onSearchQueryChange: (query: string) => void
  onToggleGroup: (key: string) => void
  onOpenFile: (path: string, line?: number) => void
  onOpenLocalDirectory: () => void
  onRestoreRevision: (revisionId: string) => void
  onCollapse: () => void
  onRefresh: () => void
  onOpenSettings: () => void
  onOpenAgents: () => void
  onOpenDiff: () => void
}) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const searchMatches = useMemo(
    () => searchWorkspaceFiles(files, searchQuery),
    [files, searchQuery],
  )
  const dirtyFiles = useMemo(() => files.filter((file) => file.dirty), [files])
  const [showAllTasks, setShowAllTasks] = useState(false)

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
            <Folder size={14} className="shrink-0 text-[#8f8f8f]" />
            <span className="truncate">{item.name}</span>
          </button>
          {!collapsed && item.children.map((child) => renderTreeItem(child, depth + 1))}
        </div>
      )
    }

    return (
      <button
        key={item.path}
        onClick={() => onOpenFile(item.path)}
        style={{ paddingLeft: `${indentPx + 14}px` }}
        className={`flex w-full items-center gap-1.5 pr-2 text-left text-[12px] ${
          compactMode ? 'py-[3px]' : 'py-1'
        } ${
          activePath === item.path
            ? 'bg-[#2c2c2c] text-white'
            : 'text-[#cccccc] hover:bg-[#222222]'
        }`}
      >
        {fileIcon(item.file)}
        <span className="truncate">{item.name}</span>
        {item.file.dirty && (
          <span className="ml-auto font-mono text-[10px] font-semibold text-[#e5e5e5]">M</span>
        )}
      </button>
    )
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[#2b2b2b] bg-[#181818]">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#bbbbbb]">
          {sidePanel === 'explorer'
            ? 'Explorer'
            : sidePanel === 'search'
              ? 'Search'
              : sidePanel === 'revisions'
                ? 'Edit Memory'
                : 'Source Control'}
        </span>
        <div className="flex gap-0.5">
          {sidePanel === 'explorer' && (
            <button
              className="mini-button"
              title="Open Local Folder from Disk"
              onClick={onOpenLocalDirectory}
            >
              <FolderOpen size={13} />
            </button>
          )}
          <button className="mini-button" title="Refresh from Disk" onClick={onRefresh}>
            <RefreshCw size={12} />
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
        <div className="flex min-h-0 flex-1 flex-col border-y border-[#2b2b2b] p-3">
          <label className="flex items-center gap-2 rounded border border-[#3c3c3c] bg-[#222222] px-2 py-1.5 focus-within:border-[#737373]">
            <Search size={13} className="shrink-0 text-[#858585]" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search files & code..."
              className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-[#858585]"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchQueryChange('')}
                className="text-[#858585] hover:text-white"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </label>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {!searchQuery.trim() ? (
              <p className="text-[11px] leading-4 text-[#858585]">
                Search across {files.length} workspace file{files.length === 1 ? '' : 's'}.
              </p>
            ) : searchMatches.length === 0 ? (
              <p className="text-[11px] text-[#858585]">
                No matches for &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : (
              <div className="space-y-0.5">
                <p className="mb-1.5 text-[10px] text-[#858585]">
                  {searchMatches.length} result{searchMatches.length === 1 ? '' : 's'}
                </p>
                {searchMatches.map((match, index) => (
                  <button
                    key={`${match.path}:${match.line}:${index}`}
                    onClick={() => onOpenFile(match.path, match.line)}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-[#2a2d2e]"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium text-[#cccccc]">{match.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[#858585]">
                        :{match.line}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-[#9d9d9d]">
                      {match.preview}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {sidePanel === 'git' && (
        <div className="min-h-0 flex-1 overflow-y-auto border-y border-[#2b2b2b] p-3">
          <div className="mb-3 flex items-center justify-between text-[11px] font-medium text-[#cccccc]">
            <span>Changes</span>
            <span className="rounded bg-[#2a2d2e] px-1.5 py-0.5 text-[10px] text-[#cccccc]">
              {dirtyFiles.length}
            </span>
          </div>
          {dirtyFiles.length ? (
            <div className="space-y-0.5">
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
          ) : (
            <p className="text-[11px] text-[#858585]">No unsaved changes in editor.</p>
          )}
          <button
            onClick={onOpenDiff}
            className="mt-4 w-full rounded border border-[#3c3c3c] bg-[#252526] py-1.5 text-[11px] text-[#cccccc] hover:bg-[#2a2d2e]"
          >
            Open Agent Diff Review
          </button>
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
