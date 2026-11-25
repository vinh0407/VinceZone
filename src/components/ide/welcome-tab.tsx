'use client'

import {
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock,
  Download,
  FilePlus,
  FolderOpen,
  Keyboard,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { RecentWorkspaceEntry } from '@/hooks/use-recent-workspaces'

export function WelcomeTab({
  projectName,
  rootPath,
  recentWorkspaces,
  providerConnected,
  providerLabel,
  rulesDetected,
  onOpenFolder,
  onOpenRecentPath,
  onRemoveRecentPath,
  onNewFile,
  onOpenAgents,
  onOpenSettings,
  onOpenShortcuts,
  onExportDiagnostics,
}: {
  projectName: string
  rootPath?: string
  recentWorkspaces: RecentWorkspaceEntry[]
  providerConnected: boolean
  providerLabel: string
  rulesDetected: string[]
  onOpenFolder: () => void
  onOpenRecentPath: (rootPath: string) => void
  onRemoveRecentPath: (rootPath: string) => void
  onNewFile: () => void
  onOpenAgents: () => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onExportDiagnostics: () => void
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-10 text-[#d4d4d4]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#2b2b2b] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#c9a24d]/35 bg-[#c9a24d]/10 px-3 py-1 text-[11px] font-medium text-[#e6cfa0]">
            <Sparkles size={12} /> VinceZone Studio · Local-First Multi-Agent IDE
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Welcome to VinceZone Studio
          </h1>
          <p className="mt-1 text-[12.5px] text-[#9a9a9a]">
            Active workspace: <span className="font-mono text-[#e5e5e5]">{projectName}</span>
            {rootPath ? <span className="ml-2 font-mono text-[11px] text-[#737373]">{rootPath}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/vinh0407/VinceZone/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded bg-gradient-to-b from-[#d1ab59] to-[#a98336] px-3 py-1.5 text-[11px] font-semibold text-[#111111] shadow-[0_1px_8px_rgba(201,162,77,0.28)] transition hover:from-[#e0bc6c] hover:to-[#bc9542]"
            title="Download the latest VinceZone Studio installer from GitHub Releases"
          >
            <Download size={12} /> Download Setup
          </a>
          <button
            type="button"
            onClick={onExportDiagnostics}
            className="rounded border border-[#333333] bg-[#1a1a1a] px-3 py-1.5 text-[11px] text-[#cccccc] transition hover:border-[#c9a24d]/40 hover:text-white"
          >
            Export Diagnostics…
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-[#2b2b2b] bg-[#161616] p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#ddb968]">
            Quick Start
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenFolder}
              className="flex items-center gap-2 rounded-md border border-[#c9a24d]/35 bg-[#c9a24d]/10 px-3 py-2.5 text-left text-[12px] font-medium text-[#f0d394] transition hover:bg-[#c9a24d]/20"
            >
              <FolderOpen size={15} className="shrink-0" />
              <span>Open Folder…</span>
            </button>
            <button
              type="button"
              onClick={onNewFile}
              className="flex items-center gap-2 rounded-md border border-[#2f2f2f] bg-[#1d1d1d] px-3 py-2.5 text-left text-[12px] text-[#e5e5e5] transition hover:border-[#4a4a4a] hover:bg-[#252525]"
            >
              <FilePlus size={15} className="shrink-0 text-[#b5b5b5]" />
              <span>New File</span>
            </button>
            <button
              type="button"
              onClick={onOpenAgents}
              className="flex items-center gap-2 rounded-md border border-[#2f2f2f] bg-[#1d1d1d] px-3 py-2.5 text-left text-[12px] text-[#e5e5e5] transition hover:border-[#4a4a4a] hover:bg-[#252525]"
            >
              <Bot size={15} className="shrink-0 text-[#ddb968]" />
              <span>Multi-Agent Center</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2 rounded-md border border-[#2f2f2f] bg-[#1d1d1d] px-3 py-2.5 text-left text-[12px] text-[#e5e5e5] transition hover:border-[#4a4a4a] hover:bg-[#252525]"
            >
              <Settings size={15} className="shrink-0 text-[#b5b5b5]" />
              <span>Provider Settings</span>
            </button>
          </div>

          <div className="space-y-1.5 border-t border-[#262626] pt-3 text-[11px]">
            <p className="font-semibold uppercase tracking-wider text-[#9a9a9a]">Environment Checklist</p>
            <div className="flex items-center gap-2 text-[#cccccc]">
              {providerConnected ? (
                <CheckCircle2 size={13} className="shrink-0 text-[#89d185]" />
              ) : (
                <CircleDashed size={13} className="shrink-0 text-[#c9a24d]" />
              )}
              <span>
                AI Provider:{' '}
                <strong className="text-white">{providerLabel}</strong>{' '}
                {providerConnected ? '(Connected)' : '(Configure in Settings)'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#cccccc]">
              {rulesDetected.length > 0 ? (
                <CheckCircle2 size={13} className="shrink-0 text-[#89d185]" />
              ) : (
                <CircleDashed size={13} className="shrink-0 text-[#737373]" />
              )}
              <span>
                Repository Rules:{' '}
                {rulesDetected.length > 0 ? (
                  <code className="rounded bg-[#252525] px-1.5 py-0.5 font-mono text-[10px] text-[#e6cfa0]">
                    {rulesDetected.join(', ')}
                  </code>
                ) : (
                  <span className="text-[#858585]">
                    Optional — add <code>.vincezonerules</code> or <code>AGENTS.md</code>
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-[#2b2b2b] bg-[#161616] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#ddb968]">
              <Clock size={12} /> Recent Projects
            </h2>
            <span className="font-mono text-[10px] text-[#737373]">
              {recentWorkspaces.length} saved
            </span>
          </div>
          {recentWorkspaces.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded border border-dashed border-[#2b2b2b] p-6 text-center text-[11.5px] text-[#7a7a7a]">
              <p>No recent local folders yet.</p>
              <button
                type="button"
                onClick={onOpenFolder}
                className="mt-2 text-[#ddb968] hover:underline"
              >
                Open your first project folder →
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {recentWorkspaces.map((entry) => (
                <div
                  key={entry.rootPath}
                  className="group flex items-center gap-2 rounded-md border border-transparent px-2.5 py-2 transition hover:border-[#333333] hover:bg-[#1f1f1f]"
                >
                  <button
                    type="button"
                    onClick={() => onOpenRecentPath(entry.rootPath)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[12px] font-medium text-[#e5e5e5] group-hover:text-white">
                      {entry.name}
                    </p>
                    <p className="truncate font-mono text-[10px] text-[#7a7a7a]">
                      {entry.rootPath}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveRecentPath(entry.rootPath)}
                    className="rounded p-1 text-[#666666] opacity-0 transition hover:bg-[#2c2c2c] hover:text-[#f48771] group-hover:opacity-100"
                    title="Remove from recent list"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#262626] bg-[#141414] px-4 py-3 text-[11px] text-[#9a9a9a]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            <kbd className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
              Ctrl+P
            </kbd>{' '}
            Quick Open
          </span>
          <span>
            <kbd className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
              Ctrl+Shift+O
            </kbd>{' '}
            Go to Symbol
          </span>
          <span>
            <kbd className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
              F2
            </kbd>{' '}
            Rename Symbol
          </span>
          <span>
            <kbd className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
              Ctrl+K
            </kbd>{' '}
            Inline AI Edit
          </span>
          <span>
            <kbd className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
              @errors @git @terminal @url:
            </kbd>{' '}
            Smart Context
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="flex items-center gap-1 text-[#ddb968] hover:underline"
        >
          <Keyboard size={12} /> All Shortcuts
        </button>
      </div>
    </div>
  )
}
