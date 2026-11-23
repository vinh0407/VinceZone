'use client'

import { useEffect, useRef } from 'react'

export type ContextMenuItem =
  | { type: 'separator' }
  | {
      type?: 'item'
      label: string
      shortcut?: string
      danger?: boolean
      disabled?: boolean
      onSelect: () => void
    }

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const clampedX = typeof window !== 'undefined' ? Math.min(x, window.innerWidth - 220) : x
  const clampedY =
    typeof window !== 'undefined' ? Math.min(y, window.innerHeight - items.length * 30 - 24) : y

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: Math.max(8, clampedX), top: Math.max(8, clampedY) }}
      className="fixed z-[95] min-w-[205px] rounded-md border border-[#454545] bg-[#1f1f1f] py-1 shadow-[0_12px_34px_rgba(0,0,0,0.72)]"
    >
      {items.map((item, idx) =>
        item.type === 'separator' ? (
          <div key={`sep-${idx}`} className="my-1 h-px bg-[#303030]" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
            className={`flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-[12px] transition disabled:cursor-default disabled:opacity-40 ${
              item.danger
                ? 'text-[#f48771] hover:bg-[#3a1f1d]'
                : 'text-[#d4d4d4] hover:bg-[#2e2e2e] hover:text-white'
            }`}
          >
            <span className="truncate">{item.label}</span>
            {item.shortcut && (
              <span className="shrink-0 font-mono text-[10px] text-[#858585]">{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  )
}
