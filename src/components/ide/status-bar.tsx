'use client'

import {
  Check,
  GitBranch,
  GitCompareArrows,
  History,
  Keyboard,
  Monitor,
  Palette,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppTheme, WorkspaceFile } from './agent-types'

export type EditorDiagnostic = {
  path: string
  line: number
  column: number
  severity: 'error' | 'warning'
  message: string
}

const languageLabels: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
  css: 'CSS',
  html: 'HTML',
  markdown: 'Markdown',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  yaml: 'YAML',
  shell: 'Shell',
  sql: 'SQL',
  image: 'Image',
}

const THEME_LABELS: Record<AppTheme, string> = {
  dark: 'Dark',
  light: 'Light',
  'high-contrast': 'HC',
}

export function StatusBar({
  activeFile,
  cursor,
  dirtyCount,
  diagnostics = [],
  pendingPatchCount,
  latestRevisionId,
  debugActive,
  isDesktop,
  bridgeCount = 0,
  gitBranch = 'main',
  gitBranches = [],
  gitAhead = 0,
  gitBehind = 0,
  theme = 'dark',
  onSwitchGitBranch,
  onCycleTheme,
  onOpenShortcuts,
  onOpenProblems,
  onOpenDiff,
  onOpenRevisions,
}: {
  activeFile?: WorkspaceFile
  cursor: { line: number; column: number }
  dirtyCount: number
  diagnostics?: EditorDiagnostic[]
  pendingPatchCount: number
  latestRevisionId?: string
  debugActive: boolean
  isDesktop: boolean
  bridgeCount?: number
  gitBranch?: string
  gitBranches?: string[]
  gitAhead?: number
  gitBehind?: number
  theme?: AppTheme
  onSwitchGitBranch?: (branch: string) => void
  onCycleTheme?: () => void
  onOpenShortcuts?: () => void
  onOpenProblems: () => void
  onOpenDiff: () => void
  onOpenRevisions: () => void
}) {
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const branchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!branchMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBranchMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [branchMenuOpen])

  const languageLabel = activeFile
    ? activeFile.name.endsWith('.tsx')
      ? 'TypeScript React'
      : activeFile.name.endsWith('.jsx')
        ? 'JavaScript React'
        : (languageLabels[activeFile.language] ?? activeFile.language)
    : 'Plain Text'

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length + dirtyCount

  return (
    <footer
      className={`relative flex h-[22px] shrink-0 select-none items-center justify-between border-t border-[#2b2b2b] px-2 text-[11px] text-[#d4d4d4] transition-colors ${
        debugActive ? 'bg-[#2a2a2a] text-white' : 'bg-[#121212]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1 rounded border border-[#c9a24d]/30 bg-[#c9a24d]/10 px-1.5 py-0.5 font-medium text-[#e6cfa0]">
          <Monitor size={11} className="text-[#c9a24d]" />
          {isDesktop ? 'VinceZone Local App' : 'VinceZone Local'}
        </span>

        <div ref={branchRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (gitBranches.length > 0 && onSwitchGitBranch) {
                setBranchMenuOpen((prev) => !prev)
              }
            }}
            title={
              gitBranches.length > 0
                ? `Active Git branch: ${gitBranch} (click to switch)`
                : `Git branch: ${gitBranch}`
            }
            className="flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[#2a2720] hover:text-[#f0d89d]"
          >
            <GitBranch size={11} className="text-[#c9a24d]" />
            <span className="max-w-36 truncate font-mono">{gitBranch}</span>
            {dirtyCount > 0 && <span>*({dirtyCount})</span>}
            {(gitAhead > 0 || gitBehind > 0) && (
              <span className="font-mono text-[10px] text-[#9d9d9d]">
                ↑{gitAhead}↓{gitBehind}
              </span>
            )}
          </button>

          {branchMenuOpen && gitBranches.length > 0 && onSwitchGitBranch && (
            <div className="absolute bottom-[26px] left-0 z-50 max-h-56 min-w-48 overflow-y-auto rounded-md border border-[#454545] bg-[#1f1f1f] py-1 shadow-[0_10px_28px_rgba(0,0,0,0.75)]">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#858585]">
                Switch Git Branch
              </div>
              {gitBranches.map((branch) => (
                <button
                  key={branch}
                  type="button"
                  onClick={() => {
                    setBranchMenuOpen(false)
                    if (branch !== gitBranch) onSwitchGitBranch(branch)
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[11px] text-[#d4d4d4] hover:bg-[#2d2d2d] hover:text-white"
                >
                  <span className="grid size-3 shrink-0 place-items-center text-[#4ec9b0]">
                    {branch === gitBranch ? <Check size={11} /> : null}
                  </span>
                  <span className="truncate">{branch}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onOpenProblems}
          className={`hover:underline ${errorCount > 0 ? 'text-[#f48771]' : ''}`}
          title="Open Problems panel"
        >
          {errorCount} ✕ · {warningCount} ⚠
        </button>
        {bridgeCount > 0 && (
          <span className="rounded bg-[#222222] px-1.5 font-mono text-[10px] text-[#d4d4d4]">
            Bridge: {bridgeCount}
          </span>
        )}
        {latestRevisionId && (
          <button
            onClick={onOpenRevisions}
            className="flex items-center gap-1 hover:underline"
            title="Open Edit Memory"
          >
            <History size={11} /> {latestRevisionId}
          </button>
        )}
        {pendingPatchCount > 0 && (
          <button
            onClick={onOpenDiff}
            className="flex items-center gap-1 rounded bg-white/15 px-1.5 hover:bg-white/25"
          >
            <GitCompareArrows size={11} />
            {pendingPatchCount} Patch{pendingPatchCount > 1 ? 'es' : ''}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onCycleTheme && (
          <button
            type="button"
            onClick={onCycleTheme}
            title={`Switch Theme (Current: ${THEME_LABELS[theme]})`}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[#a3a3a3] hover:bg-[#2a2a2a] hover:text-white"
          >
            <Palette size={11} />
            <span>{THEME_LABELS[theme]}</span>
          </button>
        )}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            title="Keyboard Shortcuts (Ctrl+K Ctrl+S)"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[#a3a3a3] hover:bg-[#2a2a2a] hover:text-white"
          >
            <Keyboard size={11} />
          </button>
        )}
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span className="hidden sm:inline">Spaces: 2</span>
        <span className="hidden md:inline">UTF-8</span>
        <span>{languageLabel}</span>
      </div>
    </footer>
  )
}
