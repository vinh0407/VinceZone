'use client'

import '@xterm/xterm/css/xterm.css'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { Plus, Square, TerminalSquare, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

type TerminalTab = {
  id: string
  title: string
  alive: boolean
}

export function InteractiveTerminal({
  rootPath,
  quickScripts,
  pendingCommand,
}: {
  rootPath?: string
  quickScripts: string[]
  pendingCommand?: { command: string; seq: number } | null
}) {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const lineBufferRef = useRef('')
  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef(-1)
  const activeTabRef = useRef('')
  const lastSeqRef = useRef(0)

  activeTabRef.current = activeTabId

  const writeToSession = useCallback(async (sessionId: string, data: string) => {
    if (!sessionId) return
    await fetch('/api/terminal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'write', id: sessionId, data }),
    }).catch(() => {})
  }, [])

  const interruptSession = useCallback(async (sessionId: string) => {
    if (!sessionId) return
    await fetch('/api/terminal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'interrupt', id: sessionId }),
    }).catch(() => {})
  }, [])

  const createNewTab = useCallback(
    async (indexHint?: number) => {
      try {
        const res = await fetch('/api/terminal/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            cwd: rootPath,
            title: `Terminal ${indexHint ?? tabs.length + 1}`,
          }),
        })
        if (!res.ok) return null
        const data = (await res.json()) as {
          ok?: boolean
          session?: { id: string; title: string; alive: boolean }
        }
        if (!data.session) return null
        const created = data.session
        setTabs((current) => [...current, created])
        setActiveTabId(created.id)
        return created.id
      } catch {
        return null
      }
    },
    [rootPath, tabs.length],
  )

  const closeTab = useCallback(
    async (id: string) => {
      await fetch('/api/terminal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kill', id }),
      }).catch(() => {})
      setTabs((current) => {
        const next = current.filter((t) => t.id !== id)
        if (activeTabRef.current === id) {
          setActiveTabId(next[next.length - 1]?.id ?? '')
        }
        return next
      })
    },
    [],
  )

  // Initialize first terminal tab automatically on mount
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch('/api/terminal/session', { cache: 'no-store' }).catch(() => null)
      if (cancelled) return
      if (res?.ok) {
        const data = (await res.json()) as { sessions?: TerminalTab[] }
        const alive = (data.sessions ?? []).filter((s) => s.alive)
        if (alive.length > 0) {
          setTabs(alive)
          setActiveTabId(alive[0].id)
          return
        }
      }
      await createNewTab(1)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mount xterm.js instance + ResizeObserver
  useEffect(() => {
    const container = hostRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      lineHeight: 1.35,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      scrollback: 3000,
      theme: {
        background: '#141414',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#141414',
        selectionBackground: 'rgba(255, 255, 255, 0.22)',
        black: '#1e1e1e',
        red: '#f48771',
        green: '#4ec9b0',
        yellow: '#dcdcaa',
        blue: '#9cdcfe',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightWhite: '#ffffff',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      fit.fit()
    } catch {
      // ignore before layout settles
    }

    termRef.current = term
    fitRef.current = fit

    const sendCommandLine = (cmd: string) => {
      const sid = activeTabRef.current
      if (!sid) return
      if (cmd.trim()) {
        historyRef.current = [cmd, ...historyRef.current.filter((h) => h !== cmd)].slice(0, 60)
      }
      historyIdxRef.current = -1
      void writeToSession(sid, `${cmd}\r\n`)
    }

    const dataDisposable = term.onData((data) => {
      const sid = activeTabRef.current
      if (!sid) return

      // Ctrl+C -> interrupt running command
      if (data === '\x03') {
        lineBufferRef.current = ''
        void interruptSession(sid)
        return
      }

      // Enter
      if (data === '\r' || data === '\n') {
        const line = lineBufferRef.current
        lineBufferRef.current = ''
        term.write('\r\n')
        sendCommandLine(line)
        return
      }

      // Backspace
      if (data === '\x7f' || data === '\b') {
        if (lineBufferRef.current.length > 0) {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1)
          term.write('\b \b')
        }
        return
      }

      // Arrow Up / Down for command history
      if (data === '\x1b[A') {
        const hist = historyRef.current
        if (!hist.length) return
        const nextIdx = Math.min(hist.length - 1, historyIdxRef.current + 1)
        historyIdxRef.current = nextIdx
        const clearLen = lineBufferRef.current.length
        if (clearLen > 0) term.write('\b \b'.repeat(clearLen))
        lineBufferRef.current = hist[nextIdx]
        term.write(lineBufferRef.current)
        return
      }
      if (data === '\x1b[B') {
        const hist = historyRef.current
        const clearLen = lineBufferRef.current.length
        if (clearLen > 0) term.write('\b \b'.repeat(clearLen))
        if (historyIdxRef.current <= 0) {
          historyIdxRef.current = -1
          lineBufferRef.current = ''
        } else {
          historyIdxRef.current -= 1
          lineBufferRef.current = hist[historyIdxRef.current]
          term.write(lineBufferRef.current)
        }
        return
      }

      // Printable text / pasted multi-line commands
      if (data.includes('\r') || data.includes('\n')) {
        const lines = data.replace(/\r\n/g, '\n').split('\n')
        for (let i = 0; i < lines.length; i += 1) {
          const seg = lines[i]
          if (i < lines.length - 1) {
            const full = lineBufferRef.current + seg
            lineBufferRef.current = ''
            term.write(`${seg}\r\n`)
            sendCommandLine(full)
          } else {
            lineBufferRef.current += seg
            term.write(seg)
          }
        }
        return
      }

      if (data >= ' ' || data === '\t') {
        lineBufferRef.current += data
        term.write(data)
      }
    })

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // ignore
      }
    })
    observer.observe(container)

    return () => {
      dataDisposable.dispose()
      observer.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [interruptSession, writeToSession])

  // Stream live SSE output from active terminal session into xterm.js
  useEffect(() => {
    const term = termRef.current
    if (!activeTabId || !term) return

    term.reset()
    lineBufferRef.current = ''
    const controller = new AbortController()

    void (async () => {
      try {
        const res = await fetch(
          `/api/terminal/session?id=${encodeURIComponent(activeTabId)}`,
          { cache: 'no-store', signal: controller.signal },
        )
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const frames = pending.split('\n\n')
          pending = frames.pop() ?? ''
          for (const frame of frames) {
            const dataLine = frame
              .split('\n')
              .find((line) => line.startsWith('data:'))
              ?.slice(5)
              .trim()
            if (!dataLine) continue
            try {
              const ev = JSON.parse(dataLine) as {
                type: 'output' | 'exit'
                data?: string
              }
              if (ev.type === 'output' && ev.data) {
                term.write(ev.data)
              } else if (ev.type === 'exit') {
                setTabs((current) =>
                  current.map((t) => (t.id === activeTabId ? { ...t, alive: false } : t)),
                )
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }
      } catch {
        // stream aborted on tab switch
      }
    })()

    return () => controller.abort()
  }, [activeTabId])

  // Execute external Run / Quick Run commands directly inside active interactive terminal
  useEffect(() => {
    if (!pendingCommand || pendingCommand.seq === lastSeqRef.current) return
    lastSeqRef.current = pendingCommand.seq
    const cmd = pendingCommand.command.trim()
    if (!cmd) return
    void (async () => {
      let sid = activeTabRef.current
      if (!sid) {
        sid = (await createNewTab(1)) || ''
      }
      if (!sid) return
      termRef.current?.write(`\r\n\x1b[90m> ${cmd}\x1b[0m\r\n`)
      await writeToSession(sid, `${cmd}\r\n`)
    })()
  }, [createNewTab, pendingCommand, writeToSession])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#141414]">
      <div className="flex items-center justify-between gap-2 border-b border-[#252525] bg-[#161616] px-2.5 py-1">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-[10px] transition ${
                tab.id === activeTabId
                  ? 'bg-[#2a2a2a] font-medium text-white'
                  : 'text-[#8e8e8e] hover:bg-[#222222] hover:text-[#cccccc]'
              }`}
            >
              <TerminalSquare size={10} />
              <span>{tab.title}</span>
              <span
                className={`size-1.5 rounded-full ${tab.alive ? 'bg-[#4ec9b0]' : 'bg-[#666666]'}`}
              />
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeTab(tab.id)
                  }}
                  className="text-[#737373] hover:text-white"
                  title="Close terminal tab"
                >
                  <X size={9} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => void createNewTab()}
            className="mini-button"
            title="New Interactive Terminal Tab"
          >
            <Plus size={11} />
          </button>

          <div className="mx-1 h-3 w-px bg-[#2c2c2c]" />

          {quickScripts.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => {
                if (!activeTabId) return
                termRef.current?.write(`\r\n\x1b[90m> ${cmd}\x1b[0m\r\n`)
                void writeToSession(activeTabId, `${cmd}\r\n`)
                termRef.current?.focus()
              }}
              className="shrink-0 rounded border border-[#2f2f2f] bg-[#1c1c1c] px-1.5 py-0.5 font-mono text-[9.5px] text-[#cccccc] hover:border-[#555555] hover:text-white"
            >
              {cmd}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!activeTabId}
            onClick={() => void interruptSession(activeTabId)}
            className="flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#222222] px-1.5 py-0.5 font-mono text-[9.5px] text-[#f48771] hover:bg-[#2d2d2d] disabled:opacity-35"
            title="Send Ctrl+C interrupt to stop running command"
          >
            <Square size={8} fill="currentColor" /> Ctrl+C
          </button>
          <button
            type="button"
            onClick={() => termRef.current?.clear()}
            className="mini-button"
            title="Clear terminal screen"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <div
        ref={hostRef}
        onClick={() => termRef.current?.focus()}
        className="min-h-0 flex-1 overflow-hidden px-2 py-1.5"
      />
    </div>
  )
}
