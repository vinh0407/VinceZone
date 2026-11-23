'use client'

import {
  Bot,
  Bug,
  Check,
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
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { ProjectTab, SidePanel, WorkspaceMode } from './agent-types'

type MenuOption =
  | { type: 'separator' }
  | {
      type?: 'item'
      label: string
      shortcut?: string
      checked?: boolean
      disabled?: boolean
      onSelect: () => void
    }

type MenuGroup = {
  id: string
  label: string
  items: MenuOption[]
}

export function WorkspaceHeader({
  projects,
  activeProjectId,
  activeRootPath,
  activeFilePath,
  workspaceMode,
  explorerOpen,
  terminalOpen,
  terminalMaximized,
  autoSave,
  compactMode,
  fileInputRef,
  runState,
  debugState,
  pendingPatchCount,
  latestRevisionId,
  isDesktop,
  onSwitchProject,
  onCloseProject,
  onImportFolder,
  onOpenLocalDirectory,
  onNewFile,
  onSaveFile,
  onSaveAll,
  onCloseActiveTab,
  onCopyActivePath,
  onUndoLatestRevision,
  onToggleAutoSave,
  onToggleCompact,
  onToggleExplorer,
  onToggleTerminal,
  onToggleTerminalMaximized,
  onClearTerminal,
  onToggleAgents,
  onSelectSidePanel,
  onSelectMode,
  onCycleTab,
  onRun,
  onRunCommand,
  onDebug,
  onStopDebug,
  onOpenSearch,
  onOpenDiff,
  onOpenSettings,
  onPreviewMail,
}: {
  projects: ProjectTab[]
  activeProjectId: string
  activeRootPath?: string
  activeFilePath?: string
  workspaceMode: WorkspaceMode
  explorerOpen: boolean
  terminalOpen: boolean
  terminalMaximized: boolean
  autoSave: boolean
  compactMode: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  runState: 'idle' | 'running' | 'success'
  debugState: 'idle' | 'starting' | 'paused' | 'running'
  pendingPatchCount: number
  latestRevisionId?: string
  isDesktop: boolean
  onSwitchProject: (id: string) => void
  onCloseProject: (id: string) => void
  onImportFolder: (event: React.ChangeEvent<HTMLInputElement>) => void
  onOpenLocalDirectory: () => void
  onNewFile: () => void
  onSaveFile: () => void
  onSaveAll: () => void
  onCloseActiveTab: () => void
  onCopyActivePath: () => void
  onUndoLatestRevision: () => void
  onToggleAutoSave: () => void
  onToggleCompact: () => void
  onToggleExplorer: () => void
  onToggleTerminal: () => void
  onToggleTerminalMaximized: () => void
  onClearTerminal: () => void
  onToggleAgents: () => void
  onSelectSidePanel: (panel: SidePanel) => void
  onSelectMode: (mode: WorkspaceMode) => void
  onCycleTab: (direction: 1 | -1) => void
  onRun: () => void
  onRunCommand: (command: string) => void
  onDebug: () => void
  onStopDebug: () => void
  onOpenSearch: () => void
  onOpenDiff: () => void
  onOpenSettings: () => void
  onPreviewMail: () => void
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId)

  useEffect(() => {
    if (!openMenuId) return
    const handlePointerDown = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null)
    }
    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenuId])

  const menus: MenuGroup[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'New Text File', shortcut: 'Ctrl+N', onSelect: onNewFile },
        { label: 'Open Local Folder…', shortcut: 'Ctrl+O', onSelect: onOpenLocalDirectory },
        {
          label: 'Import Folder (Browser Picker)…',
          onSelect: () => fileInputRef.current?.click(),
        },
        { type: 'separator' },
        { label: 'Save', shortcut: 'Ctrl+S', disabled: !activeFilePath, onSelect: onSaveFile },
        { label: 'Save All', onSelect: onSaveAll },
        { label: 'Auto Save', checked: autoSave, onSelect: onToggleAutoSave },
        { type: 'separator' },
        {
          label: 'Close Editor',
          shortcut: 'Ctrl+W',
          disabled: !activeFilePath,
          onSelect: onCloseActiveTab,
        },
        { label: 'Preferences: Settings', shortcut: 'Ctrl+,', onSelect: onOpenSettings },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { label: 'Find in Workspace', shortcut: 'Ctrl+K', onSelect: onOpenSearch },
        {
          label: latestRevisionId
            ? `Undo Revision (${latestRevisionId})`
            : 'Undo Latest Revision',
          disabled: !latestRevisionId,
          onSelect: onUndoLatestRevision,
        },
        { type: 'separator' },
        {
          label: 'Copy Active File Path',
          disabled: !activeFilePath,
          onSelect: onCopyActivePath,
        },
        { label: 'Open Edit Memory History', onSelect: () => onSelectSidePanel('revisions') },
      ],
    },
    {
      id: 'selection',
      label: 'Selection',
      items: [
        { label: 'Explorer Files', shortcut: 'Ctrl+Shift+E', onSelect: () => onSelectSidePanel('explorer') },
        { label: 'Search Results', shortcut: 'Ctrl+K', onSelect: () => onSelectSidePanel('search') },
        { label: 'Source Control Changes', onSelect: () => onSelectSidePanel('git') },
        { label: 'Edit Memory (REV-xxx)', onSelect: () => onSelectSidePanel('revisions') },
        { type: 'separator' },
        { label: 'Agent Diff Review', onSelect: onOpenDiff },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: 'Command Center / Search', shortcut: 'Ctrl+K', onSelect: onOpenSearch },
        { type: 'separator' },
        { label: 'Primary Side Bar', checked: explorerOpen, onSelect: onToggleExplorer },
        { label: 'Bottom Panel / Terminal', checked: terminalOpen, onSelect: onToggleTerminal },
        { label: 'Compact Interface', checked: compactMode, onSelect: onToggleCompact },
        { type: 'separator' },
        {
          label: 'IDE Editor Workspace',
          checked: workspaceMode === 'ide',
          onSelect: () => onSelectMode('ide'),
        },
        {
          label: 'VinceZone Multi-Agent Control Center',
          shortcut: 'Ctrl+Shift+A',
          checked: workspaceMode === 'agents',
          onSelect: () => onSelectMode('agents'),
        },
        {
          label: 'Android Device Preview',
          checked: workspaceMode === 'android',
          onSelect: () => onSelectMode('android'),
        },
      ],
    },
    {
      id: 'go',
      label: 'Go',
      items: [
        { label: 'Go to File / Symbol…', shortcut: 'Ctrl+K', onSelect: onOpenSearch },
        { type: 'separator' },
        { label: 'Next Editor Tab', onSelect: () => onCycleTab(1) },
        { label: 'Previous Editor Tab', onSelect: () => onCycleTab(-1) },
        { type: 'separator' },
        { label: 'Edit Memory Revisions', onSelect: () => onSelectSidePanel('revisions') },
        { label: 'Multi-Agent Control Center', onSelect: () => onSelectMode('agents') },
      ],
    },
    {
      id: 'run',
      label: 'Run',
      items: [
        { label: 'Run Test Suite (pnpm test)', onSelect: onRun },
        { label: 'Run TypeScript Check (pnpm typecheck)', onSelect: () => onRunCommand('pnpm typecheck') },
        { type: 'separator' },
        { label: 'Start Debugging', shortcut: 'F5', onSelect: onDebug },
        {
          label: 'Stop Debugging',
          disabled: debugState === 'idle',
          onSelect: onStopDebug,
        },
        { type: 'separator' },
        {
          label: `Review Agent Patches${pendingPatchCount > 0 ? ` (${pendingPatchCount})` : ''}`,
          onSelect: onOpenDiff,
        },
      ],
    },
    {
      id: 'terminal',
      label: 'Terminal',
      items: [
        { label: 'Toggle Integrated Terminal', shortcut: 'Ctrl+`', onSelect: onToggleTerminal },
        {
          label: terminalMaximized ? 'Restore Panel Size' : 'Maximize Panel Size',
          onSelect: onToggleTerminalMaximized,
        },
        { type: 'separator' },
        { label: 'Run: pnpm test', onSelect: () => onRunCommand('pnpm test') },
        { label: 'Run: pnpm typecheck', onSelect: () => onRunCommand('pnpm typecheck') },
        { label: 'Run: git status', onSelect: () => onRunCommand('git status') },
        { type: 'separator' },
        { label: 'Clear Terminal Output', onSelect: onClearTerminal },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'Preview Agent Mail Animation', onSelect: onPreviewMail },
        { label: 'Settings & CLI Integrations', onSelect: onOpenSettings },
        { type: 'separator' },
        {
          label: 'VinceZone Studio v2.0.0 · localhost:40704',
          disabled: true,
          onSelect: () => {},
        },
      ],
    },
  ]

  return (
    <header className="relative z-40 flex h-[35px] shrink-0 select-none items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-2 text-[#cccccc]">
      {/* Left: VS Code Menu Bar with real dropdown options + Workspace Switcher */}
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex items-center gap-1.5 pr-1.5">
          <div className="grid size-5 place-items-center rounded bg-[#0078d4] text-[10px] font-bold text-white">
            VZ
          </div>
          <span className="hidden text-[12px] font-semibold tracking-tight text-white sm:inline">
            VinceZone
          </span>
        </div>

        <div
          ref={menuBarRef}
          role="menubar"
          aria-label="Application menu"
          className="relative flex items-center gap-0.5"
        >
          {menus.map((menu) => {
            const isOpen = openMenuId === menu.id
            return (
              <div key={menu.id} className="relative">
                <button
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() => setOpenMenuId((current) => (current === menu.id ? null : menu.id))}
                  onMouseEnter={() => {
                    if (openMenuId && openMenuId !== menu.id) setOpenMenuId(menu.id)
                  }}
                  className={`rounded px-2 py-0.5 text-[12px] transition ${
                    isOpen
                      ? 'bg-[#2a2d2e] text-white'
                      : 'text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white'
                  }`}
                >
                  {menu.label}
                </button>
                {isOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-[28px] z-50 min-w-60 rounded-md border border-[#454545] bg-[#1f1f1f] py-1 shadow-[0_10px_32px_rgba(0,0,0,0.65)]"
                  >
                    {menu.items.map((item, index) =>
                      item.type === 'separator' ? (
                        <div key={`sep-${index}`} className="my-1 h-px bg-[#323232]" />
                      ) : (
                        <button
                          key={item.label}
                          role="menuitem"
                          disabled={item.disabled}
                          onClick={() => {
                            setOpenMenuId(null)
                            item.onSelect()
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#cccccc] transition hover:bg-[#04395e] hover:text-white disabled:cursor-default disabled:text-[#666666] disabled:hover:bg-transparent"
                        >
                          <span className="grid size-3.5 shrink-0 place-items-center text-[#4ec9b0]">
                            {item.checked ? <Check size={12} /> : null}
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.shortcut && (
                            <span className="ml-4 shrink-0 font-mono text-[10px] text-[#858585]">
                              {item.shortcut}
                            </span>
                          )}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mx-1 hidden h-3.5 w-px bg-[#2b2b2b] lg:block" />

        <div className="hidden max-w-[20vw] items-center gap-1 overflow-x-auto xl:flex">
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
        className="mx-2 hidden h-[24px] w-full max-w-sm items-center justify-center gap-2 rounded-md border border-[#3c3c3c] bg-[#222222] px-3 text-[11px] text-[#9d9d9d] transition hover:border-[#4c4c4c] hover:bg-[#2a2d2e] hover:text-white md:flex"
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

      {/* Right: Quick Actions + VS Code Layout Controls */}
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
          title="Run test suite"
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
        <button className="icon-button !size-6" title="Settings" onClick={onOpenSettings}>
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
