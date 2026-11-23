'use client'

import {
  Bug,
  CircleDot,
  CornerDownLeft,
  Link2,
  Mail,
  Maximize2,
  Play,
  RotateCcw,
  Square,
  StepForward,
  TerminalSquare,
  Trash2,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BridgeMessage } from '@/lib/agent-bridge'
import type { CommunicationEvent, TerminalHistoryEntry, WorkspaceFile } from './agent-types'
import type { EditorDiagnostic } from './status-bar'

export function BottomPanel({
  open,
  maximized,
  height = 200,
  activeTab,
  projectName,
  rootPath,
  files,
  activeFile,
  diagnostics = [],
  runState,
  debugState,
  debugLine,
  agentCount,
  communicationEvents,
  bridgeMessages = [],
  terminalEntries,
  terminalRunning,
  onRunTerminalCommand,
  onClearTerminal,
  onSetOpen,
  onToggleMaximized,
  onSelectTab,
  onOpenFile,
  onStartDebug,
  onContinueDebug,
  onStepOverDebug,
  onStopDebug,
}: {
  open: boolean
  maximized: boolean
  height?: number
  activeTab: 'terminal' | 'problems' | 'output' | 'debug' | 'mail'
  projectName: string
  rootPath?: string
  files: WorkspaceFile[]
  activeFile?: WorkspaceFile
  diagnostics?: EditorDiagnostic[]
  runState: 'idle' | 'running' | 'success'
  debugState: 'idle' | 'starting' | 'paused' | 'running'
  debugLine: number
  agentCount: number
  communicationEvents: CommunicationEvent[]
  bridgeMessages?: BridgeMessage[]
  terminalEntries: TerminalHistoryEntry[]
  terminalRunning: boolean
  onRunTerminalCommand: (command: string) => void
  onClearTerminal: () => void
  onSetOpen: (open: boolean) => void
  onToggleMaximized: () => void
  onSelectTab: (tab: 'terminal' | 'problems' | 'output' | 'debug' | 'mail') => void
  onOpenFile: (path: string, line?: number) => void
  onStartDebug: () => void
  onContinueDebug: () => void
  onStepOverDebug: () => void
  onStopDebug: () => void
}) {
  const [commandInput, setCommandInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyCursor, setHistoryCursor] = useState<number>(-1)

  const quickScripts = useMemo(() => {
    const pkgFile = files.find((f) => f.path === 'package.json' || f.name === 'package.json')
    if (!pkgFile) return ['git status', 'pnpm typecheck', 'pnpm test']
    try {
      const parsed = JSON.parse(pkgFile.content) as { scripts?: Record<string, string> }
      const keys = Object.keys(parsed.scripts ?? {})
      const preferred = ['typecheck', 'test', 'lint', 'build', 'build:exe']
      const picked = [
        ...preferred.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !preferred.includes(k)),
      ].slice(0, 5)
      return picked.length ? picked.map((name) => `pnpm ${name}`) : ['git status']
    } catch {
      return ['git status', 'pnpm typecheck', 'pnpm test']
    }
  }, [files])

  const dirtyFiles = useMemo(() => files.filter((file) => file.dirty), [files])
  const totalProblems = diagnostics.length + dirtyFiles.length
  const totalBridgeCount = communicationEvents.length + bridgeMessages.length

  if (!open) {
    return (
      <button
        onClick={() => onSetOpen(true)}
        className="flex h-7 shrink-0 items-center gap-2 border-t border-[#2b2b2b] bg-[#181818] px-3 text-[11px] uppercase tracking-wide text-[#9d9d9d] hover:text-white"
      >
        <TerminalSquare size={12} /> Terminal
        {diagnostics.length > 0 && (
          <span className="rounded bg-[#2a1414] px-1.5 py-0.5 font-mono text-[9px] text-[#f48771]">
            {diagnostics.length} problem{diagnostics.length > 1 ? 's' : ''}
          </span>
        )}
      </button>
    )
  }

  const submitCommand = (explicit?: string) => {
    const trimmed = (explicit ?? commandInput).trim()
    if (!trimmed || terminalRunning) return
    setCommandHistory((prev) => [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 40))
    setHistoryCursor(-1)
    onRunTerminalCommand(trimmed)
    if (!explicit) setCommandInput('')
  }

  return (
    <div
      style={maximized ? { height: '55%' } : { height }}
      className="flex shrink-0 flex-col border-t border-[#2b2b2b] bg-[#181818]"
    >
      <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-[#2b2b2b] px-3">
        <div className="flex h-full gap-5 text-[11px] font-medium uppercase tracking-wide">
          {(
            [
              { id: 'problems', label: `Problems${totalProblems ? ` (${totalProblems})` : ''}` },
              { id: 'output', label: 'Output' },
              { id: 'debug', label: 'Debug Console' },
              { id: 'terminal', label: 'Terminal' },
              { id: 'mail', label: `Agent Bridge (${totalBridgeCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={
                activeTab === tab.id
                  ? 'border-b border-[#e5e5e5] text-white'
                  : 'text-[#858585] hover:text-[#cccccc]'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {activeTab === 'debug' && debugState !== 'idle' && (
            <div className="mr-2 flex items-center gap-0.5 rounded border border-[#3c3c3c] bg-[#252526] p-0.5">
              <button className="mini-button" title="Continue" onClick={onContinueDebug}>
                <Play size={11} className="text-[#e5e5e5]" />
              </button>
              <button className="mini-button" title="Step over" onClick={onStepOverDebug}>
                <StepForward size={11} className="text-[#cccccc]" />
              </button>
              <button className="mini-button" title="Restart" onClick={onStartDebug}>
                <RotateCcw size={11} />
              </button>
              <button className="mini-button" title="Stop debugging" onClick={onStopDebug}>
                <Square size={9} className="text-[#f48771]" fill="currentColor" />
              </button>
            </div>
          )}
          {activeTab === 'terminal' && (
            <button className="mini-button" title="Clear terminal" onClick={onClearTerminal}>
              <Trash2 size={12} />
            </button>
          )}
          <span className="mr-2 rounded bg-[#252526] px-1.5 py-0.5 font-mono text-[10px] text-[#9d9d9d]">
            pwsh · in-process
          </span>
          <button
            className="mini-button"
            title={maximized ? 'Restore panel' : 'Maximize panel'}
            onClick={onToggleMaximized}
          >
            <Maximize2 size={11} />
          </button>
          <button className="mini-button" title="Close panel (Ctrl+J)" onClick={() => onSetOpen(false)}>
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#181818]">
        {activeTab === 'terminal' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#242424] bg-[#151515] px-3 py-1">
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#737373]">
                Quick Run:
              </span>
              {quickScripts.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  disabled={terminalRunning}
                  onClick={() => submitCommand(cmd)}
                  className="shrink-0 rounded border border-[#303030] bg-[#1d1d1d] px-2 py-0.5 font-mono text-[10px] text-[#d4d4d4] hover:border-[#555555] hover:text-white disabled:opacity-40"
                >
                  {cmd}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5 text-[#cccccc]">
              <p className="text-[#858585]">
                VinceZone Local In-Process Terminal · cwd:{' '}
                <span className="text-[#e5e5e5]">{rootPath || projectName}</span>
              </p>
              {terminalEntries.length === 0 ? (
                <p className="mt-1 text-[#6e6e6e]">
                  Type a shell command below (e.g. <span className="text-[#d4d4d4]">pnpm test</span>{' '}
                  or <span className="text-[#d4d4d4]">git status</span>). Press{' '}
                  <span className="text-[#d4d4d4]">↑ / ↓</span> for command history.
                </p>
              ) : (
                terminalEntries.map((entry) => (
                  <div key={entry.id} className="mt-2 border-t border-[#2b2b2b] pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[#a3a3a3]">PS&gt;</span>
                      <span className="text-white">{entry.command}</span>
                      <button
                        type="button"
                        onClick={() => submitCommand(entry.command)}
                        className="rounded px-1 text-[9px] text-[#858585] hover:bg-[#2a2a2a] hover:text-white"
                        title="Re-run command"
                      >
                        rerun
                      </button>
                      <span
                        className={`ml-auto text-[10px] ${
                          entry.exitCode === 0 ? 'text-[#cccccc]' : 'text-[#f48771]'
                        }`}
                      >
                        exit {entry.exitCode} · {entry.durationMs}ms
                      </span>
                    </div>
                    {entry.stdout && (
                      <pre className="mt-1 whitespace-pre-wrap text-[11px] text-[#cccccc]">
                        {entry.stdout}
                      </pre>
                    )}
                    {entry.stderr && (
                      <pre className="mt-1 whitespace-pre-wrap text-[11px] text-[#f48771]">
                        {entry.stderr}
                      </pre>
                    )}
                  </div>
                ))
              )}
              {terminalRunning && (
                <p className="mt-2 text-[#d4d4d4]">Running local command…</p>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-[#2b2b2b] bg-[#141414] px-3 py-1.5 font-mono text-[12px]">
              <span className="text-[#a3a3a3]">PS&gt;</span>
              <input
                value={commandInput}
                onChange={(event) => {
                  setCommandInput(event.target.value)
                  setHistoryCursor(-1)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submitCommand()
                  } else if (event.key === 'ArrowUp' && commandHistory.length > 0) {
                    event.preventDefault()
                    const nextIdx = Math.min(historyCursor + 1, commandHistory.length - 1)
                    setHistoryCursor(nextIdx)
                    setCommandInput(commandHistory[nextIdx])
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    if (historyCursor <= 0) {
                      setHistoryCursor(-1)
                      setCommandInput('')
                    } else {
                      const nextIdx = historyCursor - 1
                      setHistoryCursor(nextIdx)
                      setCommandInput(commandHistory[nextIdx])
                    }
                  }
                }}
                placeholder="Run command in workspace (Enter · ↑/↓ history)…"
                disabled={terminalRunning}
                className="min-w-0 flex-1 bg-transparent text-[#ffffff] outline-none placeholder:text-[#6e6e6e]"
              />
              <button
                onClick={() => submitCommand()}
                disabled={!commandInput.trim() || terminalRunning}
                className="flex items-center gap-1 rounded bg-[#e5e5e5] px-2 py-0.5 text-[10px] font-medium text-[#111111] hover:bg-white disabled:opacity-30"
              >
                <CornerDownLeft size={10} /> Run
              </button>
            </div>
          </div>
        )}

        {activeTab === 'problems' && (
          <div className="divide-y divide-[#2b2b2b] text-[11px]">
            {diagnostics.length === 0 && dirtyFiles.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-[#858585]">
                <TriangleAlert size={13} className="text-[#4ec9b0]" />
                No TypeScript errors or unsaved warnings in workspace.
              </div>
            ) : (
              <>
                {diagnostics.map((diag, idx) => (
                  <button
                    key={`${diag.path}:${diag.line}:${diag.column}:${idx}`}
                    onClick={() => onOpenFile(diag.path, diag.line)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#cccccc] hover:bg-[#2a2d2e]"
                  >
                    {diag.severity === 'error' ? (
                      <XCircle size={12} className="shrink-0 text-[#f48771]" />
                    ) : (
                      <TriangleAlert size={12} className="shrink-0 text-[#dcdcaa]" />
                    )}
                    <span className="truncate">{diag.message}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-[#858585]">
                      {diag.path}:{diag.line}:{diag.column}
                    </span>
                  </button>
                ))}
                {dirtyFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => onOpenFile(file.path, 1)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#cccccc] hover:bg-[#2a2d2e]"
                  >
                    <CircleDot size={12} className="shrink-0 text-[#dcdcaa]" />
                    <span>Unsaved modifications (Ctrl+S to write to disk)</span>
                    <span className="ml-auto font-mono text-[10px] text-[#858585]">{file.path}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'output' && (
          <div className="p-3 font-mono text-[12px] leading-5 text-[#cccccc]">
            <p>
              [VinceZone Studio] Workspace: <span className="text-[#9cdcfe]">{projectName}</span>
            </p>
            <p className="text-[#858585]">
              › Loaded {files.length} files · Runtime: VinceZone In-Process Local Bridge (0 TCP ports)
            </p>
            {runState === 'running' && (
              <p className="text-[#dcdcaa]">› Executing workspace run command…</p>
            )}
            {runState === 'success' && (
              <p className="text-[#4ec9b0]">✓ Run completed — see Terminal tab for stdout/stderr.</p>
            )}
          </div>
        )}

        {activeTab === 'mail' && (
          <div className="space-y-1 p-3 font-mono text-[11px]">
            {bridgeMessages.length === 0 && communicationEvents.length === 0 ? (
              <p className="text-[#858585]">
                No inter-agent bridge messages yet. Type @BE/@FE/@QA in chat or click Bridge → to
                connect specialist agents.
              </p>
            ) : (
              <>
                {[...bridgeMessages]
                  .reverse()
                  .slice(0, 15)
                  .map((msg) => (
                    <div
                      key={msg.id}
                      className="flex items-center gap-2 rounded border border-[#2f2f2f] bg-[#1b1b1b] px-2.5 py-1.5"
                    >
                      <Link2 size={11} className="shrink-0 text-[#e5e5e5]" />
                      <span className="text-[#6e6e6e]">{msg.timestamp.slice(11, 19)}</span>
                      <span className="shrink-0 text-[#e5e5e5]">
                        @{msg.fromRole} → @{msg.toRole}
                      </span>
                      <span className="rounded bg-[#262626] px-1 text-[9px] uppercase text-[#a3a3a3]">
                        {msg.kind}
                      </span>
                      <span className="truncate text-[#9d9d9d]">{msg.content}</span>
                    </div>
                  ))}
                {[...communicationEvents]
                  .reverse()
                  .slice(0, 15)
                  .map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-2 rounded border border-[#2b2b2b] bg-[#1e1e1e] px-2.5 py-1.5"
                    >
                      <Mail
                        size={11}
                        className={
                          event.kind === 'conflict'
                            ? 'text-[#f48771]'
                            : event.kind === 'report'
                              ? 'text-[#4ec9b0]'
                              : 'text-[#9cdcfe]'
                        }
                      />
                      <span className="text-[#6e6e6e]">{event.timestamp.slice(11, 19)}</span>
                      <span className="text-[#cccccc]">
                        {event.senderId} → {event.recipientId || 'all'}
                      </span>
                      <span className="truncate text-[#9d9d9d]">{event.description}</span>
                    </div>
                  ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'debug' && (
          <DebugConsole
            state={debugState}
            fileName={activeFile?.name ?? 'workspace'}
            projectName={projectName}
            debugLine={debugLine}
            agentCount={agentCount}
            onStart={onStartDebug}
          />
        )}
      </div>
    </div>
  )
}

function DebugConsole({
  state,
  fileName,
  projectName,
  debugLine,
  agentCount,
  onStart,
}: {
  state: 'idle' | 'starting' | 'paused' | 'running'
  fileName: string
  projectName: string
  debugLine: number
  agentCount: number
  onStart: () => void
}) {
  if (state === 'idle') {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-[11px] text-[#858585]">
        <Bug size={15} />
        <span>No active debug session.</span>
        <button onClick={onStart} className="text-[#9cdcfe] hover:underline">
          Start debugging
        </button>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-[220px_1fr] font-mono text-[11px]">
      <div className="border-r border-[#2b2b2b] p-2">
        <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#858585]">
          Variables
        </p>
        <div className="space-y-1 text-[#cccccc]">
          <p>
            <span className="text-[#9cdcfe]">line</span>: {debugLine}
          </p>
          <p>
            <span className="text-[#9cdcfe]">agents</span>: {agentCount}
          </p>
          <p>
            <span className="text-[#9cdcfe]">workspace</span>: &quot;{projectName}&quot;
          </p>
        </div>
        <p className="mb-1.5 mt-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#858585]">
          Call Stack
        </p>
        <div className="rounded bg-[#04395e] px-2 py-1 text-white">
          {fileName}:{debugLine}
        </div>
      </div>
      <div className="overflow-y-auto p-3 leading-5 text-[#cccccc]">
        <p className="text-[#c586c0]">
          [VinceZone Debug] {state === 'starting' ? 'Attaching debugger…' : 'Debugger attached'}
        </p>
        {state === 'paused' && (
          <p className="text-[#dcdcaa]">Paused on breakpoint at {fileName}:{debugLine}:1</p>
        )}
        {state === 'running' && <p className="debug-running text-[#4ec9b0]">Running</p>}
      </div>
    </div>
  )
}
