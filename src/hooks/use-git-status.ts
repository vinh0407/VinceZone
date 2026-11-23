'use client'

import { useCallback, useEffect, useState } from 'react'

export type LiveGitSummary = {
  isRepo: boolean
  branch: string
  branches: string[]
  ahead: number
  behind: number
}

export function useGitStatus(
  rootPath: string | undefined,
  onNotify?: (opts: { title: string; detail?: string; variant?: 'info' | 'success' | 'error' }) => void,
  onAfterCheckout?: () => void,
) {
  const [summary, setSummary] = useState<LiveGitSummary>({
    isRepo: false,
    branch: 'main',
    branches: [],
    ahead: 0,
    behind: 0,
  })

  const refreshGitSummary = useCallback(async () => {
    if (!rootPath) {
      setSummary({ isRepo: false, branch: 'main', branches: [], ahead: 0, behind: 0 })
      return
    }
    try {
      const res = await fetch(`/api/git?root=${encodeURIComponent(rootPath)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        isRepo?: boolean
        branch?: string
        branches?: string[]
        ahead?: number
        behind?: number
      }
      if (data.isRepo && data.branch) {
        setSummary({
          isRepo: true,
          branch: data.branch,
          branches: data.branches ?? [data.branch],
          ahead: data.ahead ?? 0,
          behind: data.behind ?? 0,
        })
      }
    } catch {
      // ignore when not a git repo
    }
  }, [rootPath])

  useEffect(() => {
    void refreshGitSummary()
  }, [refreshGitSummary])

  const syncBranchFromSidebar = useCallback((branch: string, branches: string[]) => {
    setSummary((prev) => ({
      ...prev,
      isRepo: true,
      branch,
      branches: branches.length ? branches : prev.branches,
    }))
  }, [])

  const switchGitBranch = useCallback(
    async (branch: string) => {
      if (!rootPath || !branch.trim()) return false
      try {
        const res = await fetch('/api/git', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'checkout', root: rootPath, branch }),
        })
        const data = (await res.json()) as { ok?: boolean; error?: string }
        if (!res.ok || !data.ok) {
          onNotify?.({
            title: `Checkout failed (${branch})`,
            detail: data.error || 'Could not switch branch.',
            variant: 'error',
          })
          return false
        }
        onNotify?.({
          title: `Switched to branch ${branch}`,
          variant: 'success',
        })
        await refreshGitSummary()
        onAfterCheckout?.()
        return true
      } catch (err) {
        onNotify?.({
          title: 'Git checkout error',
          detail: err instanceof Error ? err.message : 'Network error',
          variant: 'error',
        })
        return false
      }
    },
    [onAfterCheckout, onNotify, refreshGitSummary, rootPath],
  )

  return {
    gitSummary: summary,
    refreshGitSummary,
    syncBranchFromSidebar,
    switchGitBranch,
  }
}
