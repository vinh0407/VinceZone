'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DebugSnapshot } from '@/lib/debugger-runtime'
import type { WorkspaceFile } from '@/components/ide/agent-types'

export type WatchResultItem = {
  expr: string
  value: string
  ok: boolean
}

export function useDebugger({
  rootPath,
  activePath,
  cursorLine,
  filesRef,
  onOpenDebugLocation,
  onOpenDebugPanel,
  onNotify,
}: {
  rootPath?: string
  activePath: string
  cursorLine: number
  filesRef: React.MutableRefObject<WorkspaceFile[]>
  onOpenDebugLocation: (path: string, line: number) => void
  onOpenDebugPanel: () => void
  onNotify?: (opts: { title: string; detail?: string; variant?: 'info' | 'success' | 'error' }) => void
}) {
  const [debugState, setDebugState] = useState<'idle' | 'starting' | 'paused' | 'running'>('idle')
  const [debugLine, setDebugLine] = useState(5)
  const [breakpoints, setBreakpoints] = useState<Record<string, number[]>>({})
  const [debugSnapshot, setDebugSnapshot] = useState<DebugSnapshot | null>(null)
  const [watchExpressions, setWatchExpressions] = useState<string[]>([])
  const [watchResults, setWatchResults] = useState<WatchResultItem[]>([])
  const watchExprsRef = useRef<string[]>([])
  watchExprsRef.current = watchExpressions

  const flattenBreakpoints = useCallback((map: Record<string, number[]>) => {
    return Object.entries(map).flatMap(([bpPath, lines]) =>
      lines.map((line) => ({ path: bpPath, line })),
    )
  }, [])

  const evaluateWatchList = useCallback(async (expressions: string[]) => {
    if (expressions.length === 0) {
      setWatchResults([])
      return
    }
    const results: WatchResultItem[] = []
    for (const expr of expressions) {
      try {
        const res = await fetch('/api/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate', expression: expr }),
        })
        const data = (await res.json()) as { ok?: boolean; result?: string; error?: string }
        results.push({
          expr,
          ok: Boolean(data.ok),
          value: data.result ?? data.error ?? 'unavailable',
        })
      } catch {
        results.push({ expr, ok: false, value: 'error' })
      }
    }
    setWatchResults(results)
  }, [])

  const applyDebugSnapshot = useCallback(
    (snap: DebugSnapshot) => {
      setDebugSnapshot(snap)
      if (snap.status === 'paused') {
        setDebugState('paused')
        if (snap.activeLocation) {
          setDebugLine(snap.activeLocation.line)
          onOpenDebugLocation(snap.activeLocation.path, snap.activeLocation.line)
        }
        if (watchExprsRef.current.length > 0 && snap.callFrames.length > 0 && snap.pid) {
          void evaluateWatchList(watchExprsRef.current)
        }
      } else if (snap.status === 'running' || snap.status === 'starting') {
        setDebugState(snap.status)
      } else {
        setDebugState('idle')
        setWatchResults((prev) => prev.map((w) => ({ ...w, ok: false, value: '(not paused)' })))
      }
    },
    [evaluateWatchList, onOpenDebugLocation],
  )

  const addWatchExpression = useCallback(
    (expr: string) => {
      const clean = expr.trim()
      if (!clean) return
      setWatchExpressions((current) => {
        if (current.includes(clean)) return current
        const next = [...current, clean]
        if (debugState === 'paused') {
          void evaluateWatchList(next)
        } else {
          setWatchResults((prev) => [...prev, { expr: clean, value: '(waiting for pause)', ok: false }])
        }
        return next
      })
    },
    [debugState, evaluateWatchList],
  )

  const removeWatchExpression = useCallback((expr: string) => {
    setWatchExpressions((current) => current.filter((item) => item !== expr))
    setWatchResults((current) => current.filter((item) => item.expr !== expr))
  }, [])

  // Keep watch list aligned when expressions change while not paused
  useEffect(() => {
    if (watchExpressions.length === 0) setWatchResults([])
  }, [watchExpressions.length])

  const toggleBreakpoint = useCallback(
    (filePath: string, line: number) => {
      setBreakpoints((current) => {
        const existing = current[filePath] ?? []
        const nextLines = existing.includes(line)
          ? existing.filter((l) => l !== line)
          : [...existing, line].sort((a, b) => a - b)
        const nextMap = { ...current }
        if (nextLines.length === 0) delete nextMap[filePath]
        else nextMap[filePath] = nextLines

        if (debugState !== 'idle') {
          void fetch('/api/debug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'setBreakpoints',
              breakpoints: flattenBreakpoints(nextMap),
            }),
          }).catch(() => {})
        }
        return nextMap
      })
    },
    [debugState, flattenBreakpoints],
  )

  const controlDebugger = useCallback(
    async (action: 'resume' | 'stepOver' | 'stepInto' | 'stepOut' | 'stop') => {
      try {
        const res = await fetch('/api/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const data = (await res.json()) as { debug?: DebugSnapshot }
        if (data.debug) applyDebugSnapshot(data.debug)
        else if (action === 'stop') {
          setDebugState('idle')
          setDebugSnapshot(null)
        }
      } catch {
        if (action === 'stop') setDebugState('idle')
      }
    },
    [applyDebugSnapshot],
  )

  const evaluateInDebugger = useCallback(async (expression: string) => {
    try {
      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate', expression }),
      })
      const data = (await res.json()) as { debug?: DebugSnapshot }
      if (data.debug) setDebugSnapshot(data.debug)
    } catch {
      // ignore
    }
  }, [])

  const attachDebugger = useCallback(
    async (port: number) => {
      onOpenDebugPanel()
      setDebugState('starting')
      try {
        const res = await fetch('/api/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'attach', cwd: rootPath, port }),
        })
        const data = (await res.json()) as { ok?: boolean; debug?: DebugSnapshot; error?: string }
        if (!res.ok || !data.ok) {
          setDebugState('idle')
          onNotify?.({
            title: `Attach port ${port} failed`,
            detail: data.error || 'No Node V8 Inspector found on that port.',
            variant: 'error',
          })
          return
        }
        if (data.debug) applyDebugSnapshot(data.debug)
        onNotify?.({
          title: `Attached to V8 Inspector :${port}`,
          variant: 'success',
        })
      } catch (err) {
        setDebugState('idle')
        onNotify?.({
          title: `Attach port ${port} failed`,
          detail: err instanceof Error ? err.message : 'Unable to connect.',
          variant: 'error',
        })
      }
    },
    [applyDebugSnapshot, onNotify, onOpenDebugPanel, rootPath],
  )

  const debugProject = useCallback(async () => {
    onOpenDebugPanel()
    const currentFile = filesRef.current.find((f) => f.path === activePath)
    const lowerPath = currentFile?.path.toLowerCase() || ''
    setDebugLine(Math.max(1, cursorLine || 1))
    setDebugState('starting')

    const isLiveDebuggable =
      Boolean(currentFile) &&
      (/\.(js|mjs|cjs|mts|cts|py)$/i.test(lowerPath) ||
        (lowerPath.endsWith('.ts') && !lowerPath.endsWith('.d.ts') && !lowerPath.endsWith('.tsx')))

    if (isLiveDebuggable && currentFile) {
      try {
        const res = await fetch('/api/debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            cwd: rootPath,
            targetFile: currentFile.path,
            breakpoints: flattenBreakpoints(breakpoints),
          }),
        })
        const data = (await res.json()) as { ok?: boolean; debug?: DebugSnapshot; error?: string }
        if (data.debug) {
          applyDebugSnapshot(data.debug)
          return
        }
      } catch {
        // Fall through to diagnostic mode if CDP/pdb spawn fails
      }
    }

    const cmd = lowerPath.endsWith('.py')
      ? `python -m py_compile "${currentFile!.path}"`
      : 'pnpm exec tsc --noEmit'

    try {
      const response = await fetch('/api/runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-silent',
          command: cmd,
          cwd: rootPath,
        }),
      })
      const data = (await response.json()) as {
        ok?: boolean
        stdout?: string
        stderr?: string
        error?: string
      }
      const lines = [
        `[Debugger] Static inspect (${cmd})`,
        ...(data.stdout ? data.stdout.split(/\r?\n/) : []),
        ...(data.stderr ? data.stderr.split(/\r?\n/).map((l) => `[stderr] ${l}`) : []),
        ...(data.ok ? ['✓ Zero errors found. Open a .js/.ts/.py script for live stepping.'] : []),
      ].filter(Boolean)
      setDebugSnapshot({
        status: 'paused',
        targetFile: currentFile?.path ?? null,
        cwd: rootPath ?? null,
        pid: null,
        activeLocation: currentFile ? { path: currentFile.path, line: Math.max(1, cursorLine) } : null,
        callFrames: currentFile
          ? [
              {
                callFrameId: 'static-0',
                functionName: '(diagnostic check)',
                path: currentFile.path,
                line: Math.max(1, cursorLine),
                column: 1,
              },
            ]
          : [],
        variables: [],
        consoleLines: lines,
        error: data.error || null,
      })
      setDebugState('paused')
    } catch {
      setDebugState('idle')
    }
  }, [activePath, applyDebugSnapshot, breakpoints, cursorLine, filesRef, flattenBreakpoints, onOpenDebugPanel, rootPath])

  return {
    debugState,
    debugLine,
    breakpoints,
    debugSnapshot,
    watchResults,
    toggleBreakpoint,
    controlDebugger,
    evaluateInDebugger,
    attachDebugger,
    debugProject,
    addWatchExpression,
    removeWatchExpression,
  }
}
