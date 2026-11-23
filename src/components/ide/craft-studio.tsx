'use client'

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Compass,
  Cpu,
  Download,
  FileSearch,
  Globe,
  Lock,
  Play,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  TerminalSquare,
  Unlock,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type CraftEngine = {
  id: string
  name: string
  found: boolean
  installable_here: boolean
  needed_for: string
  path: string | null
}

type CraftToolsetSummary = {
  id: string
  title: string
  total: number
  available: number
}

type CraftTool = {
  command: string
  tool: string
  toolset: string
  title: string
  summary: string
  needs_target: boolean
}

type CraftDoctorCheck = {
  name: string
  status: string
  message: string
  remediation?: string
}

type CraftStatusResponse = {
  installed: boolean
  binaryPath: string | null
  version: string | null
  analysisMode: string
  totalTools: number
  engines: CraftEngine[]
  toolsets: CraftToolsetSummary[]
  tools: CraftTool[]
  doctor: { checks?: CraftDoctorCheck[] }
}

type EvidenceEntry = {
  id: string
  kind: 'web-study' | 'triage' | 'tool'
  title: string
  mode: 'clean-room' | 'deep'
  durationMs: number
  ok: boolean
  timestamp: string
  payload: unknown
}

export function CraftStudio({
  projectName,
  onSendToAgents,
}: {
  projectName: string
  onSendToAgents: (summaryTitle: string, evidenceText: string, prompt: string) => void
}) {
  const [status, setStatus] = useState<CraftStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [deepMode, setDeepMode] = useState(false)
  const [view, setView] = useState<'simple' | 'workbench' | 'engines'>('simple')
  const [stage, setStage] = useState<'study' | 'build' | 'check' | 'ready'>('study')

  // Simple workflow state
  const [target, setTarget] = useState('http://localhost:40704')
  const [goal, setGoal] = useState('Study layout, typography, responsive structure, and craft an upgraded version')
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [evidenceLog, setEvidenceLog] = useState<EvidenceEntry[]>([])
  const [notice, setNotice] = useState('')

  // 323-tool workbench state
  const [toolSearch, setToolSearch] = useState('')
  const [selectedToolset, setSelectedToolset] = useState('all')
  const [selectedTool, setSelectedTool] = useState<CraftTool | null>(null)
  const [toolArgs, setToolArgs] = useState('--help')
  const [toolOutput, setToolOutput] = useState<string>('')

  // Setup plan state
  const [setupPlanOutput, setSetupPlanOutput] = useState<string>('')

  const flashNotice = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const refreshStatus = useCallback(
    async (modeDeep = deepMode) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/craft?mode=${modeDeep ? 'deep' : 'clean-room'}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = (await res.json()) as CraftStatusResponse
        setStatus(data)
        if (!selectedTool && data.tools.length > 0) {
          setSelectedTool(data.tools[0])
        }
      } finally {
        setLoading(false)
      }
    },
    [deepMode, selectedTool],
  )

  useEffect(() => {
    void refreshStatus(deepMode)
  }, [deepMode, refreshStatus])

  const filteredTools = useMemo(() => {
    const all = status?.tools ?? []
    const q = toolSearch.trim().toLowerCase()
    return all
      .filter((t) => selectedToolset === 'all' || t.toolset === selectedToolset)
      .filter(
        (t) =>
          !q ||
          t.command.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q) ||
          t.toolset.toLowerCase().includes(q),
      )
      .slice(0, 120)
  }, [status?.tools, selectedToolset, toolSearch])

  const runStudyWeb = async () => {
    if (!target.trim()) return
    setRunningAction('study-web')
    setStage('study')
    try {
      const res = await fetch('/api/craft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'study-web', target: target.trim(), deepMode }),
      })
      const data = await res.json()
      const entry: EvidenceEntry = {
        id: `ev-${Date.now()}`,
        kind: 'web-study',
        title: `Web Study (3 widths): ${target.trim()}`,
        mode: deepMode ? 'deep' : 'clean-room',
        durationMs: data.durationMs ?? 0,
        ok: Boolean(data.ok),
        timestamp: new Date().toLocaleTimeString(),
        payload: data.ok ? data.evidence : data,
      }
      setEvidenceLog((prev) => [entry, ...prev.slice(0, 19)])
      if (data.ok) {
        setStage('build')
        flashNotice('3-width Playwright study complete — ready to hand off to Multi-Agent team.')
      } else {
        flashNotice(data.error || 'Web study failed.')
      }
    } finally {
      setRunningAction(null)
    }
  }

  const runFileTriage = async () => {
    if (!target.trim()) return
    setRunningAction('triage')
    setStage('study')
    try {
      const res = await fetch('/api/craft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'triage', target: target.trim(), deepMode: true }),
      })
      const data = await res.json()
      const entry: EvidenceEntry = {
        id: `ev-${Date.now()}`,
        kind: 'triage',
        title: `Craft Triage: ${target.trim()}`,
        mode: 'deep',
        durationMs: data.durationMs ?? 0,
        ok: Boolean(data.ok),
        timestamp: new Date().toLocaleTimeString(),
        payload: data.data ?? data,
      }
      setEvidenceLog((prev) => [entry, ...prev.slice(0, 19)])
      if (data.ok) {
        setStage('build')
        flashNotice('Craft Anything triage captured structured evidence.')
      } else {
        flashNotice(data.stderr || data.error || 'Triage returned an error.')
      }
    } finally {
      setRunningAction(null)
    }
  }

  const runSelectedTool = async () => {
    if (!selectedTool) return
    setRunningAction('run-tool')
    try {
      const parsedArgs = toolArgs
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      const res = await fetch('/api/craft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-tool',
          command: selectedTool.command,
          args: parsedArgs,
          deepMode,
        }),
      })
      const data = await res.json()
      setToolOutput(JSON.stringify(data, null, 2))
      setEvidenceLog((prev) => [
        {
          id: `ev-${Date.now()}`,
          kind: 'tool',
          title: `Tool: ${selectedTool.command}`,
          mode: deepMode ? 'deep' : 'clean-room',
          durationMs: data.durationMs ?? 0,
          ok: Boolean(data.ok),
          timestamp: new Date().toLocaleTimeString(),
          payload: data.data ?? data,
        },
        ...prev.slice(0, 19),
      ])
    } finally {
      setRunningAction(null)
    }
  }

  const installEngine = async (engineId: string) => {
    setRunningAction(`engine-${engineId}`)
    try {
      const res = await fetch('/api/craft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install-engine', engineId }),
      })
      const data = await res.json()
      flashNotice(
        data.ok
          ? `Engine "${engineId}" installed successfully.`
          : data.stderr || data.error || `Failed to install ${engineId}.`,
      )
      await refreshStatus(deepMode)
    } finally {
      setRunningAction(null)
    }
  }

  const previewSetupPlan = async () => {
    setRunningAction('setup-plan')
    try {
      const res = await fetch('/api/craft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup-plan' }),
      })
      const data = await res.json()
      setSetupPlanOutput(JSON.stringify(data.data ?? data, null, 2))
    } finally {
      setRunningAction(null)
    }
  }

  const handleDispatchToAgents = () => {
    const latest = evidenceLog[0]
    const evidenceSnippet = latest
      ? JSON.stringify(latest.payload, null, 2).slice(0, 1600)
      : `Target: ${target}`
    setStage('check')
    onSendToAgents(
      `Craft Study: ${target}`,
      evidenceSnippet,
      `Craft Anything ${deepMode ? 'Deep' : 'Clean-room'} Build for "${target}": ${goal}. Use the captured Evidence Ledger in Project Memory, split tasks cleanly by territory (@ARCH, @FE, @BE, @QA), and verify parity at 3 screen widths.`,
    )
  }

  const foundEnginesCount = (status?.engines ?? []).filter((e) => e.found).length

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#141414] text-[#d4d4d4]">
      {/* Top Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#181818] px-3">
        <div className="flex items-center gap-2">
          <Compass size={15} className="text-white" />
          <span className="text-[12px] font-semibold text-white">Craft Studio</span>
          <span className="rounded border border-[#3a3a3a] bg-[#222222] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5]">
            {status?.installed
              ? `v${status.version} · ${status.totalTools} Tools`
              : loading
                ? 'Probing engine…'
                : 'CLI Missing'}
          </span>
          <span className="hidden rounded bg-[#222222] px-1.5 py-0.5 text-[10px] text-[#9d9d9d] lg:inline">
            {projectName}
          </span>
        </div>

        {/* Sub-view switcher */}
        <div className="flex items-center gap-1 rounded-md border border-[#2f2f2f] bg-[#121212] p-0.5 text-[10px]">
          {[
            { id: 'simple' as const, label: 'Study → Build', icon: Sparkles },
            { id: 'workbench' as const, label: `Workbench (${status?.totalTools ?? 323})`, icon: Wrench },
            {
              id: 'engines' as const,
              label: `Engines (${foundEnginesCount}/${status?.engines.length ?? 18})`,
              icon: Cpu,
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition ${
                  view === item.id
                    ? 'bg-[#2a2a2a] font-medium text-white'
                    : 'text-[#8e8e8e] hover:text-white'
                }`}
              >
                <Icon size={11} />
                {item.label}
              </button>
            )
          })}
        </div>

        {/* Clean Room vs Deep Mode Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDeepMode(false)}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${
              !deepMode
                ? 'border-[#737373] bg-[#2a2a2a] font-medium text-white'
                : 'border-[#2f2f2f] bg-[#161616] text-[#858585] hover:text-white'
            }`}
            title="Clean room: observes visible layout, text, colors, screenshots without reading internal source"
          >
            <Lock size={10} /> Clean room
          </button>
          <button
            onClick={() => setDeepMode(true)}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${
              deepMode
                ? 'border-[#e5e5e5] bg-[#e5e5e5] font-semibold text-[#111111]'
                : 'border-[#2f2f2f] bg-[#161616] text-[#858585] hover:text-white'
            }`}
            title="Deep mode: unlocks all 323 inspection, decompiler, JS, APK, and binary tools"
          >
            <Unlock size={10} /> Deep
          </button>
          <button
            onClick={() => void refreshStatus(deepMode)}
            className="icon-button !size-7"
            title="Refresh Craft Anything engine"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {notice && (
        <div className="border-b border-[#333333] bg-[#202020] px-4 py-1.5 text-[11px] text-[#e5e5e5]">
          {notice}
        </div>
      )}

      {/* VIEW 1: SIMPLE WORKFLOW (Study -> Build -> Check -> Ready) */}
      {view === 'simple' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            {/* 4-Stage Pipeline */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'study' as const, num: '01', label: 'Study', desc: 'Inspect target & evidence' },
                { id: 'build' as const, num: '02', label: 'Build', desc: 'Multi-agent implementation' },
                { id: 'check' as const, num: '03', label: 'Check', desc: '3-width parity diff' },
                { id: 'ready' as const, num: '04', label: 'Ready', desc: 'Preview & refine' },
              ].map((step) => {
                const active = stage === step.id
                return (
                  <button
                    key={step.id}
                    onClick={() => setStage(step.id)}
                    className={`rounded-lg border p-2.5 text-left transition ${
                      active
                        ? 'border-[#8a8a8a] bg-[#242424]'
                        : 'border-[#2b2b2b] bg-[#181818] hover:border-[#404040]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-[#858585]">{step.num}</span>
                      {active && <CheckCircle2 size={12} className="text-white" />}
                    </div>
                    <p className="mt-1 text-[12px] font-semibold text-white">{step.label}</p>
                    <p className="mt-0.5 text-[9px] text-[#858585]">{step.desc}</p>
                  </button>
                )
              })}
            </div>

            {/* Target & Goal Card */}
            <div className="space-y-3 rounded-xl border border-[#2f2f2f] bg-[#181818] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-semibold text-white">
                    What do you want to study or craft?
                  </h3>
                  <p className="mt-0.5 text-[10px] text-[#858585]">
                    Powered by Craft Anything v{status?.version || '0.6.1'} ({status?.totalTools ?? 323}{' '}
                    tools) + Playwright CLI 3-width visual observer.
                  </p>
                </div>
                <span className="rounded border border-[#3a3a3a] bg-[#121212] px-2 py-0.5 font-mono text-[10px] uppercase text-[#cccccc]">
                  {deepMode ? 'Deep Mode' : 'Clean Room'}
                </span>
              </div>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[#9d9d9d]">
                  Target URL or Local File / APK / Binary Path
                </span>
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="https://example.com or C:\path\to\app.apk"
                  className="w-full rounded-md border border-[#333333] bg-[#111111] px-3 py-2 font-mono text-[11px] text-white outline-none focus:border-[#737373]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[#9d9d9d]">
                  Craft Objective (sent to VinceZone Multi-Agent team)
                </span>
                <textarea
                  rows={2}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full resize-none rounded-md border border-[#333333] bg-[#111111] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none focus:border-[#737373]"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => void runStudyWeb()}
                  disabled={runningAction !== null}
                  className="flex items-center gap-1.5 rounded-md bg-[#e5e5e5] px-3 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white disabled:opacity-50"
                >
                  <Globe size={13} />
                  {runningAction === 'study-web' ? 'Studying 3 widths…' : 'Study Web (3 Widths)'}
                </button>
                <button
                  onClick={() => void runFileTriage()}
                  disabled={runningAction !== null}
                  className="flex items-center gap-1.5 rounded-md border border-[#3d3d3d] bg-[#222222] px-3 py-1.5 text-[11px] text-[#e5e5e5] hover:bg-[#2d2d2d] disabled:opacity-50"
                >
                  <FileSearch size={13} />
                  {runningAction === 'triage' ? 'Triaging file…' : 'Triage File / Binary'}
                </button>
                <button
                  onClick={handleDispatchToAgents}
                  className="ml-auto flex items-center gap-1.5 rounded-md border border-[#525252] bg-[#262626] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#333333]"
                >
                  <Bot size={13} />
                  Send Evidence to Agents
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>

            {/* Toolset Coverage Summary */}
            <div className="rounded-xl border border-[#2f2f2f] bg-[#181818] p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                  Installed Toolsets ({status?.toolsets.length ?? 0})
                </h4>
                <button
                  onClick={() => setView('workbench')}
                  className="text-[10px] text-[#d4d4d4] underline-offset-2 hover:underline"
                >
                  Open all {status?.totalTools ?? 323} tools →
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(status?.toolsets ?? []).slice(0, 12).map((ts) => (
                  <button
                    key={ts.id}
                    onClick={() => {
                      setSelectedToolset(ts.id)
                      setView('workbench')
                    }}
                    className="flex items-center justify-between rounded border border-[#2b2b2b] bg-[#141414] px-2.5 py-1.5 text-left hover:border-[#525252]"
                  >
                    <span className="truncate text-[10px] font-medium text-[#e5e5e5]">
                      {ts.title}
                    </span>
                    <span className="font-mono text-[9px] text-[#858585]">
                      {ts.available}/{ts.total}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live Evidence Ledger */}
          <div className="flex min-h-[380px] flex-col rounded-xl border border-[#2f2f2f] bg-[#181818] lg:col-span-5">
            <div className="flex items-center justify-between border-b border-[#2b2b2b] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-[#e5e5e5]" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white">
                  Evidence Ledger ({evidenceLog.length})
                </span>
              </div>
              {evidenceLog.length > 0 && (
                <button
                  onClick={() => setEvidenceLog([])}
                  className="text-[10px] text-[#858585] hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              {evidenceLog.length === 0 ? (
                <div className="grid h-full place-items-center p-6 text-center text-[11px] text-[#787878]">
                  <div>
                    <Compass size={22} className="mx-auto mb-2 text-[#525252]" />
                    <p>No evidence captured yet.</p>
                    <p className="mt-1 text-[10px]">
                      Click <strong className="text-[#cccccc]">Study Web (3 Widths)</strong> or{' '}
                      <strong className="text-[#cccccc]">Triage File</strong> to record verifiable
                      evidence before building.
                    </p>
                  </div>
                </div>
              ) : (
                evidenceLog.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[#2d2d2d] bg-[#121212] p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-white">
                        {item.title}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-[#858585]">
                        {item.mode} · {item.durationMs}ms
                      </span>
                    </div>
                    <pre className="mt-2 max-h-56 overflow-auto rounded bg-[#0c0c0c] p-2 font-mono text-[10px] leading-4 text-[#c8c8c8]">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: 323-TOOL WORKBENCH */}
      {view === 'workbench' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-12">
          {/* Tool List */}
          <div className="flex min-h-0 flex-col border-r border-[#2b2b2b] bg-[#161616] md:col-span-5">
            <div className="space-y-2 border-b border-[#2b2b2b] p-3">
              <label className="flex items-center gap-2 rounded border border-[#333333] bg-[#111111] px-2.5 py-1.5">
                <Search size={12} className="text-[#858585]" />
                <input
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                  placeholder="Search 323 Craft Anything tools (browser, apk, disasm, sqlite...)"
                  className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-[#666666]"
                />
              </label>
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                <button
                  onClick={() => setSelectedToolset('all')}
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] ${
                    selectedToolset === 'all'
                      ? 'bg-[#e5e5e5] font-semibold text-[#111111]'
                      : 'bg-[#222222] text-[#a3a3a3] hover:text-white'
                  }`}
                >
                  All ({status?.totalTools ?? 0})
                </button>
                {(status?.toolsets ?? []).map((ts) => (
                  <button
                    key={ts.id}
                    onClick={() => setSelectedToolset(ts.id)}
                    className={`shrink-0 rounded px-2 py-0.5 text-[10px] ${
                      selectedToolset === ts.id
                        ? 'bg-[#e5e5e5] font-semibold text-[#111111]'
                        : 'bg-[#222222] text-[#a3a3a3] hover:text-white'
                    }`}
                  >
                    {ts.id} ({ts.total})
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 divide-y divide-[#232323] overflow-y-auto">
              {filteredTools.map((tool) => (
                <button
                  key={tool.command}
                  onClick={() => {
                    setSelectedTool(tool)
                    setToolArgs('--help')
                    setToolOutput('')
                  }}
                  className={`block w-full px-3 py-2 text-left transition ${
                    selectedTool?.command === tool.command
                      ? 'bg-[#262626]'
                      : 'hover:bg-[#1d1d1d]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-semibold text-white">
                      {tool.command}
                    </span>
                    <span className="shrink-0 rounded bg-[#222222] px-1.5 py-0.5 text-[9px] text-[#9d9d9d]">
                      {tool.toolset}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10px] text-[#8e8e8e]">{tool.summary}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Tool Runner */}
          <div className="flex min-h-0 flex-col bg-[#141414] p-4 md:col-span-7">
            {selectedTool ? (
              <>
                <div className="border-b border-[#2b2b2b] pb-3">
                  <div className="flex items-center gap-2">
                    <TerminalSquare size={14} className="text-white" />
                    <h3 className="font-mono text-[13px] font-semibold text-white">
                      craft-anything-cli {selectedTool.command}
                    </h3>
                    <span className="rounded bg-[#262626] px-1.5 py-0.5 text-[9px] text-[#a3a3a3]">
                      {selectedTool.toolset}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#a3a3a3]">
                    {selectedTool.summary}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={toolArgs}
                    onChange={(e) => setToolArgs(e.target.value)}
                    placeholder="Flags / arguments (e.g. --help)"
                    className="min-w-0 flex-1 rounded-md border border-[#333333] bg-[#101010] px-3 py-1.5 font-mono text-[11px] text-white outline-none focus:border-[#737373]"
                  />
                  <button
                    onClick={() => void runSelectedTool()}
                    disabled={runningAction === 'run-tool'}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#e5e5e5] px-3.5 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white disabled:opacity-50"
                  >
                    <Play size={11} />
                    {runningAction === 'run-tool' ? 'Running…' : 'Run Tool'}
                  </button>
                </div>

                <pre className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-[#2b2b2b] bg-[#0e0e0e] p-3 font-mono text-[11px] leading-5 text-[#d4d4d4]">
                  {toolOutput ||
                    `Ready to run \`craft-anything-cli --format json ${deepMode ? '--deep' : '--clean-room'} ${selectedTool.command} ${toolArgs}\``}
                </pre>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-[11px] text-[#787878]">
                Select any of the 323 Craft Anything tools on the left.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: ENGINES & DOCTOR */}
      {view === 'engines' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-7">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
              Inspection & Decompiler Engines ({foundEnginesCount}/{status?.engines.length ?? 0}{' '}
              Ready)
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(status?.engines ?? []).map((engine) => (
                <div
                  key={engine.id}
                  className="flex flex-col justify-between rounded-lg border border-[#2c2c2c] bg-[#181818] p-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-white">{engine.name}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] ${
                          engine.found
                            ? 'border-[#6e6e6e] bg-[#2a2a2a] text-white'
                            : 'border-[#2f2f2f] bg-[#121212] text-[#787878]'
                        }`}
                      >
                        {engine.found ? 'Installed' : 'Not Installed'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-[#8e8e8e]">{engine.needed_for}</p>
                    {engine.path && (
                      <p className="mt-1 truncate font-mono text-[9px] text-[#737373]">
                        {engine.path}
                      </p>
                    )}
                  </div>
                  {!engine.found && engine.installable_here && (
                    <button
                      onClick={() => void installEngine(engine.id)}
                      disabled={runningAction !== null}
                      className="mt-2.5 flex items-center justify-center gap-1 rounded border border-[#444444] bg-[#222222] px-2.5 py-1 text-[10px] text-[#e5e5e5] hover:bg-[#2d2d2d] disabled:opacity-50"
                    >
                      <Download size={10} />
                      {runningAction === `engine-${engine.id}`
                        ? 'Installing…'
                        : `Install ${engine.name}`}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                Craft Doctor & MCP Registration
              </h3>
              <button
                onClick={() => void previewSetupPlan()}
                disabled={runningAction === 'setup-plan'}
                className="rounded border border-[#444444] bg-[#222222] px-2.5 py-1 text-[10px] text-white hover:bg-[#2e2e2e]"
              >
                {runningAction === 'setup-plan' ? 'Checking…' : 'Preview MCP Setup Plan'}
              </button>
            </div>

            <div className="space-y-1.5 rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
              {(status?.doctor.checks ?? []).slice(0, 14).map((chk) => (
                <div
                  key={chk.name}
                  className="flex items-start justify-between gap-2 rounded bg-[#121212] px-2.5 py-1.5 text-[10px]"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[#e5e5e5]">{chk.name}</p>
                    <p className="text-[9px] text-[#858585]">{chk.message}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                      chk.status === 'ok'
                        ? 'bg-[#2a2a2a] text-white'
                        : 'bg-[#1c1c1c] text-[#858585]'
                    }`}
                  >
                    {chk.status}
                  </span>
                </div>
              ))}
            </div>

            {setupPlanOutput && (
              <pre className="max-h-60 overflow-auto rounded-lg border border-[#2c2c2c] bg-[#0e0e0e] p-3 font-mono text-[10px] text-[#cccccc]">
                {setupPlanOutput}
              </pre>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
