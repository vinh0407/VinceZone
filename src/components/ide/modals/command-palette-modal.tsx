'use client'

import { Command, FileCode2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceFile } from '../agent-types'
import { fileIcon } from '../workspace-defaults'

export type PaletteAction = {
  id: string
  label: string
  category: string
  shortcut?: string
  run: () => void
}

function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 1
  if (t === q) return 1000
  if (t.startsWith(q)) return 600
  const idx = t.indexOf(q)
  if (idx >= 0) return 300 - idx
  let qi = 0
  let score = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      qi += 1
      score += 10
    }
  }
  return qi === q.length ? score : 0
}

export function CommandPaletteModal({
  mode,
  files,
  actions,
  onOpenFile,
  onClose,
}: {
  mode: 'files' | 'commands'
  files: WorkspaceFile[]
  actions: PaletteAction[]
  onOpenFile: (path: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(mode === 'commands' ? '>' : '')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setQuery(mode === 'commands' ? '>' : '')
    setSelectedIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 10)
  }, [mode])

  const isCommandMode = query.startsWith('>')
  const cleanQuery = (isCommandMode ? query.slice(1) : query).trim()

  const items = useMemo(() => {
    if (isCommandMode) {
      return actions
        .map((action) => ({
          kind: 'action' as const,
          id: action.id,
          action,
          score: cleanQuery ? fuzzyScore(`${action.category}: ${action.label}`, cleanQuery) : 1,
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
    }
    return files
      .map((file) => ({
        kind: 'file' as const,
        id: file.path,
        file,
        score: cleanQuery
          ? Math.max(fuzzyScore(file.name, cleanQuery) * 1.4, fuzzyScore(file.path, cleanQuery))
          : 1,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24)
  }, [actions, cleanQuery, files, isCommandMode])

  const clampedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1))

  const executeSelected = (idx = clampedIndex) => {
    const picked = items[idx]
    if (!picked) return
    onClose()
    if (picked.kind === 'file') {
      onOpenFile(picked.file.path)
    } else {
      picked.action.run()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-16 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-[#3a3a3a] bg-[#181818] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[#2b2b2b] bg-[#141414] px-3 py-2.5">
          {isCommandMode ? (
            <Command size={14} className="shrink-0 text-[#d4d4d4]" />
          ) : (
            <Search size={14} className="shrink-0 text-[#9d9d9d]" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (items.length) setSelectedIndex((prev) => (prev + 1) % items.length)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (items.length) setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                executeSelected()
              }
            }}
            placeholder={
              isCommandMode
                ? 'Type an IDE command (e.g. Format, Split, Zen, Git, Test)…'
                : 'Search files by name (type > for commands)…'
            }
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-[#6e6e6e]"
          />
          <span className="rounded border border-[#333333] bg-[#1e1e1e] px-1.5 py-0.5 font-mono text-[9px] text-[#9d9d9d]">
            {isCommandMode ? 'Commands' : 'Quick Open'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="mini-button"
            title="Close (Esc)"
          >
            <X size={13} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[11px] text-[#737373]">
              No matching {isCommandMode ? 'commands' : 'files'}.
            </p>
          ) : (
            items.map((item, index) => {
              const active = index === clampedIndex
              if (item.kind === 'file') {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => executeSelected(index)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
                      active ? 'bg-[#2c2c2c] text-white' : 'text-[#cccccc] hover:bg-[#222222]'
                    }`}
                  >
                    {fileIcon(item.file)}
                    <span className="font-medium">{item.file.name}</span>
                    <span className="truncate font-mono text-[10px] text-[#858585]">
                      {item.file.path}
                    </span>
                    {item.file.dirty && (
                      <span className="ml-auto font-mono text-[10px] text-[#e2c08d]">M</span>
                    )}
                  </button>
                )
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => executeSelected(index)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] ${
                    active ? 'bg-[#2c2c2c] text-white' : 'text-[#cccccc] hover:bg-[#222222]'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <FileCode2 size={12} className="shrink-0 text-[#858585]" />
                    <span className="text-[10px] text-[#858585]">{item.action.category}:</span>
                    <span className="truncate">{item.action.label}</span>
                  </span>
                  {item.action.shortcut && (
                    <span className="shrink-0 rounded border border-[#3a3a3a] bg-[#141414] px-1.5 py-0.5 font-mono text-[9px] text-[#a3a3a3]">
                      {item.action.shortcut}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#2b2b2b] bg-[#141414] px-3 py-1.5 text-[10px] text-[#737373]">
          <span>↑↓ Navigate · Enter Open · Esc Close</span>
          <button
            type="button"
            onClick={() => {
              setQuery(isCommandMode ? '' : '>')
              setSelectedIndex(0)
              inputRef.current?.focus()
            }}
            className="text-[#a3a3a3] hover:text-white"
          >
            Switch to {isCommandMode ? 'Files (Ctrl+P)' : 'Commands (Ctrl+Shift+P)'}
          </button>
        </div>
      </div>
    </div>
  )
}
