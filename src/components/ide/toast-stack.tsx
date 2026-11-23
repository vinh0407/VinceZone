'use client'

import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { ToastItem } from '@/hooks/use-toast'

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-8 right-4 z-[90] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const accent =
          toast.variant === 'success'
            ? 'border-[#2e6b58] text-[#4ec9b0]'
            : toast.variant === 'error'
              ? 'border-[#6b2f2a] text-[#f48771]'
              : 'border-[#3c3c3c] text-[#cccccc]'
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-md border bg-[#1f1f1f]/95 px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.65)] backdrop-blur ${accent}`}
          >
            <span className="mt-0.5 shrink-0">
              {toast.variant === 'success' ? (
                <CheckCircle2 size={14} className="text-[#4ec9b0]" />
              ) : toast.variant === 'error' ? (
                <XCircle size={14} className="text-[#f48771]" />
              ) : (
                <Info size={14} className="text-[#9cdcfe]" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-[#f0f0f0]">{toast.title}</div>
              {toast.detail && (
                <div className="mt-0.5 line-clamp-2 text-[11px] text-[#a3a3a3]">{toast.detail}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="mini-button shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
