'use client'

import { BookMarked, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { PromptTemplate } from '@/hooks/use-prompt-library'

export function PromptLibraryPopover({
  prompts,
  currentDraft,
  onInsert,
  onSavePrompt,
  onDeletePrompt,
  onClose,
}: {
  prompts: PromptTemplate[]
  currentDraft: string
  onInsert: (content: string) => void
  onSavePrompt: (title: string, content: string) => void
  onDeletePrompt: (id: string) => void
  onClose: () => void
}) {
  const [newTitle, setNewTitle] = useState('')

  return (
    <div className="border-b border-[#2b2b2b] bg-[#161616] p-2 text-[11px] text-[#e5e5e5]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-semibold text-[#e6cfa0]">
          <BookMarked size={12} /> Prompt Library ({prompts.length})
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-[#7a7a7a] hover:bg-[#262626] hover:text-white"
        >
          <X size={11} />
        </button>
      </div>
      {currentDraft.trim().length > 0 && (
        <div className="mb-2 flex items-center gap-1 rounded border border-[#c9a24d]/30 bg-[#12100c] p-1">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) {
                onSavePrompt(newTitle, currentDraft)
                setNewTitle('')
              }
            }}
            placeholder="Save current draft as template title…"
            className="min-w-0 flex-1 bg-transparent px-1.5 py-0.5 text-[10.5px] text-white outline-none placeholder:text-[#7a7a7a]"
          />
          <button
            type="button"
            disabled={!newTitle.trim()}
            onClick={() => {
              onSavePrompt(newTitle, currentDraft)
              setNewTitle('')
            }}
            className="flex items-center gap-0.5 rounded bg-[#c9a24d] px-2 py-0.5 text-[10px] font-semibold text-[#111111] hover:bg-[#ddb968] disabled:opacity-30"
          >
            <Plus size={10} /> Save
          </button>
        </div>
      )}
      <div className="max-h-44 space-y-1 overflow-y-auto">
        {prompts.map((tpl) => (
          <div
            key={tpl.id}
            className="group flex items-start gap-1.5 rounded border border-[#262626] bg-[#1b1b1b] px-2 py-1.5 hover:border-[#444444]"
          >
            <button
              type="button"
              onClick={() => {
                onInsert(tpl.content)
                onClose()
              }}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate font-medium text-white">{tpl.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[10px] text-[#9a9a9a]">{tpl.content}</p>
            </button>
            {!tpl.builtIn && (
              <button
                type="button"
                onClick={() => onDeletePrompt(tpl.id)}
                className="rounded p-1 text-[#737373] opacity-0 hover:bg-[#2a2a2a] hover:text-[#f48771] group-hover:opacity-100"
                title="Delete template"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
