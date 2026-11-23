'use client'

import {
  Bot,
  Check,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppSettings, CliDetectionResult, ProviderConfig } from '../agent-types'
import { uid } from '../workspace-defaults'

export function ProviderSettingsModal({
  initialProvider,
  initialProviders,
  initialSettings,
  onClose,
  onSave,
}: {
  initialProvider: ProviderConfig
  initialProviders: ProviderConfig[]
  initialSettings: AppSettings
  onClose: () => void
  onSave: (payload: {
    provider: ProviderConfig
    providers: ProviderConfig[]
    settings: AppSettings
  }) => void
}) {
  const [provider, setProvider] = useState<ProviderConfig>(initialProvider)
  const [providers, setProviders] = useState<ProviderConfig[]>(initialProviders)
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [tab, setTab] = useState<'general' | 'providers' | 'cli' | 'agents' | 'permissions'>(
    'general',
  )
  const [cliDetection, setCliDetection] = useState<CliDetectionResult | null>(null)
  const [cliLoading, setCliLoading] = useState(false)
  const [cliError, setCliError] = useState('')
  const [cliRequested, setCliRequested] = useState(false)

  const tabs = [
    { id: 'general' as const, label: 'General', icon: SlidersHorizontal },
    { id: 'providers' as const, label: 'Providers', icon: Zap },
    { id: 'cli' as const, label: 'CLI Integrations', icon: TerminalSquare },
    { id: 'agents' as const, label: 'Agents', icon: Bot },
    { id: 'permissions' as const, label: 'Permissions', icon: Shield },
  ]

  const updateCurrentProvider = (next: ProviderConfig) => {
    setProvider(next)
    setProviders((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [...current, next],
    )
  }

  const detectCliTools = async () => {
    setCliRequested(true)
    setCliLoading(true)
    setCliError('')
    try {
      const response = await fetch('/api/cli/detect', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Detection failed with status ${response.status}.`)
      setCliDetection((await response.json()) as CliDetectionResult)
    } catch (error) {
      setCliError(error instanceof Error ? error.message : 'CLI detection failed.')
    } finally {
      setCliLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'cli' && !cliRequested) void detectCliTools()
  }, [tab, cliRequested])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="flex h-[620px] max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#101010] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Workspace, providers, CLI integrations, agents and tool permissions
            </p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close settings">
            <X size={15} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 space-y-1 border-r border-white/[0.07] bg-black/20 p-2">
            {tabs.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] ${
                    tab === item.id
                      ? 'bg-white/[0.08] text-zinc-100'
                      : 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300'
                  }`}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {tab === 'general' && (
              <SettingsSection
                title="Workspace"
                description="Control how Baton restores and saves your local workspace."
              >
                <Toggle
                  label="Auto-save editor changes"
                  description="Persist the local workspace automatically after each editor change."
                  checked={settings.autoSave}
                  onChange={(autoSave) => setSettings({ ...settings, autoSave })}
                />
                <Toggle
                  label="Restore last workspace"
                  description="Open the most recent local project when Baton starts."
                  checked={settings.restoreWorkspace}
                  onChange={(restoreWorkspace) => setSettings({ ...settings, restoreWorkspace })}
                />
                <Toggle
                  label="Compact interface"
                  description="Use dense spacing for explorer and editor surfaces."
                  checked={settings.compactMode}
                  onChange={(compactMode) => setSettings({ ...settings, compactMode })}
                />
              </SettingsSection>
            )}
            {tab === 'providers' && (
              <SettingsSection
                title="AI providers & models"
                description="Manage multiple OpenAI-compatible providers and their model catalogs."
              >
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {providers.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setProvider(item)}
                      className={`group flex min-w-32 items-center gap-2 rounded-md border px-2.5 py-2 text-left ${
                        provider.id === item.id
                          ? 'border-lime-400/30 bg-lime-400/[0.06]'
                          : 'border-white/[0.07] bg-black/20 hover:bg-white/[0.03]'
                      }`}
                    >
                      <Zap
                        size={12}
                        className={provider.id === item.id ? 'text-lime-400' : 'text-zinc-700'}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] text-zinc-300">
                          {item.name || 'Untitled'}
                        </span>
                        <span className="block text-[8px] text-zinc-700">
                          {item.models.split(',').filter((model) => model.trim()).length} models
                        </span>
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const next: ProviderConfig = {
                        id: uid(),
                        name: 'New provider',
                        baseUrl: 'https://api.example.com/v1',
                        apiKey: '',
                        model: '',
                        models: '',
                      }
                      setProviders((current) => [...current, next])
                      setProvider(next)
                    }}
                    className="grid min-w-10 place-items-center rounded-md border border-dashed border-white/10 text-zinc-600 hover:border-lime-400/30 hover:text-lime-400"
                    title="Add provider"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <Field
                  label="Display name"
                  value={provider.name}
                  onChange={(name) => updateCurrentProvider({ ...provider, name })}
                />
                <Field
                  label="Base URL"
                  value={provider.baseUrl}
                  onChange={(baseUrl) => updateCurrentProvider({ ...provider, baseUrl })}
                  placeholder="https://api.example.com/v1"
                />
                <Field
                  label="API key"
                  value={provider.apiKey}
                  onChange={(apiKey) => updateCurrentProvider({ ...provider, apiKey })}
                  type="password"
                  placeholder="Stored in memory for this session"
                />
                <Field
                  label="Models"
                  value={provider.models}
                  onChange={(models) => {
                    const first = models
                      .split(',')
                      .map((model) => model.trim())
                      .filter(Boolean)[0]
                    updateCurrentProvider({
                      ...provider,
                      models,
                      model: provider.model || first || '',
                    })
                  }}
                  placeholder="gpt-4.1, claude-sonnet-4, gemini-2.5-pro"
                />
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-medium text-zinc-500">
                    Default model
                  </span>
                  <select
                    value={provider.model}
                    onChange={(event) =>
                      updateCurrentProvider({ ...provider, model: event.target.value })
                    }
                    className="w-full rounded-md border border-white/[0.08] bg-[#141414] px-3 py-2 text-[11px] text-zinc-200 outline-none focus:border-lime-400/40"
                  >
                    {provider.models
                      .split(',')
                      .map((model) => model.trim())
                      .filter(Boolean)
                      .map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                  </select>
                </label>
                {providers.length > 1 && (
                  <button
                    onClick={() => {
                      const remaining = providers.filter((item) => item.id !== provider.id)
                      setProviders(remaining)
                      setProvider(remaining[0])
                    }}
                    className="flex items-center gap-1.5 text-[10px] text-red-400/70 hover:text-red-400"
                  >
                    <X size={11} /> Remove this provider
                  </button>
                )}
                <div className="flex gap-2 rounded-lg border border-lime-400/10 bg-lime-400/[0.04] p-2.5 text-[10px] leading-4 text-zinc-500">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-lime-400" />
                  API keys are request-only and are never written to local storage, Payload, logs,
                  or source code. Public HTTPS endpoints are verified via DNS with redirects
                  blocked.
                </div>
              </SettingsSection>
            )}
            {tab === 'cli' && (
              <SettingsSection
                title="CLI integrations"
                description="Detect supported executables in Baton's active deployment runtime."
              >
                <div className="flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[10px] leading-4 text-zinc-500">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  <p>
                    Detection checks the server runtime PATH (including Windows PATHEXT). It does
                    not inspect your computer, verify CLI authentication, or enable command
                    execution. Pair the Local Companion for managed PTY sessions.
                  </p>
                </div>
                <div className="space-y-2">
                  {cliLoading && !cliDetection && (
                    <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/20 p-3 text-[10px] text-zinc-500">
                      <RefreshCw size={13} className="animate-spin text-lime-400" />
                      Scanning the deployment runtime…
                    </div>
                  )}
                  {cliError && (
                    <div className="rounded-lg border border-red-400/15 bg-red-400/[0.04] p-3 text-[10px] text-red-300/80">
                      {cliError}
                    </div>
                  )}
                  {cliDetection?.tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/20 p-3"
                    >
                      <div className="grid size-8 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-[#151515]">
                        <TerminalSquare size={14} className="text-zinc-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-medium text-zinc-300">{tool.name}</p>
                          <span className="font-mono text-[9px] text-zinc-700">
                            {tool.executable}
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] text-zinc-600">
                          Authentication unknown · Execution unavailable
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[9px] ${
                          tool.installed
                            ? 'border-lime-400/20 bg-lime-400/[0.06] text-lime-400'
                            : 'border-white/[0.08] bg-white/[0.03] text-zinc-600'
                        }`}
                      >
                        {tool.installed ? 'Detected' : 'Not detected'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.07] pt-3">
                  <p className="text-[9px] text-zinc-700">
                    Scope: deployment runtime · Results are not stored
                  </p>
                  <button
                    onClick={() => void detectCliTools()}
                    disabled={cliLoading}
                    className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] text-zinc-400 hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={cliLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </SettingsSection>
            )}
            {tab === 'agents' && (
              <SettingsSection
                title="Autonomous delegation"
                description="Bound coordinator depth, concurrency, iterations, and approval behavior."
              >
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      key: 'maxDepth' as const,
                      label: 'Maximum delegation depth',
                      values: [0, 1, 2, 3, 4],
                    },
                    {
                      key: 'maxActiveAgents' as const,
                      label: 'Maximum active agents',
                      values: [1, 2, 3, 4, 5, 6, 7],
                    },
                    {
                      key: 'maxConcurrentTasks' as const,
                      label: 'Concurrent tasks',
                      values: [1, 2, 3, 4, 5, 6, 7],
                    },
                    {
                      key: 'maxIterations' as const,
                      label: 'Delegation iterations',
                      values: [1, 2, 3, 4, 5, 6],
                    },
                  ].map((field) => (
                    <label
                      key={field.key}
                      className="block rounded-lg border border-white/[0.07] bg-black/20 p-3"
                    >
                      <span className="text-[10px] font-medium text-zinc-300">{field.label}</span>
                      <select
                        value={settings.delegation[field.key]}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            delegation: {
                              ...settings.delegation,
                              [field.key]: Number(event.target.value),
                            },
                          })
                        }
                        className="mt-2 w-full rounded-md border border-white/10 bg-[#141414] px-2 py-2 text-[11px] text-zinc-300 outline-none"
                      >
                        {field.values.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="block rounded-lg border border-white/[0.07] bg-black/20 p-3">
                  <span className="text-[10px] font-medium text-zinc-300">Task assignment</span>
                  <select
                    value={settings.delegation.assignmentMode}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        delegation: {
                          ...settings.delegation,
                          assignmentMode: event.target.value as 'automatic' | 'manual',
                        },
                      })
                    }
                    className="mt-2 w-full rounded-md border border-white/10 bg-[#141414] px-2 py-2 text-[11px] text-zinc-300 outline-none"
                  >
                    <option value="automatic">Automatic runtime assignment</option>
                    <option value="manual">Plan first, approve before executing</option>
                  </select>
                </label>
                <Toggle
                  label="Require approval before worker calls"
                  description="The coordinator creates the task graph and pauses for interactive approval before invoking workers."
                  checked={settings.delegation.requireApproval}
                  onChange={(requireApproval) =>
                    setSettings({
                      ...settings,
                      delegation: { ...settings.delegation, requireApproval },
                    })
                  }
                />
                <Toggle
                  label="Auto-apply for trusted agents"
                  description="Still blocked when file ownership overlaps or the workspace revision is stale."
                  checked={settings.autoApplyTrusted}
                  onChange={(autoApplyTrusted) => setSettings({ ...settings, autoApplyTrusted })}
                />
              </SettingsSection>
            )}
            {tab === 'permissions' && (
              <SettingsSection
                title="Tool permissions"
                description="Dangerous operations remain approval-gated by default."
              >
                <Toggle
                  label="Confirm dangerous tools"
                  description="Require approval before deletes, destructive commands, or sensitive edits."
                  checked={settings.confirmDangerousTools}
                  onChange={(confirmDangerousTools) =>
                    setSettings({ ...settings, confirmDangerousTools })
                  }
                />
                <Toggle
                  label="Allow terminal commands"
                  description="Permit approved agents to request commands when a Local Companion is paired."
                  checked={settings.allowTerminal}
                  onChange={(allowTerminal) => setSettings({ ...settings, allowTerminal })}
                />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Read snapshot',
                    'Search code',
                    'Propose patches',
                    'Review diff',
                    'Approve tasks',
                    'Companion PTY (requires pair)',
                  ].map((tool) => (
                    <div
                      key={tool}
                      className="flex items-center gap-2 rounded-md border border-white/[0.07] bg-black/20 px-3 py-2 text-[10px] text-zinc-500"
                    >
                      <Check size={11} className="text-lime-400" />
                      {tool}
                    </div>
                  ))}
                </div>
              </SettingsSection>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.07] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[11px] text-zinc-500 hover:bg-white/[0.05]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ provider, providers, settings })}
            className="rounded-md bg-[#e5e5e5] px-3 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white"
          >
            Save settings
          </button>
        </div>
      </section>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <p className="mt-1 text-[10px] text-zinc-600">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-white/[0.07] bg-black/20 p-3 text-left hover:bg-white/[0.025]"
    >
      <span>
        <span className="block text-[10px] font-medium text-zinc-300">{label}</span>
        <span className="mt-1 block text-[10px] leading-4 text-zinc-600">{description}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-[#e5e5e5]' : 'bg-zinc-800'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full shadow transition ${checked ? 'left-[18px] bg-[#111111]' : 'left-0.5 bg-zinc-400'}`}
        />
      </span>
    </button>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-lime-400/40"
      />
    </label>
  )
}
