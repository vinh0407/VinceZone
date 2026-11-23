'use client'

import {
  Bot,
  Brain,
  Files,
  GitBranch,
  History,
  Monitor,
  Search,
  Settings,
  Smartphone,
  TerminalSquare,
} from 'lucide-react'
import type { SidePanel, WorkspaceMode } from './agent-types'

export function ActivityBar({
  workspaceMode,
  sidePanel,
  explorerOpen,
  dirtyCount,
  revisionCount,
  memoryCount,
  activeAgentCount,
  onSelectSidePanel,
  onSelectMode,
  onToggleTerminal,
  onOpenSettings,
}: {
  workspaceMode: WorkspaceMode
  sidePanel: SidePanel
  explorerOpen: boolean
  dirtyCount: number
  revisionCount: number
  memoryCount: number
  activeAgentCount: number
  onSelectSidePanel: (panel: SidePanel) => void
  onSelectMode: (mode: WorkspaceMode) => void
  onToggleTerminal: () => void
  onOpenSettings: () => void
}) {
  return (
    <nav
      aria-label="Activity Bar"
      className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-[#2b2b2b] bg-[#181818]"
    >
      <div className="flex flex-col items-center">
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'explorer' && explorerOpen ? 'active' : ''}`}
          title="Explorer (Ctrl+Shift+E)"
          onClick={() => onSelectSidePanel('explorer')}
        >
          <Files size={20} strokeWidth={1.6} />
        </button>
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'search' && explorerOpen ? 'active' : ''}`}
          title="Search (Ctrl+K)"
          onClick={() => onSelectSidePanel('search')}
        >
          <Search size={20} strokeWidth={1.6} />
        </button>
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'git' && explorerOpen ? 'active' : ''}`}
          title="Source Control"
          onClick={() => onSelectSidePanel('git')}
        >
          <GitBranch size={20} strokeWidth={1.6} />
          {dirtyCount > 0 && (
            <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-[#e5e5e5] px-1 text-[9px] font-semibold text-[#111111]">
              {dirtyCount}
            </span>
          )}
        </button>
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'memory' && explorerOpen ? 'active' : ''}`}
          title="Workspace & Agent Memory"
          onClick={() => onSelectSidePanel('memory')}
        >
          <Brain size={20} strokeWidth={1.6} />
          {memoryCount > 0 && (
            <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-[#525252] px-1 text-[9px] font-semibold text-white">
              {memoryCount}
            </span>
          )}
        </button>
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'revisions' && explorerOpen ? 'active' : ''}`}
          title="Edit Memory & Revisions (REV-xxx)"
          onClick={() => onSelectSidePanel('revisions')}
        >
          <History size={20} strokeWidth={1.6} />
          {revisionCount > 0 && (
            <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-[#737373] px-1 text-[9px] font-semibold text-white">
              {revisionCount}
            </span>
          )}
        </button>
        <button
          className={`activity-button ${workspaceMode === 'agents' ? 'active' : ''}`}
          title="VinceZone Multi-Agent Control Center"
          onClick={() => onSelectMode('agents')}
        >
          <Bot size={20} strokeWidth={1.6} />
          {activeAgentCount > 0 && (
            <span className="agent-orbit absolute right-2.5 top-2.5 size-2 rounded-full bg-[#e5e5e5]" />
          )}
        </button>
        <button
          className={`activity-button ${workspaceMode === 'android' ? 'active' : ''}`}
          title="Android Emulator (Real SDK)"
          onClick={() => onSelectMode('android')}
        >
          <Smartphone size={20} strokeWidth={1.6} />
        </button>
        <button
          className={`activity-button ${workspaceMode === 'web' ? 'active' : ''}`}
          title="Web Project Preview (Desktop Browser)"
          onClick={() => onSelectMode('web')}
        >
          <Monitor size={20} strokeWidth={1.6} />
        </button>
      </div>
      <div className="flex flex-col items-center pb-1">
        <button
          className="activity-button"
          title="Toggle Integrated Terminal"
          onClick={onToggleTerminal}
        >
          <TerminalSquare size={19} strokeWidth={1.6} />
        </button>
        <button className="activity-button" title="Manage Settings" onClick={onOpenSettings}>
          <Settings size={19} strokeWidth={1.6} />
        </button>
      </div>
    </nav>
  )
}
