'use client'

import { useCallback, useRef, useState } from 'react'

export type ToastVariant = 'info' | 'success' | 'error'

export type ToastItem = {
  id: string
  title: string
  detail?: string
  variant: ToastVariant
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const seqRef = useRef(0)

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (input: { title: string; detail?: string; variant?: ToastVariant; durationMs?: number }) => {
      seqRef.current += 1
      const id = `toast-${Date.now()}-${seqRef.current}`
      const item: ToastItem = {
        id,
        title: input.title,
        detail: input.detail,
        variant: input.variant ?? 'info',
      }
      setToasts((current) => [...current.slice(-3), item])
      const duration = input.durationMs ?? (item.variant === 'error' ? 5000 : 3200)
      window.setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id))
      }, duration)
      return id
    },
    [],
  )

  return { toasts, pushToast, dismissToast }
}
