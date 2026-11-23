'use client'

import {
  Bot,
  Bug,
  FolderOpen,
  GitCompareArrows,
  PanelBottom,
  PanelLeft,
  Play,
  Plus,
  Search,
  Settings,
  Square,
  TerminalSquare,
  X,
} from 'lucide-react'
import type { RefObject } from 'react'
import type { ProjectTab, WorkspaceMode } from './agent-types'

export function WorkspaceHeader({
  projects,
  activeProjectId,
  activeRootPath,
  workspaceMode,
  explorerOpen,
  terminalOpen,
  fileInputRef,
  runState,
  debugState,
  pendingPatchCount,
  isDesktop,
  onSwitchProject,
  onCloseProject,
  onImportFolder,
  onOpenLocalDirectory,
  onToggleExplorer,
  onToggleTerminal,
  onToggleAgents,
  onRun,
  onDebug,
  onOpenSearch,
  onOpenDiff,
  onOpenSettings,
}: {
  projects: ProjectTab[]
  activeProjectId: string
  activeRootPath?: string
  workspaceMode: WorkspaceMode
  explorerOpen: boolean
  terminalOpen: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  runState: 'idle' | 'running' | 'success'
  debugState: 'idle' | 'starting' | 'paused' | 'running'
  pendingPatchCount: number
  isDesktop: boolean
  onSwitchProject: (id: string) => void
  onCloseProject: (id: string) => void
  onImportFolder: (event: React.ChangeEvent<HTMLInputElement>) => void
  onOpenLocalDirectory: () => void
  onToggleExplorer: () => void
  onToggleTerminal: () => void
  onToggleAgents: () => void
  onRun: () => void
  onDebug: () => void
  onOpenSearch: () => void
  onOpenDiff: () => void
  onOpenSettings: () => void
}) {
  const activeProject = projects.find((project) => project.id === activeProjectId)

  return (
    <header className="flex h-[35px] shrink-0 select-none items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-2 text-[#cccccc]">
      {/* Left: VS Code Menu Bar + Workspace Switcher */}
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex items-center gap-1.5 pr-1.5">
          <div className="grid size-5 place-items-center rounded bg-[#0078d4] text-[10px] font-bold text-white">
            VZ
          </div>
          <span className="hidden text-[12px] font-semibold tracking-tight text-white sm:inline">
            VinceZone
          </span>
        </div>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Application menu">
          <button
            className="vscode-menu-item"
            onClick={onOpenLocalDirectory}
            title="Open local directory on disk"
          >
            File
          </button>
          <button className="vscode-menu-item" onClick={onOpenSearch} title="Search in workspace">
            Edit
          </button>
          <button className="vscode-menu-item" onClick={onToggleExplorer} title="Toggle Side Bar">
            View
          </button>
          <button className="vscode-menu-item" onClick={onRun} title="Run workspace command">
            Run
          </button>
          <button className="vscode-menu-item" onClick={onToggleTerminal} title="Toggle Terminal">
            Terminal
          </button>
          <button className="vscode-menu-item" onClick={onOpenSettings} title="Settings">
            Settings
          </button>
        </nav>

        <div className="mx-1 hidden h-3.5 w-px bg-[#2b2b2b] lg:block" />

        <div className="flex max-w-[26vw] items-center gap-1 overflow-x-auto">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => onSwitchProject(project.id)}
              title={project.rootPath || project.name}
              className={`group flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[11px] ${
                activeProjectId === project.id
                  ? 'bg-[#2a2d2e] text-white'
                  : 'text-[#9d9d9d] hover:bg-[#2a2d2e]/60 hover:text-white'
              }`}
            >
              <FolderOpen size={12} className="text-[#dcb67a]" />
              <span className="max-w-28 truncate">{project.name}</span>
              {projects.length > 1 && (
                <X
                  size={10}
                  className="ml-0.5 opacity-0 group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    onCloseProject(project.id)
                  }}
                />
              )}
            </button>
          ))}
          <button
            onClick={onOpenLocalDirectory}
            className="icon-button !size-6 shrink-0"
            title="Open local folder on disk (Desktop)"
          >
            <Plus size={13} />
          </button>
        </div>

        <input
          ref={(node) => {
            fileInputRef.current = node
            node?.setAttribute('webkitdirectory', '')
          }}
          className="hidden"
          type="file"
          multiple
          onChange={onImportFolder}
        />
      </div>

      {/* Center: VS Code Command Center */}
      <button
        onClick={onOpenSearch}
        title="Search files & code (Ctrl+K)"
        className="mx-2 hidden h-[24px] w-full max-w-md items-center justify-center gap-2 rounded-md border border-[#3c3c3c] bg-[#222222] px-3 text-[11px] text-[#9d9d9d] transition hover:border-[#4c4c4c] hover:bg-[#2a2d2e] hover:text-white md:flex"
      >
        <Search size={12} className="shrink-0 text-[#9d9d9d]" />
        <span className="truncate">
          {activeProject?.name || 'VinceZone Studio'}
          {activeRootPath ? ` — ${activeRootPath}` : ''}
        </span>
        <kbd className="ml-auto rounded border border-[#3c3c3c] bg-[#181818] px-1 text-[9px] text-[#858585]">
          Ctrl+K
        </kbd>
      </button>

      {/* Right: Actions + VS Code Layout Controls */}
      <div className="flex shrink-0 items-center gap-1">
        {pendingPatchCount > 0 && (
          <button
            onClick={onOpenDiff}
            className="flex h-6 items-center gap-1 rounded border border-[#0078d4]/60 bg-[#0078d4]/20 px-2 text-[11px] text-[#9cdcfe] hover:bg-[#0078d4]/30"
            title="Review agent patches"
          >
            <GitCompareArrows size={12} />
            Diff ({pendingPatchCount})
          </button>
        )}

        <button
          onClick={onRun}
          className="flex h-6 items-center gap-1 rounded bg-[#0078d4] px-2 text-[11px] font-medium text-white hover:bg-[#1a8ad4]"
          title="Run command in terminal"
        >
          {runState === 'running' ? <Square size={10} fill="currentColor" /> : <Play size={11} />}
          <span className="hidden sm:inline">{runState === 'running' ? 'Running' : 'Run'}</span>
        </button>

        <button
          onClick={onDebug}
          className={`flex h-6 items-center gap-1 rounded border px-2 text-[11px] transition ${
            debugState === 'paused'
              ? 'border-[#68217a] bg-[#68217a]/40 text-white'
              : 'border-[#3c3c3c] bg-[#252526] text-[#cccccc] hover:bg-[#2a2d2e]'
          }`}
          title="Start debugger"
        >
          <Bug size={11} />
          <span className="hidden xl:inline">{debugState === 'paused' ? 'Paused' : 'Debug'}</span>
        </button>

        <div className="mx-1 h-3.5 w-px bg-[#2b2b2b]" />

        {/* VS Code Layout Toggles */}
        <button
          onClick={onToggleExplorer}
          className={`icon-button !size-6 ${explorerOpen && workspaceMode === 'ide' ? 'bg-[#2a2d2e] text-white' : ''}`}
          title="Toggle Primary Side Bar"
        >
          <PanelLeft size={14} />
        </button>
        <button
          onClick={onToggleTerminal}
          className={`icon-button !size-6 ${terminalOpen && workspaceMode === 'ide' ? 'bg-[#2a2d2e] text-white' : ''}`}
          title="Toggle Bottom Panel"
        >
          <PanelBottom size={14} />
        </button>
        <button
          onClick={onToggleAgents}
          className={`icon-button !size-6 ${workspaceMode === 'agents' ? 'bg-[#0078d4]/30 text-[#9cdcfe]' : ''}`}
          title="Toggle VinceZone Multi-Agent Control Center"
        >
          <Bot size={14} />
        </button>
        <button
          onClick={onOpenSettings}
          className="icon-button !size-6"
          title="Settings"
        >
          <Settings size={14} />
        </button>

        <span
          className="ml-1 hidden items-center gap-1 rounded border border-[#2b2b2b] bg-[#222222] px-1.5 py-0.5 font-mono text-[9px] text-[#4ec9b0] xl:flex"
          title="VinceZone Local Desktop Runtime"
        >
          <TerminalSquare size={10} />
          {isDesktop ? 'Desktop' : 'Local'} :40704
        </span>
      </div>
    </header>
  )
}
