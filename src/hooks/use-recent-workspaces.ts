'use client'

import { useCallback, useEffect, useState } from 'react'

export type RecentWorkspaceEntry = {
  name: string
  rootPath: string
  lastOpenedAt: string
}

const STORAGE_KEY = 'vincezone-recent-workspaces'
const MAX_RECENT = 8

export function useRecentWorkspaces() {
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspaceEntry[]>([])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        setRecentWorkspaces(
          parsed
            .filter(
              (item): item is RecentWorkspaceEntry =>
                Boolean(item) &&
                typeof item.rootPath === 'string' &&
                typeof item.name === 'string',
            )
            .slice(0, MAX_RECENT),
        )
      }
    } catch {
      // ignore corrupted storage
    }
  }, [])

  const recordRecentWorkspace = useCallback((name: string, rootPath?: string) => {
    const cleanRoot = rootPath?.trim()
    if (!cleanRoot) return
    setRecentWorkspaces((prev) => {
      const next: RecentWorkspaceEntry[] = [
        { name: name.trim() || cleanRoot, rootPath: cleanRoot, lastOpenedAt: new Date().toISOString() },
        ...prev.filter((item) => item.rootPath.toLowerCase() !== cleanRoot.toLowerCase()),
      ].slice(0, MAX_RECENT)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore quota errors
      }
      return next
    })
  }, [])

  const removeRecentWorkspace = useCallback((rootPath: string) => {
    setRecentWorkspaces((prev) => {
      const next = prev.filter((item) => item.rootPath.toLowerCase() !== rootPath.toLowerCase())
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return {
    recentWorkspaces,
    recordRecentWorkspace,
    removeRecentWorkspace,
  }
}
