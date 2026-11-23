'use client'

import { GitBranch, GitCompareArrows, History, Monitor } from 'lucide-react'
import type { WorkspaceFile } from './agent-types'

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
}

export function StatusBar({
  activeFile,
  cursor,
  dirtyCount,
  pendingPatchCount,
  latestRevisionId,
  debugActive,
  isDesktop,
  onOpenProblems,
  onOpenDiff,
  onOpenRevisions,
}: {
  activeFile?: WorkspaceFile
  cursor: { line: number; column: number }
  dirtyCount: number
  pendingPatchCount: number
  latestRevisionId?: string
  debugActive: boolean
  isDesktop: boolean
  onOpenProblems: () => void
  onOpenDiff: () => void
  onOpenRevisions: () => void
}) {
  const languageLabel = activeFile
    ? activeFile.name.endsWith('.tsx')
      ? 'TypeScript React'
      : activeFile.name.endsWith('.jsx')
        ? 'JavaScript React'
        : (languageLabels[activeFile.language] ?? activeFile.language)
    : 'Plain Text'

  return (
    <footer
      className={`flex h-[22px] shrink-0 select-none items-center justify-between px-2 text-[11px] text-white transition-colors ${
        debugActive ? 'bg-[#68217a]' : 'bg-[#0078d4]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 bg-black/15 px-1.5 py-0.5 font-medium">
          <Monitor size={11} />
          {isDesktop ? 'VinceZone Desktop' : 'VinceZone Local'} :40704
        </span>
        <span className="flex items-center gap-1">
          <GitBranch size={11} /> main{dirtyCount > 0 ? `* (${dirtyCount})` : ''}
        </span>
        <button onClick={onOpenProblems} className="hover:underline">
          0 ✕ · {dirtyCount} ⚠
        </button>
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
      <div className="flex items-center gap-4">
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>{languageLabel}</span>
      </div>
    </footer>
  )
}
