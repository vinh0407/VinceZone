'use client'

import {
  Bug,
  CircleDot,
  CornerDownLeft,
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
} from 'lucide-react'
import { useState } from 'react'
import type { CommunicationEvent, TerminalHistoryEntry, WorkspaceFile } from './agent-types'

export function BottomPanel({
  open,
  maximized,
  activeTab,
  projectName,
  rootPath,
  files,
  activeFile,
  runState,
  debugState,
  debugLine,
  agentCount,
  communicationEvents,
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
  activeTab: 'terminal' | 'problems' | 'output' | 'debug' | 'mail'
  projectName: string
  rootPath?: string
  files: WorkspaceFile[]
  activeFile?: WorkspaceFile
  runState: 'idle' | 'running' | 'success'
  debugState: 'idle' | 'starting' | 'paused' | 'running'
  debugLine: number
  agentCount: number
  communicationEvents: CommunicationEvent[]
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

  if (!open) {
    return (
      <button
        onClick={() => onSetOpen(true)}
        className="flex h-7 shrink-0 items-center gap-2 border-t border-[#2b2b2b] bg-[#181818] px-3 text-[11px] uppercase tracking-wide text-[#9d9d9d] hover:text-white"
      >
        <TerminalSquare size={12} /> Terminal
      </button>
    )
  }

  const submitCommand = () => {
    const trimmed = commandInput.trim()
    if (!trimmed || terminalRunning) return
    onRunTerminalCommand(trimmed)
    setCommandInput('')
  }

  return (
    <div
      className={`${maximized ? 'h-[55%]' : 'h-48'} flex shrink-0 flex-col border-t border-[#2b2b2b] bg-[#181818]`}
    >
      <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-[#2b2b2b] px-3">
        <div className="flex h-full gap-5 text-[11px] font-medium uppercase tracking-wide">
          {(
            [
              { id: 'problems', label: 'Problems' },
              { id: 'output', label: 'Output' },
              { id: 'debug', label: 'Debug Console' },
              { id: 'terminal', label: 'Terminal' },
              { id: 'mail', label: `Agent Mail (${communicationEvents.length})` },
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
            pwsh · local
          </span>
          <button
            className="mini-button"
            title={maximized ? 'Restore panel' : 'Maximize panel'}
            onClick={onToggleMaximized}
          >
            <Maximize2 size={11} />
          </button>
          <button className="mini-button" title="Close panel" onClick={() => onSetOpen(false)}>
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#181818]">
        {activeTab === 'terminal' && (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5 text-[#cccccc]">
              <p className="text-[#858585]">
                VinceZone Desktop Terminal · cwd:{' '}
                <span className="text-[#e5e5e5]">{rootPath || projectName}</span>
              </p>
              {terminalEntries.length === 0 ? (
                <p className="mt-1 text-[#6e6e6e]">
                  Type a shell command below (e.g. <span className="text-[#d4d4d4]">pnpm test</span>{' '}
                  or <span className="text-[#d4d4d4]">git status</span>) to execute locally on
                  localhost:40704.
                </p>
              ) : (
                terminalEntries.map((entry) => (
                  <div key={entry.id} className="mt-2 border-t border-[#2b2b2b] pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[#a3a3a3]">PS&gt;</span>
                      <span className="text-white">{entry.command}</span>
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
                onChange={(event) => setCommandInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submitCommand()
                  }
                }}
                placeholder="Run command in workspace (Enter)…"
                disabled={terminalRunning}
                className="min-w-0 flex-1 bg-transparent text-[#ffffff] outline-none placeholder:text-[#6e6e6e]"
              />
              <button
                onClick={submitCommand}
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
            {files.filter((file) => file.dirty).length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-[#858585]">
                <TriangleAlert size={13} className="text-[#4ec9b0]" />
                No unsaved file warnings in workspace.
              </div>
            ) : (
              files
                .filter((file) => file.dirty)
                .map((file) => (
                  <button
                    key={file.path}
                    onClick={() => onOpenFile(file.path, 1)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[#cccccc] hover:bg-[#2a2d2e]"
                  >
                    <CircleDot size={12} className="text-[#dcdcaa]" />
                    <span>Unsaved modifications (Ctrl+S to write to disk)</span>
                    <span className="ml-auto font-mono text-[#858585]">{file.path}</span>
                  </button>
                ))
            )}
          </div>
        )}

        {activeTab === 'output' && (
          <div className="p-3 font-mono text-[12px] leading-5 text-[#cccccc]">
            <p>
              [VinceZone Studio] Workspace: <span className="text-[#9cdcfe]">{projectName}</span>
            </p>
            <p className="text-[#858585]">
              › Loaded {files.length} files · Local Runtime: http://localhost:40704
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
            {communicationEvents.length === 0 ? (
              <p className="text-[#858585]">
                No inter-agent mail messages yet. Open VinceZone Multi-Agent Control Center to start
                or preview agent mail exchange.
              </p>
            ) : (
              [...communicationEvents]
                .reverse()
                .slice(0, 25)
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
                ))
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
