'use client'

import {
  Bot,
  Files,
  GitBranch,
  History,
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
          <Files size={21} strokeWidth={1.6} />
        </button>
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'search' && explorerOpen ? 'active' : ''}`}
          title="Search (Ctrl+K)"
          onClick={() => onSelectSidePanel('search')}
        >
          <Search size={21} strokeWidth={1.6} />
        </button>
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'git' && explorerOpen ? 'active' : ''}`}
          title="Source Control"
          onClick={() => onSelectSidePanel('git')}
        >
          <GitBranch size={21} strokeWidth={1.6} />
          {dirtyCount > 0 && (
            <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-[#0078d4] px-1 text-[9px] font-semibold text-white">
              {dirtyCount}
            </span>
          )}
        </button>
        <button
          className={`activity-button ${workspaceMode === 'ide' && sidePanel === 'revisions' && explorerOpen ? 'active' : ''}`}
          title="Edit Memory & Revisions (REV-xxx)"
          onClick={() => onSelectSidePanel('revisions')}
        >
          <History size={21} strokeWidth={1.6} />
          {revisionCount > 0 && (
            <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-[#4ec9b0] px-1 text-[9px] font-semibold text-black">
              {revisionCount}
            </span>
          )}
        </button>
        <button
          className={`activity-button ${workspaceMode === 'agents' ? 'active' : ''}`}
          title="VinceZone Multi-Agent Control Center"
          onClick={() => onSelectMode('agents')}
        >
          <Bot size={21} strokeWidth={1.6} />
          {activeAgentCount > 0 && (
            <span className="agent-orbit absolute right-2.5 top-2.5 size-2 rounded-full bg-[#0078d4]" />
          )}
        </button>
        <button
          className={`activity-button ${workspaceMode === 'android' ? 'active' : ''}`}
          title="Android Device Preview"
          onClick={() => onSelectMode('android')}
        >
          <Smartphone size={21} strokeWidth={1.6} />
        </button>
      </div>
      <div className="flex flex-col items-center pb-1">
        <button
          className="activity-button"
          title="Toggle Integrated Terminal"
          onClick={onToggleTerminal}
        >
          <TerminalSquare size={20} strokeWidth={1.6} />
        </button>
        <button className="activity-button" title="Manage Settings" onClick={onOpenSettings}>
          <Settings size={20} strokeWidth={1.6} />
        </button>
      </div>
    </nav>
  )
}
