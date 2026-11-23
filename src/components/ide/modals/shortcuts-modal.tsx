'use client'

import { Keyboard, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

export type ShortcutEntry = {
  category: 'Navigation' | 'Editor' | 'AI & Multi-Agent' | 'Debug & Terminal' | 'Workspace'
  action: string
  keys: string
}

export const KEYBOARD_SHORTCUTS: ShortcutEntry[] = [
  { category: 'Navigation', action: 'Quick Open File', keys: 'Ctrl+P' },
  { category: 'Navigation', action: 'Command Palette', keys: 'Ctrl+Shift+P' },
  { category: 'Navigation', action: 'Explorer Sidebar', keys: 'Ctrl+Shift+E' },
  { category: 'Navigation', action: 'Disk Search & Replace', keys: 'Ctrl+Shift+F' },
  { category: 'Navigation', action: 'Keyboard Shortcuts Cheatsheet', keys: 'Ctrl+K Ctrl+S' },
  { category: 'Editor', action: 'Save Active File', keys: 'Ctrl+S' },
  { category: 'Editor', action: 'New File', keys: 'Ctrl+N' },
  { category: 'Editor', action: 'Close Active Tab', keys: 'Ctrl+W' },
  { category: 'Editor', action: 'Inline AI Edit (Ctrl+K)', keys: 'Ctrl+K' },
  { category: 'Editor', action: 'Accept AI Tab Ghost-Text', keys: 'Tab' },
  { category: 'Editor', action: 'Go to Definition (Cross-File LSP)', keys: 'F12' },
  { category: 'Editor', action: 'Find All References (Cross-File LSP)', keys: 'Shift+F12' },
  { category: 'Editor', action: 'Format Document', keys: 'Shift+Alt+F' },
  { category: 'AI & Multi-Agent', action: 'Toggle Multi-Agent Control Center', keys: 'Ctrl+Shift+A' },
  { category: 'AI & Multi-Agent', action: 'Attach Screenshot / Image in Chat', keys: 'Ctrl+V' },
  { category: 'AI & Multi-Agent', action: 'Mention File or Invoke Skill', keys: '@ /' },
  { category: 'Debug & Terminal', action: 'Toggle Bottom Terminal Panel', keys: 'Ctrl+`' },
  { category: 'Debug & Terminal', action: 'Start / Continue Debugger', keys: 'F5' },
  { category: 'Debug & Terminal', action: 'Step Over', keys: 'F10' },
  { category: 'Debug & Terminal', action: 'Step Into', keys: 'F11' },
  { category: 'Workspace', action: 'Open Local Folder', keys: 'Ctrl+O' },
  { category: 'Workspace', action: 'Open Settings', keys: 'Ctrl+,' },
]

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return KEYBOARD_SHORTCUTS
    return KEYBOARD_SHORTCUTS.filter(
      (item) =>
        item.action.toLowerCase().includes(q) ||
        item.keys.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    )
  }, [query])

  if (!open) return null

  const categories = Array.from(new Set(filtered.map((item) => item.category)))

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 pt-[10vh] backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[#3e3e3e] bg-[#1e1e1e] shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-[#2b2b2b] px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#f3f3f3]">
            <Keyboard size={15} className="text-[#9cdcfe]" />
            Keyboard Shortcuts
            <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[10px] font-normal text-[#a3a3a3]">
              Ctrl+K Ctrl+S
            </span>
          </div>
          <button type="button" onClick={onClose} className="mini-button" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="border-b border-[#2b2b2b] px-4 py-2.5">
          <div className="flex items-center gap-2 rounded border border-[#3c3c3c] bg-[#141414] px-2.5 py-1.5">
            <Search size={13} className="text-[#858585]" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shortcuts (e.g. debug, diff, F12, terminal)…"
              className="w-full bg-transparent text-[12px] text-[#e5e5e5] outline-none placeholder:text-[#737373]"
            />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {categories.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[#858585]">
              No matching shortcuts found.
            </div>
          ) : (
            categories.map((cat) => (
              <section key={cat}>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#858585]">
                  {cat}
                </h4>
                <div className="divide-y divide-[#282828] rounded border border-[#2c2c2c] bg-[#181818]">
                  {filtered
                    .filter((item) => item.category === cat)
                    .map((item) => (
                      <div
                        key={`${item.category}-${item.action}`}
                        className="flex items-center justify-between px-3 py-1.5 text-[12px]"
                      >
                        <span className="text-[#d4d4d4]">{item.action}</span>
                        <kbd className="rounded border border-[#3e3e3e] bg-[#242424] px-2 py-0.5 font-mono text-[11px] text-[#f0f0f0]">
                          {item.keys}
                        </kbd>
                      </div>
                    ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
