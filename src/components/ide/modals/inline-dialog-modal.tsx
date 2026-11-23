'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export type DialogRequest =
  | {
      kind: 'prompt'
      title: string
      description?: string
      placeholder?: string
      initialValue?: string
      confirmLabel?: string
      onConfirm: (value: string) => void
    }
  | {
      kind: 'confirm'
      title: string
      description?: string
      confirmLabel?: string
      danger?: boolean
      onConfirm: () => void
    }

export function InlineDialogModal({
  dialog,
  onClose,
}: {
  dialog: DialogRequest | null
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dialog) return
    if (dialog.kind === 'prompt') {
      setValue(dialog.initialValue ?? '')
      window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 20)
    }
  }, [dialog])

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, onClose])

  if (!dialog) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (dialog.kind === 'prompt') {
      const trimmed = value.trim()
      if (!trimmed) return
      onClose()
      dialog.onConfirm(trimmed)
    } else {
      onClose()
      dialog.onConfirm()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 pt-[16vh] backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-lg border border-[#3e3e3e] bg-[#1e1e1e] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.75)]"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-[#f3f3f3]">{dialog.title}</h3>
          <button type="button" onClick={onClose} className="mini-button" aria-label="Close dialog">
            <X size={13} />
          </button>
        </div>

        {dialog.description && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#a3a3a3]">{dialog.description}</p>
        )}

        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={dialog.placeholder}
            className="mt-3 w-full rounded border border-[#454545] bg-[#141414] px-2.5 py-1.5 font-mono text-[12px] text-[#f0f0f0] outline-none focus:border-[#9cdcfe]"
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#3c3c3c] bg-[#252526] px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#2f2f2f]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={dialog.kind === 'prompt' && !value.trim()}
            className={`rounded px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-40 ${
              dialog.kind === 'confirm' && dialog.danger
                ? 'bg-[#b9382e] text-white hover:bg-[#cf4438]'
                : 'bg-[#e5e5e5] text-[#111111] hover:bg-white'
            }`}
          >
            {dialog.confirmLabel ?? (dialog.kind === 'prompt' ? 'Confirm' : 'Continue')}
          </button>
        </div>
      </form>
    </div>
  )
}
