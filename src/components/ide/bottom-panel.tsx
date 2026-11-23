'use client'

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bug,
  CircleDot,
  CornerDownLeft,
  Link2,
  Mail,
  Maximize2,
  Play,
  Plus,
  Plug,
  RotateCcw,
  Square,
  StepForward,
  TerminalSquare,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import type { BridgeMessage } from '@/lib/agent-bridge'
import type { DebugSnapshot } from '@/lib/debugger-runtime'
import type { CommunicationEvent, TerminalHistoryEntry, WorkspaceFile } from './agent-types'
import type { EditorDiagnostic } from './status-bar'

const InteractiveTerminal = dynamic(
  () => import('./interactive-terminal').then((m) => m.InteractiveTerminal),
  { ssr: false },
)

export function BottomPanel({
  open,
  maximized,
  height = 220,
  activeTab,
  projectName,
  rootPath,
  files,
  activeFile,
  diagnostics = [],
  runState,
  debugState,
  debugLine,
  debugSnapshot,
  breakpoints = {},
  agentCount,
  communicationEvents,
  bridgeMessages = [],
  terminalEntries,
  pendingTerminalCmd,
  onClearTerminal,
  onSetOpen,
  onToggleMaximized,
  onSelectTab,
  onOpenFile,
  onStartDebug,
  onAttachDebug,
  onContinueDebug,
  onStepOverDebug,
  onStepIntoDebug,
  onStepOutDebug,
  onStopDebug,
  onEvaluateDebug,
  watchResults = [],
  onAddWatch,
  onRemoveWatch,
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
  debugSnapshot?: DebugSnapshot | null
  breakpoints?: Record<string, number[]>
  agentCount: number
  communicationEvents: CommunicationEvent[]
  bridgeMessages?: BridgeMessage[]
  terminalEntries: TerminalHistoryEntry[]
  terminalRunning: boolean
  pendingTerminalCmd?: { command: string; seq: number } | null
  onRunTerminalCommand: (command: string) => void
  onClearTerminal: () => void
  onSetOpen: (open: boolean) => void
  onToggleMaximized: () => void
  onSelectTab: (tab: 'terminal' | 'problems' | 'output' | 'debug' | 'mail') => void
  onOpenFile: (path: string, line?: number) => void
  onStartDebug: () => void
  onAttachDebug?: (port: number) => Promise<void>
  onContinueDebug: () => void
  onStepOverDebug: () => void
  onStepIntoDebug?: () => void
  onStepOutDebug?: () => void
  onStopDebug: () => void
  onEvaluateDebug?: (expression: string) => Promise<void>
  watchResults?: Array<{ expr: string; value: string; ok: boolean }>
  onAddWatch?: (expression: string) => void
  onRemoveWatch?: (expression: string) => void
}) {
  const quickScripts = useMemo(() => {
    const pkgFile = files.find((f) => f.path === 'package.json' || f.name === 'package.json')
    if (!pkgFile?.content) return ['git status', 'pnpm typecheck', 'pnpm test']
    try {
      const parsed = JSON.parse(pkgFile.content) as { scripts?: Record<string, string> }
      const keys = Object.keys(parsed.scripts ?? {})
      const preferred = ['dev', 'typecheck', 'test', 'lint', 'build']
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
  const totalBreakpoints = Object.values(breakpoints).reduce((sum, list) => sum + list.length, 0)

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
        {totalBreakpoints > 0 && (
          <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] text-[#e5e5e5]">
            {totalBreakpoints} bp
          </span>
        )}
      </button>
    )
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
              {
                id: 'debug',
                label: `Debug${totalBreakpoints ? ` (${totalBreakpoints})` : ''}`,
              },
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
              <button className="mini-button" title="Continue (F5)" onClick={onContinueDebug}>
                <Play size={11} className="text-[#4ec9b0]" />
              </button>
              <button className="mini-button" title="Step Over (F10)" onClick={onStepOverDebug}>
                <StepForward size={11} className="text-[#e5e5e5]" />
              </button>
              {onStepIntoDebug && (
                <button className="mini-button" title="Step Into (F11)" onClick={onStepIntoDebug}>
                  <ArrowDownToLine size={11} className="text-[#cccccc]" />
                </button>
              )}
              {onStepOutDebug && (
                <button
                  className="mini-button"
                  title="Step Out (Shift+F11)"
                  onClick={onStepOutDebug}
                >
                  <ArrowUpFromLine size={11} className="text-[#cccccc]" />
                </button>
              )}
              <button className="mini-button" title="Restart Debugger" onClick={onStartDebug}>
                <RotateCcw size={11} />
              </button>
              <button className="mini-button" title="Stop Debugging" onClick={onStopDebug}>
                <Square size={9} className="text-[#f48771]" fill="currentColor" />
              </button>
            </div>
          )}
          <span className="mr-2 rounded bg-[#252526] px-1.5 py-0.5 font-mono text-[10px] text-[#9d9d9d]">
            xterm · interactive
          </span>
          <button
            className="mini-button"
            title={maximized ? 'Restore panel' : 'Maximize panel'}
            onClick={onToggleMaximized}
          >
            <Maximize2 size={11} />
          </button>
          <button
            className="mini-button"
            title="Close panel (Ctrl+J)"
            onClick={() => onSetOpen(false)}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[#181818]">
        {activeTab === 'terminal' && (
          <InteractiveTerminal
            rootPath={rootPath}
            quickScripts={quickScripts}
            pendingCommand={pendingTerminalCmd}
          />
        )}

        {activeTab === 'problems' && (
          <div className="h-full divide-y divide-[#2b2b2b] overflow-y-auto text-[11px]">
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
                    <span className="ml-auto font-mono text-[10px] text-[#858585]">
                      {file.path}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'output' && (
          <div className="h-full overflow-y-auto p-3 font-mono text-[11.5px] leading-5 text-[#cccccc]">
            <div className="flex items-center justify-between">
              <p>
                [VinceZone Studio] Workspace:{' '}
                <span className="text-[#9cdcfe]">{projectName}</span>
              </p>
              {terminalEntries.length > 0 && (
                <button
                  type="button"
                  onClick={onClearTerminal}
                  className="text-[10px] text-[#858585] hover:text-white"
                >
                  Clear Output
                </button>
              )}
            </div>
            <p className="text-[#858585]">
              › Indexed {files.length} files ({files.filter((f) => f.lazy).length} lazy-loaded) ·
              Live File Watcher active · Agents: {agentCount}
            </p>
            {runState === 'running' && (
              <p className="text-[#dcdcaa]">› Executing command in Interactive Terminal…</p>
            )}
            {runState === 'success' && (
              <p className="text-[#4ec9b0]">✓ Last command completed.</p>
            )}
            {terminalEntries.slice(-8).map((entry) => (
              <div key={entry.id} className="mt-2 border-t border-[#262626] pt-1.5">
                <p className="text-[#e5e5e5]">
                  $ {entry.command}{' '}
                  <span className="text-[#737373]">
                    (exit {entry.exitCode} · {entry.durationMs}ms)
                  </span>
                </p>
                {entry.stdout && (
                  <pre className="whitespace-pre-wrap text-[10.5px] text-[#b5b5b5]">
                    {entry.stdout.slice(0, 1200)}
                  </pre>
                )}
                {entry.stderr && (
                  <pre className="whitespace-pre-wrap text-[10.5px] text-[#f48771]">
                    {entry.stderr.slice(0, 1200)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'mail' && (
          <div className="h-full space-y-1 overflow-y-auto p-3 font-mono text-[11px]">
            {bridgeMessages.length === 0 && communicationEvents.length === 0 ? (
              <p className="text-[#858585]">
                No inter-agent bridge messages yet. Ask @PM or mention @BE/@FE/@QA in chat to watch
                agents collaborate.
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
            fileName={activeFile?.path ?? 'workspace'}
            debugLine={debugLine}
            snapshot={debugSnapshot}
            breakpoints={breakpoints}
            watchResults={watchResults}
            onOpenFile={onOpenFile}
            onStart={onStartDebug}
            onAttach={onAttachDebug}
            onEvaluate={onEvaluateDebug}
            onAddWatch={onAddWatch}
            onRemoveWatch={onRemoveWatch}
          />
        )}
      </div>
    </div>
  )
}

function DebugConsole({
  state,
  fileName,
  debugLine,
  snapshot,
  breakpoints,
  watchResults = [],
  onOpenFile,
  onStart,
  onAttach,
  onEvaluate,
  onAddWatch,
  onRemoveWatch,
}: {
  state: 'idle' | 'starting' | 'paused' | 'running'
  fileName: string
  debugLine: number
  snapshot?: DebugSnapshot | null
  breakpoints: Record<string, number[]>
  watchResults?: Array<{ expr: string; value: string; ok: boolean }>
  onOpenFile: (path: string, line?: number) => void
  onStart: () => void
  onAttach?: (port: number) => Promise<void>
  onEvaluate?: (expression: string) => Promise<void>
  onAddWatch?: (expression: string) => void
  onRemoveWatch?: (expression: string) => void
}) {
  const [evalInput, setEvalInput] = useState('')
  const [attachPort, setAttachPort] = useState('9229')
  const [watchInput, setWatchInput] = useState('')
  const bpList = Object.entries(breakpoints).flatMap(([bpPath, lines]) =>
    lines.map((line) => ({ path: bpPath, line })),
  )

  if (state === 'idle' && !snapshot?.consoleLines.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4 text-[11px] text-[#858585]">
        <div className="flex items-center gap-2">
          <Bug size={15} className="text-[#cccccc]" />
          <span>Click left gutter in Editor to set Breakpoints, then launch Node/Python Debugger or Attach.</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={onStart}
            className="rounded bg-[#e5e5e5] px-3 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white"
          >
            Start Real Debugger ({fileName.split('/').pop()})
          </button>
          {onAttach && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const port = Number(attachPort) || 9229
                void onAttach(port)
              }}
              className="flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#141414] px-1.5 py-0.5"
            >
              <Plug size={10} className="text-[#9cdcfe]" />
              <input
                type="number"
                min={1024}
                max={65535}
                value={attachPort}
                onChange={(e) => setAttachPort(e.target.value)}
                className="w-14 bg-transparent font-mono text-[10px] text-[#e5e5e5] outline-none"
                title="V8 Inspector Port (e.g. 9229)"
              />
              <button
                type="submit"
                className="rounded bg-[#2a2a2a] px-2 py-0.5 text-[10px] font-medium text-[#e5e5e5] hover:bg-[#3a3a3a]"
              >
                Attach
              </button>
            </form>
          )}
          {bpList.length > 0 && (
            <span className="font-mono text-[10px] text-[#cccccc]">
              {bpList.length} breakpoint(s) ready
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-[240px_1fr] font-mono text-[10.5px]">
      <div className="overflow-y-auto border-r border-[#2b2b2b] p-2">
        <p className="mb-1.5 font-sans text-[9.5px] font-semibold uppercase tracking-wider text-[#858585]">
          Local Variables ({snapshot?.variables.length ?? 0})
        </p>
        {snapshot?.variables.length ? (
          <div className="space-y-0.5 text-[#cccccc]">
            {snapshot.variables.map((v) => (
              <p key={v.name} className="truncate" title={`${v.name} (${v.type}): ${v.value}`}>
                <span className="text-[#9cdcfe]">{v.name}</span>:{' '}
                <span className="text-[#ce9178]">{v.value}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[#666666]">
            {state === 'paused' ? 'No local variables in scope' : 'Waiting for pause…'}
          </p>
        )}

        <p className="mb-1 mt-3 font-sans text-[9.5px] font-semibold uppercase tracking-wider text-[#858585]">
          Watch ({watchResults.length})
        </p>
        {onAddWatch && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = watchInput.trim()
              if (!trimmed) return
              setWatchInput('')
              onAddWatch(trimmed)
            }}
            className="mb-1.5 flex items-center gap-1 rounded border border-[#333333] bg-[#141414] px-1.5 py-0.5"
          >
            <input
              type="text"
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              placeholder="Add expression…"
              className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-[#e5e5e5] outline-none placeholder:text-[#666666]"
            />
            <button type="submit" disabled={!watchInput.trim()} className="mini-button disabled:opacity-30">
              <Plus size={10} />
            </button>
          </form>
        )}
        {watchResults.length > 0 && (
          <div className="space-y-0.5 text-[#cccccc]">
            {watchResults.map((w) => (
              <div
                key={w.expr}
                className="group flex items-center justify-between gap-1 rounded px-1 py-0.5 hover:bg-[#222222]"
                title={`${w.expr} => ${w.value}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[#9cdcfe]">{w.expr}</span>:{' '}
                  <span className={w.ok ? 'text-[#4ec9b0]' : 'text-[#858585]'}>{w.value}</span>
                </span>
                {onRemoveWatch && (
                  <button
                    type="button"
                    onClick={() => onRemoveWatch(w.expr)}
                    className="hidden text-[#858585] hover:text-[#f48771] group-hover:inline-flex"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mb-1 mt-3 font-sans text-[9.5px] font-semibold uppercase tracking-wider text-[#858585]">
          Call Stack ({snapshot?.callFrames.length ?? 0})
        </p>
        {snapshot?.callFrames.length ? (
          <div className="space-y-0.5">
            {snapshot.callFrames.map((frame, i) => (
              <button
                key={frame.callFrameId}
                type="button"
                onClick={() => onOpenFile(frame.path, frame.line)}
                className={`block w-full truncate rounded px-1.5 py-0.5 text-left ${
                  i === 0
                    ? 'bg-[#2a2a2a] font-semibold text-white'
                    : 'text-[#a3a3a3] hover:bg-[#222222]'
                }`}
              >
                {frame.functionName} · {frame.path.split('/').pop()}:{frame.line}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded bg-[#222222] px-1.5 py-0.5 text-[#cccccc]">
            {fileName.split('/').pop()}:{debugLine}
          </div>
        )}

        {bpList.length > 0 && (
          <>
            <p className="mb-1 mt-3 font-sans text-[9.5px] font-semibold uppercase tracking-wider text-[#858585]">
              Breakpoints ({bpList.length})
            </p>
            <div className="space-y-0.5">
              {bpList.map((bp) => (
                <button
                  key={`${bp.path}:${bp.line}`}
                  type="button"
                  onClick={() => onOpenFile(bp.path, bp.line)}
                  className="flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-[#cccccc] hover:bg-[#222222]"
                >
                  <span className="size-2 shrink-0 rounded-full bg-[#e51400]" />
                  <span className="truncate">
                    {bp.path.split('/').pop()}:{bp.line}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5 leading-5 text-[#cccccc]">
          {snapshot?.error && <p className="text-[#f48771]">Error: {snapshot.error}</p>}
          {snapshot?.consoleLines.map((line, idx) => (
            <p
              key={idx}
              className={
                line.startsWith('[stderr]')
                  ? 'text-[#f48771]'
                  : line.startsWith('>')
                    ? 'text-[#9cdcfe]'
                    : line.startsWith('[Debugger]')
                      ? 'text-[#c586c0]'
                      : 'text-[#d4d4d4]'
              }
            >
              {line}
            </p>
          ))}
          {state === 'paused' && snapshot?.activeLocation && (
            <p className="mt-1 text-[#dcdcaa]">
              ● Paused at {snapshot.activeLocation.path}:{snapshot.activeLocation.line}
            </p>
          )}
        </div>

        {onEvaluate && (
          <div className="flex items-center gap-1.5 border-t border-[#2b2b2b] bg-[#141414] px-2.5 py-1">
            <span className="text-[#9cdcfe]">&gt;</span>
            <input
              value={evalInput}
              onChange={(e) => setEvalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && evalInput.trim()) {
                  e.preventDefault()
                  const expr = evalInput.trim()
                  setEvalInput('')
                  void onEvaluate(expr)
                }
              }}
              placeholder={
                state === 'paused'
                  ? 'Evaluate expression in paused frame (e.g. x + 1, Object.keys(obj))…'
                  : 'Pause debugger to evaluate expressions…'
              }
              disabled={state !== 'paused'}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-[#666666] disabled:opacity-40"
            />
            <button
              type="button"
              disabled={state !== 'paused' || !evalInput.trim()}
              onClick={() => {
                const expr = evalInput.trim()
                setEvalInput('')
                void onEvaluate(expr)
              }}
              className="flex items-center gap-1 rounded bg-[#2a2a2a] px-2 py-0.5 text-[10px] text-white hover:bg-[#3a3a3a] disabled:opacity-30"
            >
              <CornerDownLeft size={10} /> Eval
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
