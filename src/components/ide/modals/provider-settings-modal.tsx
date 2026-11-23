'use client'

import {
  Activity,
  Bot,
  Brain,
  Check,
  Copy,
  FolderOpen,
  GitBranch,
  Layers,
  LogOut,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AppSettings,
  AppTheme,
  CliDetectionResult,
  McpServerConfig,
  MemoryNote,
  ProviderConfig,
  UsageRecord,
} from '../agent-types'
import { uid } from '../workspace-defaults'
import { searchSettingsEntries } from './settings-search'

type SettingsTab =
  | 'general'
  | 'providers'
  | 'usage'
  | 'github'
  | 'skills'
  | 'cli'
  | 'mcp'
  | 'extensions'
  | 'memory'
  | 'agents'
  | 'permissions'

type GitHubStatus = {
  ghInstalled: boolean
  authenticated: boolean
  username: string | null
  host?: string
  scopes: string | string[]
  rawStatus?: string
  detail?: string
  repos: Array<{
    name?: string
    nameWithOwner?: string
    visibility?: string
    isPrivate?: boolean
    updatedAt: string
    url: string
  }>
}

type DiscoveredSkill = {
  id: string
  slug?: string
  command?: string
  name: string
  description: string
  source: string
  directory?: string
  path: string
}

type DiscoveredSkillCombo = {
  id: string
  command: string
  name: string
  group: string
  badge: string
  description: string
  coreSkills: string[]
  skills: string[]
  rules: string[]
  savedPercent: number
  promptCompact: string
  custom?: boolean
}

type DiscoveredOmniCombo = {
  id: string
  name: string
  strategy: string
  models: string[]
}

export function ProviderSettingsModal({
  initialProvider,
  initialProviders,
  initialSettings,
  usageRecords,
  memoryNotes,
  rootPath,
  onResetUsage,
  onAddMemoryNote,
  onDeleteMemoryNote,
  onClearMemoryNotes,
  onClose,
  onSave,
}: {
  initialProvider: ProviderConfig
  initialProviders: ProviderConfig[]
  initialSettings: AppSettings
  usageRecords: UsageRecord[]
  memoryNotes: MemoryNote[]
  rootPath?: string
  onResetUsage: () => void
  onAddMemoryNote: (title: string, content: string) => void
  onDeleteMemoryNote: (id: string) => void
  onClearMemoryNotes: () => void
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
  const [tab, setTab] = useState<SettingsTab>('general')
  const [settingsQuery, setSettingsQuery] = useState('')
  const quickSettingMatches = useMemo(() => searchSettingsEntries(settingsQuery), [settingsQuery])

  // CLI state
  const [cliDetection, setCliDetection] = useState<CliDetectionResult | null>(null)
  const [cliLoading, setCliLoading] = useState(false)
  const [cliError, setCliError] = useState('')
  const [cliRequested, setCliRequested] = useState(false)

  // GitHub state
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null)
  const [ghLoading, setGhLoading] = useState(false)
  const [ghError, setGhError] = useState('')
  const [ghToken, setGhToken] = useState('')
  const [ghMessage, setGhMessage] = useState('')

  // Skills (.agent) + Saving Skill Combos state
  const [skills, setSkills] = useState<DiscoveredSkill[]>([])
  const [skillCombos, setSkillCombos] = useState<DiscoveredSkillCombo[]>([])
  const [comboSource, setComboSource] = useState('')
  const [skillDirs, setSkillDirs] = useState<string[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [skillsSubTab, setSkillsSubTab] = useState<'combos' | 'skills'>('skills')
  const [copiedCmd, setCopiedCmd] = useState('')
  const [newComboName, setNewComboName] = useState('')
  const [newComboSkills, setNewComboSkills] = useState('caveman-compress, headroom, ponytail')
  const [newComboDesc, setNewComboDesc] = useState('')
  const [comboSaving, setComboSaving] = useState(false)

  // OmniRoute / OpenCode / Saving Provider Discovery state
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverStatus, setDiscoverStatus] = useState('')
  const [omniCombos, setOmniCombos] = useState<DiscoveredOmniCombo[]>([])
  const [omniOnline, setOmniOnline] = useState<boolean | null>(null)

  // P2-2 & P2-3: OS DPAPI Security status & Update Checker
  const [dpapiActive, setDpapiActive] = useState<boolean | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    updateAvailable: boolean
    releaseUrl?: string
    message?: string
  } | null>(null)

  useEffect(() => {
    const secrets = window.vincezoneDesktop?.secrets
    if (!secrets) {
      setDpapiActive(false)
      return
    }
    void secrets
      .isAvailable()
      .then((ok) => setDpapiActive(Boolean(ok)))
      .catch(() => setDpapiActive(false))
  }, [])

  const checkForUpdates = async () => {
    setUpdateChecking(true)
    try {
      const res = await fetch('/api/updates', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as {
        currentVersion: string
        latestVersion: string
        updateAvailable: boolean
        releaseUrl?: string
        message?: string
      }
      setUpdateInfo(data)
    } finally {
      setUpdateChecking(false)
    }
  }

  // MCP add form + live tool tester
  const [mcpName, setMcpName] = useState('')
  const [mcpTransport, setMcpTransport] = useState<'stdio' | 'http'>('stdio')
  const [mcpEndpoint, setMcpEndpoint] = useState('')
  const [mcpTestState, setMcpTestState] = useState<
    Record<
      string,
      {
        loading: boolean
        ok?: boolean
        tools?: Array<{ name: string; description?: string }>
        error?: string
      }
    >
  >({})

  const testMcpServer = useCallback(
    async (server: McpServerConfig) => {
      setMcpTestState((current) => ({ ...current, [server.id]: { loading: true } }))
      try {
        const response = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'list-tools',
            transport: server.transport,
            endpoint: server.endpoint,
            cwd: rootPath,
          }),
        })
        const data = (await response.json()) as {
          ok?: boolean
          tools?: Array<{ name: string; description?: string }>
          error?: string
        }
        setMcpTestState((current) => ({
          ...current,
          [server.id]: {
            loading: false,
            ok: Boolean(response.ok && data.ok),
            tools: data.tools ?? [],
            error: data.error,
          },
        }))
      } catch (error) {
        setMcpTestState((current) => ({
          ...current,
          [server.id]: {
            loading: false,
            ok: false,
            error: error instanceof Error ? error.message : 'MCP handshake failed.',
          },
        }))
      }
    },
    [rootPath],
  )

  // Memory add form
  const [memTitle, setMemTitle] = useState('')
  const [memContent, setMemContent] = useState('')

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof SlidersHorizontal }> = [
    { id: 'general', label: 'General & Editor', icon: SlidersHorizontal },
    { id: 'providers', label: 'Providers & Models', icon: Zap },
    { id: 'usage', label: 'Usage & Cost', icon: Activity },
    { id: 'github', label: 'GitHub Auth', icon: GitBranch },
    { id: 'skills', label: 'Skills & Combos', icon: Sparkles },
    { id: 'cli', label: 'CLI Tools', icon: TerminalSquare },
    { id: 'mcp', label: 'MCP Servers', icon: Plug },
    { id: 'extensions', label: 'Plugins', icon: Puzzle },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'agents', label: 'Multi-Agent', icon: Bot },
    { id: 'permissions', label: 'Permissions', icon: Shield },
  ]

  const updateCurrentProvider = (next: ProviderConfig) => {
    setProvider(next)
    setProviders((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [...current, next],
    )
  }

  const detectCliTools = useCallback(async () => {
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
  }, [])

  const loadGitHubStatus = useCallback(async () => {
    setGhLoading(true)
    setGhError('')
    try {
      const response = await fetch('/api/github', { cache: 'no-store' })
      if (!response.ok) throw new Error(`GitHub status failed (${response.status}).`)
      setGhStatus((await response.json()) as GitHubStatus)
    } catch (error) {
      setGhError(error instanceof Error ? error.message : 'Unable to check GitHub CLI status.')
    } finally {
      setGhLoading(false)
    }
  }, [])

  const loadExtensions = useCallback(async () => {
    setSkillsLoading(true)
    try {
      const query = rootPath ? `?root=${encodeURIComponent(rootPath)}` : ''
      const response = await fetch(`/api/extensions${query}`, { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as {
        skills: DiscoveredSkill[]
        combos?: DiscoveredSkillCombo[]
        comboSource?: string
        scannedDirs: string[]
      }
      setSkills(data.skills ?? [])
      setSkillCombos(data.combos ?? [])
      setComboSource(data.comboSource ?? '')
      setSkillDirs(data.scannedDirs ?? [])
    } finally {
      setSkillsLoading(false)
    }
  }, [rootPath])

  const syncLocalProviders = useCallback(async () => {
    setDiscoverLoading(true)
    setDiscoverStatus('')
    try {
      const res = await fetch('/api/providers/discover', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        ok?: boolean
        omnirouteOnline?: boolean
        combos?: DiscoveredOmniCombo[]
        providers?: Array<ProviderConfig & { source?: string }>
      }
      setOmniOnline(Boolean(data.omnirouteOnline))
      setOmniCombos(data.combos ?? [])
      if (data.providers?.length) {
        setProviders((current) => {
          const merged = [...current]
          for (const found of data.providers!) {
            const idx = merged.findIndex(
              (p) =>
                p.id === found.id ||
                p.baseUrl.replace(/\/$/, '').toLowerCase() ===
                  found.baseUrl.replace(/\/$/, '').toLowerCase(),
            )
            if (idx >= 0) {
              merged[idx] = {
                ...merged[idx],
                name: found.name,
                baseUrl: found.baseUrl,
                models: found.models || merged[idx].models,
                model: found.model || merged[idx].model,
                apiKey: found.apiKey || merged[idx].apiKey,
              }
            } else {
              merged.push({
                id: found.id,
                name: found.name,
                baseUrl: found.baseUrl,
                apiKey: found.apiKey,
                model: found.model,
                models: found.models,
              })
            }
          }
          return merged
        })
        const omni = data.providers.find((p) => p.id === 'omnirouter') ?? data.providers[0]
        if (omni) {
          setProvider({
            id: omni.id,
            name: omni.name,
            baseUrl: omni.baseUrl,
            apiKey: omni.apiKey,
            model: omni.model,
            models: omni.models,
          })
        }
        setDiscoverStatus(
          `Synced ${data.providers.length} provider(s) & ${data.combos?.length ?? 0} OmniRoute combo(s) from OmniRoute / OpenCode / Saving.`,
        )
      } else {
        setDiscoverStatus('No local providers found in OmniRoute / OpenCode / Saving.')
      }
    } catch (err) {
      setDiscoverStatus(err instanceof Error ? err.message : 'Auto-sync failed.')
    } finally {
      setDiscoverLoading(false)
    }
  }, [])

  const createCustomCombo = async () => {
    const core = newComboSkills
      .split(',')
      .map((s) => s.trim().replace(/^\//, ''))
      .filter(Boolean)
    if (!newComboName.trim() || core.length === 0) return
    setComboSaving(true)
    try {
      const res = await fetch('/api/extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-combo',
          root: rootPath,
          combo: {
            name: newComboName.trim(),
            description: newComboDesc.trim(),
            coreSkills: core,
          },
        }),
      })
      if (res.ok) {
        setNewComboName('')
        setNewComboDesc('')
        await loadExtensions()
      }
    } finally {
      setComboSaving(false)
    }
  }

  useEffect(() => {
    if (tab === 'cli' && !cliRequested) void detectCliTools()
    if (tab === 'github' && !ghStatus && !ghLoading) void loadGitHubStatus()
    if ((tab === 'skills' || tab === 'extensions') && skills.length === 0 && !skillsLoading) {
      void loadExtensions()
    }
    if (tab === 'providers' && omniOnline === null && !discoverLoading) {
      void syncLocalProviders()
    }
  }, [
    tab,
    cliRequested,
    detectCliTools,
    ghStatus,
    ghLoading,
    loadGitHubStatus,
    skills.length,
    skillsLoading,
    loadExtensions,
    omniOnline,
    discoverLoading,
    syncLocalProviders,
  ])

  const handleGitHubTokenLogin = async () => {
    if (!ghToken.trim()) return
    setGhLoading(true)
    setGhError('')
    setGhMessage('')
    try {
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login-token', token: ghToken.trim() }),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string; message?: string }
      if (!response.ok || !data.ok) {
        setGhError(data.error || 'GitHub login failed.')
      } else {
        setGhToken('')
        setGhMessage(data.message || 'Authenticated with GitHub CLI.')
        await loadGitHubStatus()
      }
    } catch (error) {
      setGhError(error instanceof Error ? error.message : 'GitHub login failed.')
    } finally {
      setGhLoading(false)
    }
  }

  const handleGitHubLogout = async () => {
    setGhLoading(true)
    setGhError('')
    setGhMessage('')
    try {
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string; message?: string }
      if (!response.ok || !data.ok) {
        setGhError(data.error || 'Logout failed.')
      } else {
        setGhMessage(data.message || 'Signed out of GitHub CLI.')
        await loadGitHubStatus()
      }
    } finally {
      setGhLoading(false)
    }
  }

  const usageSummary = useMemo(() => {
    const totals = {
      requests: usageRecords.length,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    }
    const byModel = new Map<string, { tokens: number; cost: number; requests: number }>()
    const byAgent = new Map<string, { tokens: number; cost: number; requests: number }>()

    for (const record of usageRecords) {
      totals.promptTokens += record.promptTokens
      totals.completionTokens += record.completionTokens
      totals.totalTokens += record.totalTokens
      totals.costUsd += record.estimatedCostUsd

      const m = byModel.get(record.model) ?? { tokens: 0, cost: 0, requests: 0 }
      m.tokens += record.totalTokens
      m.cost += record.estimatedCostUsd
      m.requests += 1
      byModel.set(record.model, m)

      const a = byAgent.get(record.agentName) ?? { tokens: 0, cost: 0, requests: 0 }
      a.tokens += record.totalTokens
      a.cost += record.estimatedCostUsd
      a.requests += 1
      byAgent.set(record.agentName, a)
    }

    return {
      totals,
      byModel: Array.from(byModel.entries()).sort((a, b) => b[1].tokens - a[1].tokens),
      byAgent: Array.from(byAgent.entries()).sort((a, b) => b[1].tokens - a[1].tokens),
    }
  }, [usageRecords])

  const filteredSkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase()
    if (!q) return skills.slice(0, 80)
    return skills
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.slug || '').toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          (item.directory || '').toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q),
      )
      .slice(0, 80)
  }, [skills, skillSearch])

  const filteredCombos = useMemo(() => {
    const q = skillSearch.trim().toLowerCase()
    if (!q) return skillCombos
    return skillCombos.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.coreSkills.some((s) => s.toLowerCase().includes(q)),
    )
  }, [skillCombos, skillSearch])

  const copyCommand = (cmd: string) => {
    void navigator.clipboard?.writeText(cmd)
    setCopiedCmd(cmd)
    window.setTimeout(() => setCopiedCmd(''), 1500)
  }

  const toggleSkill = (skillId: string) => {
    const exists = settings.enabledSkillIds.includes(skillId)
    setSettings({
      ...settings,
      enabledSkillIds: exists
        ? settings.enabledSkillIds.filter((id) => id !== skillId)
        : [...settings.enabledSkillIds, skillId],
    })
  }

  const addMcpServer = () => {
    if (!mcpName.trim() || !mcpEndpoint.trim()) return
    const next: McpServerConfig = {
      id: uid(),
      name: mcpName.trim(),
      transport: mcpTransport,
      endpoint: mcpEndpoint.trim(),
      enabled: true,
    }
    setSettings({ ...settings, mcpServers: [...settings.mcpServers, next] })
    setMcpName('')
    setMcpEndpoint('')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <section className="flex h-[680px] max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#333333] bg-[#121212] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">VinceZone Settings</h2>
            <p className="mt-0.5 text-[10px] text-[#858585]">
              Workspace, Auto-Save, Providers, Usage, GitHub, CLI, MCP, Plugins/.agent Skills & Memory
            </p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close settings">
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-52 shrink-0 flex-col border-r border-[#2b2b2b] bg-[#161616] p-2">
            <div className="mb-2 flex items-center gap-1.5 rounded-md border border-[#333333] bg-[#121212] px-2 py-1">
              <Search size={12} className="shrink-0 text-[#737373]" />
              <input
                type="text"
                value={settingsQuery}
                onChange={(e) => setSettingsQuery(e.target.value)}
                placeholder="Search settings…"
                className="min-w-0 flex-1 bg-transparent text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666]"
              />
              {settingsQuery && (
                <button
                  type="button"
                  onClick={() => setSettingsQuery('')}
                  className="text-[#737373] hover:text-white"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            {quickSettingMatches.length > 0 && (
              <div className="mb-2 space-y-0.5 rounded-md border border-[#2f2f2f] bg-[#121212] p-1">
                <div className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#737373]">
                  Quick Jump ({quickSettingMatches.length})
                </div>
                {quickSettingMatches.slice(0, 6).map((match) => (
                  <button
                    key={`${match.tab}-${match.label}`}
                    type="button"
                    onClick={() => {
                      setTab(match.tab)
                      setSettingsQuery('')
                    }}
                    className="block w-full truncate rounded px-1.5 py-1 text-left text-[10px] text-[#d4d4d4] hover:bg-[#262626] hover:text-white"
                  >
                    {match.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 space-y-0.5 overflow-y-auto">
              {tabs.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] transition ${
                      tab === item.id
                        ? 'bg-[#2a2a2a] font-medium text-white'
                        : 'text-[#8e8e8e] hover:bg-[#222222] hover:text-[#e5e5e5]'
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {tab === 'general' && (
              <SettingsSection
                title="Workspace & Editor"
                description="Control Theme, Auto-Save timing, session restoration, and Monaco Editor ergonomics."
              >
                <div className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                  <span className="text-[10px] font-medium text-[#d4d4d4]">
                    Color Theme (Offline-First)
                  </span>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'dark', label: 'Dark Modern' },
                        { id: 'light', label: 'Light' },
                        { id: 'high-contrast', label: 'High Contrast' },
                      ] as Array<{ id: AppTheme; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSettings({ ...settings, theme: opt.id })}
                        className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                          (settings.theme ?? 'dark') === opt.id
                            ? 'border-[#e5e5e5] bg-[#2c2c2c] text-white'
                            : 'border-[#333333] bg-[#121212] text-[#9a9a9a] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Toggle
                  label="Auto-Save editor changes"
                  description="Automatically flush edits to local disk and create Edit Memory snapshots."
                  checked={settings.autoSave}
                  onChange={(autoSave) => setSettings({ ...settings, autoSave })}
                />
                {settings.autoSave && (
                  <label className="block rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                    <span className="text-[10px] font-medium text-[#d4d4d4]">
                      Auto-Save Delay (debounce)
                    </span>
                    <select
                      value={settings.autoSaveDelayMs}
                      onChange={(event) =>
                        setSettings({ ...settings, autoSaveDelayMs: Number(event.target.value) })
                      }
                      className="mt-2 w-full rounded-md border border-[#333333] bg-[#121212] px-2.5 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
                    >
                      <option value={500}>500 ms (Immediate)</option>
                      <option value={1000}>1,000 ms (Balanced — Default)</option>
                      <option value={2000}>2,000 ms (Relaxed)</option>
                      <option value={5000}>5,000 ms (Low disk I/O)</option>
                    </select>
                  </label>
                )}
                <Toggle
                  label="Restore last workspace"
                  description="Re-open recent projects, tabs, and isolated agent chats when VinceZone launches."
                  checked={settings.restoreWorkspace}
                  onChange={(restoreWorkspace) => setSettings({ ...settings, restoreWorkspace })}
                />
                <Toggle
                  label="Compact interface"
                  description="Dense row spacing in Explorer, Search, and Memory panels."
                  checked={settings.compactMode}
                  onChange={(compactMode) => setSettings({ ...settings, compactMode })}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="block rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                    <span className="text-[10px] font-medium text-[#d4d4d4]">Editor Font Size</span>
                    <select
                      value={settings.editorFontSize}
                      onChange={(event) =>
                        setSettings({ ...settings, editorFontSize: Number(event.target.value) })
                      }
                      className="mt-2 w-full rounded-md border border-[#333333] bg-[#121212] px-2 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
                    >
                      {[11, 12, 13, 14, 15, 16].map((size) => (
                        <option key={size} value={size}>
                          {size}px
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, editorWordWrap: !settings.editorWordWrap })
                    }
                    className="flex flex-col justify-between rounded-lg border border-[#2c2c2c] bg-[#181818] p-3 text-left hover:bg-[#1f1f1f]"
                  >
                    <span className="text-[10px] font-medium text-[#d4d4d4]">Word Wrap</span>
                    <span className="mt-2 font-mono text-[11px] text-white">
                      {settings.editorWordWrap ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, editorMinimap: !settings.editorMinimap })
                    }
                    className="flex flex-col justify-between rounded-lg border border-[#2c2c2c] bg-[#181818] p-3 text-left hover:bg-[#1f1f1f]"
                  >
                    <span className="text-[10px] font-medium text-[#d4d4d4]">Code Minimap</span>
                    <span className="mt-2 font-mono text-[11px] text-white">
                      {settings.editorMinimap ? 'VISIBLE' : 'HIDDEN'}
                    </span>
                  </button>
                </div>

                <div className="mt-4 space-y-2.5 rounded-lg border border-[#2c2c2c] bg-[#161616] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-white">
                        Storage, OS Encryption &amp; Updates
                      </p>
                      <p className="mt-0.5 text-[9.5px] text-[#8f8f8f]">
                        Chat, Memory &amp; Revisions saved durably to{' '}
                        <code className="font-mono text-[#d4d4d4]">.vincezone/session-store.json</code>{' '}
                        (no browser storage cap).
                      </p>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[9.5px] ${
                        dpapiActive
                          ? 'bg-[#1e3620] text-[#89d185]'
                          : 'bg-[#262626] text-[#a3a3a3]'
                      }`}
                    >
                      {dpapiActive
                        ? 'API Keys: OS DPAPI Encrypted'
                        : 'API Keys: RAM Session Only'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#252525] pt-2.5">
                    <div className="text-[10px] text-[#a3a3a3]">
                      {updateInfo ? (
                        <>
                          <span className="font-mono text-white">v{updateInfo.currentVersion}</span>
                          {' · '}
                          <span
                            className={
                              updateInfo.updateAvailable ? 'font-semibold text-[#89d185]' : ''
                            }
                          >
                            {updateInfo.message}
                          </span>
                        </>
                      ) : (
                        <span>VinceZone Studio · GitHub Releases Updater</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {updateInfo?.updateAvailable && updateInfo.releaseUrl && (
                        <a
                          href={updateInfo.releaseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-[#525252] bg-[#2a2a2a] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#383838]"
                        >
                          Download v{updateInfo.latestVersion}
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={updateChecking}
                        onClick={() => void checkForUpdates()}
                        className="flex items-center gap-1.5 rounded bg-[#e5e5e5] px-2.5 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                      >
                        <RefreshCw size={10} className={updateChecking ? 'animate-spin' : ''} />
                        {updateChecking ? 'Checking…' : 'Check for Updates'}
                      </button>
                    </div>
                  </div>
                </div>
              </SettingsSection>
            )}

            {tab === 'providers' && (
              <SettingsSection
                title="AI Providers & Model Combos"
                description="Auto-sync local OmniRoute combos, OpenCode & Saving providers, or configure custom OpenAI-compatible endpoints."
              >
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2c2c2c] bg-[#181818] p-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-white">
                      OmniRoute · OpenCode · Saving Sync
                    </p>
                    <p className="text-[9px] text-[#858585]">
                      {discoverStatus ||
                        (omniOnline
                          ? `OmniRoute online (localhost:20128) · ${omniCombos.length} live model combos detected`
                          : 'Click Auto-Sync to import local OmniRoute combos, OpenCode & Saving providers.')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={discoverLoading}
                    onClick={() => void syncLocalProviders()}
                    className="flex shrink-0 items-center gap-1.5 rounded bg-[#e5e5e5] px-2.5 py-1.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                  >
                    <RefreshCw size={11} className={discoverLoading ? 'animate-spin' : ''} />
                    Auto-Sync Local Providers
                  </button>
                </div>

                {omniCombos.length > 0 && (
                  <div className="rounded-lg border border-[#2c2c2c] bg-[#161616] p-2.5">
                    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                      Live OmniRoute Model Combos ({omniCombos.length}) — click to select
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {omniCombos.map((combo) => (
                        <button
                          key={combo.id}
                          type="button"
                          onClick={() =>
                            updateCurrentProvider({
                              ...provider,
                              model: combo.name,
                              models: provider.models.includes(combo.name)
                                ? provider.models
                                : `${combo.name}, ${provider.models}`,
                            })
                          }
                          title={`${combo.strategy}: ${combo.models.join(' → ')}`}
                          className={`rounded border px-2 py-0.5 font-mono text-[9px] transition ${
                            provider.model === combo.name
                              ? 'border-[#e5e5e5] bg-[#e5e5e5] font-semibold text-[#111111]'
                              : 'border-[#333333] bg-[#1d1d1d] text-[#d4d4d4] hover:border-[#666666] hover:text-white'
                          }`}
                        >
                          {combo.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {providers.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setProvider(item)}
                      className={`flex min-w-32 items-center gap-2 rounded-md border px-2.5 py-2 text-left ${
                        provider.id === item.id
                          ? 'border-[#737373] bg-[#262626]'
                          : 'border-[#2c2c2c] bg-[#181818] hover:bg-[#1e1e1e]'
                      }`}
                    >
                      <Zap
                        size={12}
                        className={provider.id === item.id ? 'text-white' : 'text-[#737373]'}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-medium text-[#e5e5e5]">
                          {item.name || 'Untitled'}
                        </span>
                        <span className="block text-[8px] text-[#858585]">
                          {item.models.split(',').filter((m) => m.trim()).length} models
                        </span>
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const next: ProviderConfig = {
                        id: uid(),
                        name: 'Custom Provider',
                        baseUrl: 'https://api.openai.com/v1',
                        apiKey: '',
                        model: 'gpt-4.1',
                        models: 'gpt-4.1, gpt-4.1-mini, o4-mini',
                      }
                      setProviders((current) => [...current, next])
                      setProvider(next)
                    }}
                    className="grid min-w-10 place-items-center rounded-md border border-dashed border-[#444444] text-[#9d9d9d] hover:border-[#888888] hover:text-white"
                    title="Add provider"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <Field
                  label="Display Name"
                  value={provider.name}
                  onChange={(name) => updateCurrentProvider({ ...provider, name })}
                />
                <Field
                  label="Base URL"
                  value={provider.baseUrl}
                  onChange={(baseUrl) => updateCurrentProvider({ ...provider, baseUrl })}
                  placeholder="https://api.openai.com/v1"
                />
                <Field
                  label="API Key (session memory only)"
                  value={provider.apiKey}
                  onChange={(apiKey) => updateCurrentProvider({ ...provider, apiKey })}
                  type="password"
                  placeholder="Never written to localStorage, disk, or logs"
                />
                <Field
                  label="Models (comma-separated)"
                  value={provider.models}
                  onChange={(models) => {
                    const first = models
                      .split(',')
                      .map((m) => m.trim())
                      .filter(Boolean)[0]
                    updateCurrentProvider({
                      ...provider,
                      models,
                      model: provider.model || first || '',
                    })
                  }}
                  placeholder="openai/gpt-4.1, anthropic/claude-sonnet-4, google/gemini-2.5-pro"
                />
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
                    Default Model
                  </span>
                  <select
                    value={provider.model}
                    onChange={(event) =>
                      updateCurrentProvider({ ...provider, model: event.target.value })
                    }
                    className="w-full rounded-md border border-[#333333] bg-[#181818] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none focus:border-[#737373]"
                  >
                    {provider.models
                      .split(',')
                      .map((m) => m.trim())
                      .filter(Boolean)
                      .map((m) => (
                        <option key={m} value={m}>
                          {m}
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
                    className="flex items-center gap-1.5 text-[10px] text-[#f48771] hover:underline"
                  >
                    <Trash2 size={11} /> Remove this provider
                  </button>
                )}

                <div className="flex gap-2 rounded-lg border border-[#2f2f2f] bg-[#181818] p-2.5 text-[10px] leading-4 text-[#a3a3a3]">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#e5e5e5]" />
                  API keys stay in memory only and are never saved to localStorage, disk, or logs.
                  Outbound HTTPS endpoints are verified via DNS with redirects disabled.
                </div>
              </SettingsSection>
            )}

            {tab === 'usage' && (
              <SettingsSection
                title="Token Consumption & Cost Tracking"
                description="Estimated token usage and cost across all AI agents and models in this workspace."
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    { label: 'Requests', value: usageSummary.totals.requests.toLocaleString() },
                    {
                      label: 'Prompt Tokens',
                      value: usageSummary.totals.promptTokens.toLocaleString(),
                    },
                    {
                      label: 'Output Tokens',
                      value: usageSummary.totals.completionTokens.toLocaleString(),
                    },
                    {
                      label: 'Estimated Cost',
                      value: `$${usageSummary.totals.costUsd.toFixed(4)}`,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3"
                    >
                      <p className="text-[9px] uppercase tracking-wider text-[#858585]">
                        {metric.label}
                      </p>
                      <p className="mt-1 font-mono text-base font-semibold text-white">
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>

                {usageRecords.length === 0 ? (
                  <div className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-4 text-[11px] text-[#858585]">
                    No AI requests logged yet. Chat with an agent or run Multi-Agent orchestration to
                    track consumption per model and per agent.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                        By Model
                      </h4>
                      <div className="space-y-1.5">
                        {usageSummary.byModel.map(([modelName, stats]) => (
                          <div
                            key={modelName}
                            className="flex items-center justify-between text-[10px]"
                          >
                            <span className="truncate font-mono text-[#d4d4d4]">{modelName}</span>
                            <span className="shrink-0 font-mono text-[#9d9d9d]">
                              {stats.tokens.toLocaleString()} tok · ${stats.cost.toFixed(4)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                        By Agent
                      </h4>
                      <div className="space-y-1.5">
                        {usageSummary.byAgent.map(([agentName, stats]) => (
                          <div
                            key={agentName}
                            className="flex items-center justify-between text-[10px]"
                          >
                            <span className="truncate text-[#d4d4d4]">{agentName}</span>
                            <span className="shrink-0 font-mono text-[#9d9d9d]">
                              {stats.requests} req · {stats.tokens.toLocaleString()} tok
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[#2b2b2b] pt-3">
                  <span className="text-[10px] text-[#858585]">
                    Total tokens: {usageSummary.totals.totalTokens.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={onResetUsage}
                    className="rounded-md border border-[#3a3a3a] px-2.5 py-1 text-[10px] text-[#d4d4d4] hover:bg-[#262626]"
                  >
                    Reset Usage Log
                  </button>
                </div>
              </SettingsSection>
            )}

            {tab === 'github' && (
              <SettingsSection
                title="GitHub Account & Repository Sync"
                description="Sign in through the local GitHub CLI (gh) for repository operations, PRs, and issues."
              >
                <div className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-9 place-items-center rounded-md border border-[#333333] bg-[#121212]">
                        <GitBranch size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-white">
                          {ghLoading
                            ? 'Checking GitHub CLI...'
                            : ghStatus?.authenticated
                              ? `Signed in as @${ghStatus.username}`
                              : ghStatus?.ghInstalled
                                ? 'Not signed in to GitHub'
                                : 'GitHub CLI (gh) not installed'}
                        </p>
                        <p className="text-[10px] text-[#858585]">
                          {ghStatus?.authenticated
                            ? `Host: ${ghStatus.host || 'github.com'} · Scopes: ${
                                Array.isArray(ghStatus.scopes)
                                  ? ghStatus.scopes.join(', ') || 'default'
                                  : ghStatus.scopes || 'default'
                              }`
                            : ghStatus?.detail ||
                              'Authenticate with a Personal Access Token (PAT) or run `gh auth login`.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void loadGitHubStatus()}
                        disabled={ghLoading}
                        className="rounded border border-[#3a3a3a] bg-[#222222] px-2.5 py-1 text-[10px] text-[#d4d4d4] hover:bg-[#2d2d2d]"
                      >
                        <RefreshCw size={11} className={ghLoading ? 'animate-spin' : ''} />
                      </button>
                      {ghStatus?.authenticated && (
                        <button
                          type="button"
                          onClick={() => void handleGitHubLogout()}
                          disabled={ghLoading}
                          className="flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#222222] px-2.5 py-1 text-[10px] text-[#f48771] hover:bg-[#2d2d2d]"
                        >
                          <LogOut size={11} /> Sign Out
                        </button>
                      )}
                    </div>
                  </div>

                  {ghError && (
                    <p className="mt-2.5 rounded border border-[#5a2a2a] bg-[#2a1414] px-2.5 py-1.5 text-[10px] text-[#f48771]">
                      {ghError}
                    </p>
                  )}
                  {ghMessage && (
                    <p className="mt-2.5 rounded border border-[#3a3a3a] bg-[#222222] px-2.5 py-1.5 text-[10px] text-[#e5e5e5]">
                      {ghMessage}
                    </p>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border border-[#2c2c2c] bg-[#181818] p-3.5">
                  <Field
                    label="Sign in / Switch Account with GitHub Personal Access Token (ghp_...)"
                    type="password"
                    value={ghToken}
                    onChange={setGhToken}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (piped directly to gh auth login --with-token)"
                  />
                  <button
                    type="button"
                    onClick={() => void handleGitHubTokenLogin()}
                    disabled={ghLoading || !ghToken.trim()}
                    className="rounded-md bg-[#e5e5e5] px-3 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                  >
                    Authenticate GitHub
                  </button>
                </div>

                {ghStatus?.repos && ghStatus.repos.length > 0 && (
                  <div className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                      Recent Repositories
                    </h4>
                    <div className="space-y-1.5">
                      {ghStatus.repos.map((repo) => {
                        const label = repo.nameWithOwner || repo.name || repo.url
                        const isPrivate =
                          typeof repo.isPrivate === 'boolean'
                            ? repo.isPrivate
                            : (repo.visibility || '').toUpperCase() === 'PRIVATE'
                        return (
                          <div
                            key={label}
                            className="flex items-center justify-between rounded bg-[#141414] px-2.5 py-1.5 text-[10px]"
                          >
                            <span className="font-mono text-[#e5e5e5]">{label}</span>
                            <span className="rounded border border-[#333333] px-1.5 py-0.5 text-[9px] text-[#9d9d9d]">
                              {isPrivate ? 'Private' : 'Public'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </SettingsSection>
            )}

            {tab === 'skills' && (
              <SettingsSection
                title="Local Skills (.agent/skills) & Skill Combos"
                description="Inspect all skills installed on this machine with their folder paths and /slash commands, plus token-saving Skill Combos from Saving."
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-md border border-[#333333] bg-[#161616] p-0.5">
                    <button
                      type="button"
                      onClick={() => setSkillsSubTab('skills')}
                      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] font-medium transition ${
                        skillsSubTab === 'skills'
                          ? 'bg-[#e5e5e5] text-[#111111]'
                          : 'text-[#a3a3a3] hover:text-white'
                      }`}
                    >
                      <Sparkles size={11} />
                      Machine Skills ({skills.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkillsSubTab('combos')}
                      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[10px] font-medium transition ${
                        skillsSubTab === 'combos'
                          ? 'bg-[#e5e5e5] text-[#111111]'
                          : 'text-[#a3a3a3] hover:text-white'
                      }`}
                    >
                      <Layers size={11} />
                      Skill Combos ({skillCombos.length})
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadExtensions()}
                    className="flex items-center gap-1 rounded border border-[#3a3a3a] px-2.5 py-1 text-[10px] text-[#d4d4d4] hover:bg-[#242424]"
                  >
                    <RefreshCw size={11} className={skillsLoading ? 'animate-spin' : ''} />
                    Rescan Disk
                  </button>
                </div>

                {/* Scanned Directories Banner */}
                <div className="rounded-lg border border-[#2c2c2c] bg-[#161616] p-2.5">
                  <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                    <FolderOpen size={11} />
                    {skillsSubTab === 'skills'
                      ? 'Scanned Skill Directories on Disk'
                      : 'Skill Combos Source (Saving)'}
                  </p>
                  {skillsSubTab === 'skills' ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {skillDirs.map((dir) => (
                        <span
                          key={dir}
                          className="rounded border border-[#2f2f2f] bg-[#111111] px-2 py-0.5 font-mono text-[9px] text-[#cccccc]"
                        >
                          {dir}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 font-mono text-[9px] text-[#9d9d9d]">
                      {comboSource || 'C:\\VisualStudio\\Saving\\data\\combos.json'} · Type{' '}
                      <span className="text-white">/combo:&lt;id&gt;</span> in AI Chat to activate!
                    </p>
                  )}
                </div>

                <label className="flex items-center gap-2 rounded border border-[#333333] bg-[#181818] px-2.5 py-1.5">
                  <Search size={12} className="text-[#858585]" />
                  <input
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    placeholder={
                      skillsSubTab === 'skills'
                        ? 'Search /command, skill name, or folder path (e.g. playwright, ponytail, headroom)...'
                        : 'Search Skill Combos (e.g. token, ponytail, tdd, swarm, security)...'
                    }
                    className="w-full bg-transparent text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666]"
                  />
                  {skillSearch && (
                    <button
                      type="button"
                      onClick={() => setSkillSearch('')}
                      className="text-[#858585] hover:text-white"
                    >
                      <X size={11} />
                    </button>
                  )}
                </label>

                {skillsSubTab === 'skills' ? (
                  <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                    {filteredSkills.map((skill) => {
                      const enabled = settings.enabledSkillIds.includes(skill.id)
                      const cmd = skill.command || `/${skill.slug || skill.name}`
                      return (
                        <div
                          key={skill.id}
                          className={`rounded border p-2.5 transition ${
                            enabled
                              ? 'border-[#6e6e6e] bg-[#242424]'
                              : 'border-[#2b2b2b] bg-[#161616] hover:bg-[#1c1c1c]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                                  {cmd}
                                </span>
                                <span className="truncate text-[10px] font-medium text-[#d4d4d4]">
                                  {skill.name}
                                </span>
                                <span className="rounded bg-[#222222] px-1 py-0.5 text-[8px] text-[#8f8f8f]">
                                  {skill.source}
                                </span>
                              </div>
                              <p className="mt-1 truncate font-mono text-[9px] text-[#7a7a7a]" title={skill.directory || skill.path}>
                                📁 {skill.directory || skill.path}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-[9px] text-[#a3a3a3]">
                                {skill.description}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => copyCommand(cmd)}
                                className="rounded border border-[#3a3a3a] bg-[#1d1d1d] px-1.5 py-1 text-[9px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white"
                                title={`Copy ${cmd}`}
                              >
                                {copiedCmd === cmd ? (
                                  <Check size={10} className="text-white" />
                                ) : (
                                  <Copy size={10} />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleSkill(skill.id)}
                                className={`grid size-5 place-items-center rounded border ${
                                  enabled
                                    ? 'border-[#e5e5e5] bg-[#e5e5e5] text-[#111111]'
                                    : 'border-[#4a4a4a] text-transparent hover:border-[#737373]'
                                }`}
                                title="Toggle active skill"
                              >
                                <Check size={10} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {!skillsLoading && filteredSkills.length === 0 && (
                      <p className="py-4 text-center text-[10px] text-[#737373]">
                        No matching skills found.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Create Custom Skill Combo */}
                    <div className="space-y-2 rounded-lg border border-[#2c2c2c] bg-[#181818] p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                        Create Custom Skill Combo
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          value={newComboName}
                          onChange={(e) => setNewComboName(e.target.value)}
                          placeholder="Combo name (e.g. Fast React Fix)"
                          className="rounded border border-[#333333] bg-[#121212] px-2.5 py-1.5 text-[11px] text-white outline-none"
                        />
                        <input
                          value={newComboSkills}
                          onChange={(e) => setNewComboSkills(e.target.value)}
                          placeholder="Skills (comma-separated: ponytail, headroom, vitest)"
                          className="rounded border border-[#333333] bg-[#121212] px-2.5 py-1.5 font-mono text-[10px] text-white outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={newComboDesc}
                          onChange={(e) => setNewComboDesc(e.target.value)}
                          placeholder="Short description / goal for this combo..."
                          className="min-w-0 flex-1 rounded border border-[#333333] bg-[#121212] px-2.5 py-1.5 text-[11px] text-white outline-none"
                        />
                        <button
                          type="button"
                          disabled={comboSaving || !newComboName.trim() || !newComboSkills.trim()}
                          onClick={() => void createCustomCombo()}
                          className="flex shrink-0 items-center gap-1 rounded bg-[#e5e5e5] px-3 py-1.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                        >
                          <Plus size={11} /> Save Combo
                        </button>
                      </div>
                    </div>

                    {/* Saving & Custom Combos List */}
                    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {filteredCombos.map((combo) => {
                        const comboKey = `combo:${combo.id}`
                        const enabled = settings.enabledSkillIds.includes(comboKey)
                        return (
                          <div
                            key={combo.id}
                            className={`rounded border p-2.5 transition ${
                              enabled
                                ? 'border-[#6e6e6e] bg-[#242424]'
                                : 'border-[#2b2b2b] bg-[#161616] hover:bg-[#1c1c1c]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-semibold text-white">
                                    {combo.name}
                                  </span>
                                  <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-[8px] text-[#e5e5e5]">
                                    {combo.badge}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <span className="rounded bg-[#111111] px-1.5 py-0.5 font-mono text-[9px] text-white">
                                    {combo.command}
                                  </span>
                                  {combo.coreSkills.slice(0, 6).map((slug) => (
                                    <span
                                      key={slug}
                                      className="rounded border border-[#2f2f2f] bg-[#1a1a1a] px-1 py-0.5 font-mono text-[8px] text-[#a3a3a3]"
                                    >
                                      /{slug}
                                    </span>
                                  ))}
                                </div>
                                <p className="mt-1 line-clamp-2 text-[9px] text-[#9d9d9d]">
                                  {combo.description}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => copyCommand(combo.command)}
                                  className="rounded border border-[#3a3a3a] bg-[#1d1d1d] px-1.5 py-1 text-[9px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white"
                                  title={`Copy ${combo.command}`}
                                >
                                  {copiedCmd === combo.command ? (
                                    <Check size={10} className="text-white" />
                                  ) : (
                                    <Copy size={10} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleSkill(comboKey)}
                                  className={`grid size-5 place-items-center rounded border ${
                                    enabled
                                      ? 'border-[#e5e5e5] bg-[#e5e5e5] text-[#111111]'
                                      : 'border-[#4a4a4a] text-transparent hover:border-[#737373]'
                                  }`}
                                  title="Pin combo as active"
                                >
                                  <Check size={10} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </SettingsSection>
            )}

            {tab === 'cli' && (
              <SettingsSection
                title="CLI Tools & Agent Runners"
                description="Expanded detection for local AI coding CLIs, local LLM runners, GitHub CLI, Playwright, and Android ADB."
              >
                <label className="block rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                  <span className="text-[10px] font-medium text-[#d4d4d4]">
                    Default CLI Runner for Terminal Delegation
                  </span>
                  <select
                    value={settings.defaultCliTool}
                    onChange={(event) =>
                      setSettings({ ...settings, defaultCliTool: event.target.value })
                    }
                    className="mt-2 w-full rounded-md border border-[#333333] bg-[#121212] px-2.5 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
                  >
                    {[
                      { id: 'claude-code', label: 'Claude Code (claude)' },
                      { id: 'codex-cli', label: 'OpenAI Codex CLI (codex)' },
                      { id: 'gemini-cli', label: 'Gemini CLI (gemini)' },
                      { id: 'github-copilot', label: 'GitHub Copilot CLI (copilot)' },
                      { id: 'opencode', label: 'OpenCode CLI (opencode)' },
                      { id: 'aider', label: 'Aider AI Pair Programmer (aider)' },
                      { id: 'ollama', label: 'Ollama Local LLM (ollama)' },
                    ].map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                {cliLoading && !cliDetection && (
                  <div className="flex items-center gap-2 rounded-lg border border-[#2c2c2c] bg-[#181818] p-3 text-[10px] text-[#a3a3a3]">
                    <RefreshCw size={13} className="animate-spin text-white" />
                    Scanning local PATH & Windows PATHEXT…
                  </div>
                )}
                {cliError && (
                  <div className="rounded-lg border border-[#5a2a2a] bg-[#2a1414] p-3 text-[10px] text-[#f48771]">
                    {cliError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {cliDetection?.tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center gap-2.5 rounded-lg border border-[#2c2c2c] bg-[#181818] p-2.5"
                    >
                      <div className="grid size-8 shrink-0 place-items-center rounded-md border border-[#333333] bg-[#121212]">
                        <TerminalSquare size={13} className="text-[#cccccc]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-[#e5e5e5]">
                          {tool.name}
                        </p>
                        <p className="truncate font-mono text-[9px] text-[#7a7a7a]">
                          {tool.executable} · {tool.category ?? 'cli'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${
                          tool.installed
                            ? 'border-[#666666] bg-[#2a2a2a] text-white'
                            : 'border-[#2c2c2c] bg-[#141414] text-[#6e6e6e]'
                        }`}
                      >
                        {tool.installed ? 'Installed' : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-[#2b2b2b] pt-3">
                  <p className="flex items-center gap-1.5 text-[9px] text-[#858585]">
                    <TriangleAlert size={11} /> Checks PATH, PATHEXT, and ANDROID_HOME/platform-tools.
                  </p>
                  <button
                    onClick={() => void detectCliTools()}
                    disabled={cliLoading}
                    className="flex items-center gap-1.5 rounded-md border border-[#3a3a3a] px-2.5 py-1 text-[10px] text-[#d4d4d4] hover:bg-[#242424]"
                  >
                    <RefreshCw size={11} className={cliLoading ? 'animate-spin' : ''} />
                    Rescan
                  </button>
                </div>
              </SettingsSection>
            )}

            {tab === 'mcp' && (
              <SettingsSection
                title="Model Context Protocol (MCP) Servers"
                description="Register stdio or HTTP MCP servers that agents can use for browser automation, docs, and workspace tools."
              >
                <div className="space-y-2">
                  {settings.mcpServers.map((server) => {
                    const testResult = mcpTestState[server.id]
                    return (
                      <div
                        key={server.id}
                        className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-white">
                                {server.name}
                              </span>
                              <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#a3a3a3]">
                                {server.transport}
                              </span>
                            </div>
                            <p className="mt-1 truncate font-mono text-[10px] text-[#858585]">
                              {server.endpoint}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={Boolean(testResult?.loading)}
                            onClick={() => void testMcpServer(server)}
                            className="flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#222222] px-2 py-1 text-[10px] text-[#d4d4d4] hover:bg-[#2c2c2c] disabled:opacity-40"
                            title="Run live JSON-RPC initialize + tools/list"
                          >
                            <RefreshCw
                              size={10}
                              className={testResult?.loading ? 'animate-spin' : ''}
                            />
                            Test / Tools
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                mcpServers: settings.mcpServers.map((item) =>
                                  item.id === server.id
                                    ? { ...item, enabled: !item.enabled }
                                    : item,
                                ),
                              })
                            }
                            className={`rounded px-2 py-1 text-[10px] font-medium ${
                              server.enabled
                                ? 'bg-[#e5e5e5] text-[#111111]'
                                : 'border border-[#3a3a3a] bg-[#141414] text-[#858585]'
                            }`}
                          >
                            {server.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                mcpServers: settings.mcpServers.filter(
                                  (item) => item.id !== server.id,
                                ),
                              })
                            }
                            className="icon-button !size-7 text-[#858585] hover:text-[#f48771]"
                            title="Remove MCP server"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {testResult && !testResult.loading && (
                          <div
                            className={`mt-2 rounded border px-2.5 py-1.5 text-[10px] ${
                              testResult.ok
                                ? 'border-[#333333] bg-[#121212] text-[#d4d4d4]'
                                : 'border-[#5a2a2a] bg-[#2a1414] text-[#f48771]'
                            }`}
                          >
                            {testResult.ok ? (
                              <div>
                                <p className="font-semibold text-white">
                                  Connected — {testResult.tools?.length ?? 0} tool(s) discovered
                                </p>
                                {testResult.tools && testResult.tools.length > 0 && (
                                  <p className="mt-1 font-mono text-[9px] text-[#9d9d9d]">
                                    {testResult.tools
                                      .slice(0, 12)
                                      .map((t) => t.name)
                                      .join(', ')}
                                    {testResult.tools.length > 12
                                      ? ` (+${testResult.tools.length - 12} more)`
                                      : ''}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span>{testResult.error || 'Unable to connect to MCP server.'}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="space-y-2.5 rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                    Add MCP Server
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      value={mcpName}
                      onChange={(e) => setMcpName(e.target.value)}
                      placeholder="Server name (e.g. Context7)"
                      className="rounded border border-[#333333] bg-[#121212] px-2.5 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
                    />
                    <select
                      value={mcpTransport}
                      onChange={(e) => setMcpTransport(e.target.value as 'stdio' | 'http')}
                      className="rounded border border-[#333333] bg-[#121212] px-2.5 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
                    >
                      <option value="stdio">stdio command</option>
                      <option value="http">HTTP / SSE URL</option>
                    </select>
                    <input
                      value={mcpEndpoint}
                      onChange={(e) => setMcpEndpoint(e.target.value)}
                      placeholder="npx -y @upstash/context7-mcp"
                      className="rounded border border-[#333333] bg-[#121212] px-2.5 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addMcpServer}
                    disabled={!mcpName.trim() || !mcpEndpoint.trim()}
                    className="flex items-center gap-1 rounded bg-[#e5e5e5] px-3 py-1.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                  >
                    <Plus size={12} /> Add MCP Server
                  </button>
                </div>
              </SettingsSection>
            )}

            {tab === 'extensions' && (
              <SettingsSection
                title="Plugins & .agent Skills"
                description="Toggle built-in VinceZone plugins and manage local .agent / .agents / Gemini SKILL.md modules."
              >
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                    Built-in Plugins
                  </p>
                  {settings.plugins.map((plugin) => (
                    <Toggle
                      key={plugin.id}
                      label={plugin.name}
                      description={plugin.description}
                      checked={plugin.enabled}
                      onChange={(enabled) =>
                        setSettings({
                          ...settings,
                          plugins: settings.plugins.map((item) =>
                            item.id === plugin.id ? { ...item, enabled } : item,
                          ),
                        })
                      }
                    />
                  ))}
                </div>

                <div className="space-y-2 border-t border-[#2b2b2b] pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a3a3a3]">
                        Discovered .agent Skills ({skills.length})
                      </p>
                      <p className="text-[9px] text-[#737373]">
                        {skillDirs.length > 0
                          ? `Scanned: ${skillDirs.join(' · ')}`
                          : 'Scanning workspace .agent/skills & global skills...'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadExtensions()}
                      className="flex items-center gap-1 rounded border border-[#3a3a3a] px-2 py-1 text-[10px] text-[#d4d4d4] hover:bg-[#242424]"
                    >
                      <RefreshCw size={11} className={skillsLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>

                  <label className="flex items-center gap-2 rounded border border-[#333333] bg-[#181818] px-2.5 py-1.5">
                    <Search size={12} className="text-[#858585]" />
                    <input
                      value={skillSearch}
                      onChange={(e) => setSkillSearch(e.target.value)}
                      placeholder="Filter discovered .agent skills (e.g. playwright, cli-anything, react)..."
                      className="w-full bg-transparent text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666]"
                    />
                  </label>

                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {filteredSkills.map((skill) => {
                      const enabled = settings.enabledSkillIds.includes(skill.id)
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => toggleSkill(skill.id)}
                          className={`flex w-full items-start justify-between gap-2 rounded border p-2 text-left transition ${
                            enabled
                              ? 'border-[#6e6e6e] bg-[#242424]'
                              : 'border-[#2b2b2b] bg-[#161616] hover:bg-[#1d1d1d]'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-mono text-[10px] font-semibold text-white">
                                {skill.name}
                              </span>
                              <span className="rounded bg-[#262626] px-1 py-0.5 text-[8px] text-[#9d9d9d]">
                                {skill.source}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[9px] text-[#9d9d9d]">
                              {skill.description || skill.path}
                            </p>
                          </div>
                          <span
                            className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border ${
                              enabled
                                ? 'border-[#e5e5e5] bg-[#e5e5e5] text-[#111111]'
                                : 'border-[#4a4a4a] text-transparent'
                            }`}
                          >
                            <Check size={10} />
                          </span>
                        </button>
                      )
                    })}
                    {!skillsLoading && filteredSkills.length === 0 && (
                      <p className="py-4 text-center text-[10px] text-[#737373]">
                        No matching skills found.
                      </p>
                    )}
                  </div>
                </div>
              </SettingsSection>
            )}

            {tab === 'memory' && (
              <SettingsSection
                title="Project & Agent Memory"
                description="Persistent rules and architectural notes automatically injected into agent prompts for this project."
              >
                <Toggle
                  label="Auto-capture memory from major agent tasks"
                  description="Record key architectural decisions and conventions inside the active project session."
                  checked={settings.autoCaptureMemory}
                  onChange={(autoCaptureMemory) => setSettings({ ...settings, autoCaptureMemory })}
                />

                <div className="space-y-2 rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                  <Field
                    label="New Memory Title"
                    value={memTitle}
                    onChange={setMemTitle}
                    placeholder="e.g. API Authentication Standard"
                  />
                  <textarea
                    rows={2}
                    value={memContent}
                    onChange={(e) => setMemContent(e.target.value)}
                    placeholder="Details that all agents in this project must remember..."
                    className="w-full resize-none rounded border border-[#333333] bg-[#121212] px-2.5 py-2 text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666]"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        if (!memTitle.trim() || !memContent.trim()) return
                        onAddMemoryNote(memTitle.trim(), memContent.trim())
                        setMemTitle('')
                        setMemContent('')
                      }}
                      disabled={!memTitle.trim() || !memContent.trim()}
                      className="rounded bg-[#e5e5e5] px-3 py-1.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                    >
                      Add Memory Note
                    </button>
                    {memoryNotes.length > 0 && (
                      <button
                        type="button"
                        onClick={onClearMemoryNotes}
                        className="text-[10px] text-[#f48771] hover:underline"
                      >
                        Clear All ({memoryNotes.length})
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {memoryNotes.map((note) => (
                    <div
                      key={note.id}
                      className="flex items-start justify-between gap-2 rounded border border-[#2c2c2c] bg-[#181818] p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white">{note.title}</p>
                        <p className="mt-0.5 text-[10px] text-[#9d9d9d]">{note.content}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteMemoryNote(note.id)}
                        className="icon-button !size-6 shrink-0 text-[#858585] hover:text-[#f48771]"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </SettingsSection>
            )}

            {tab === 'agents' && (
              <SettingsSection
                title="Multi-Agent Delegation & Unlimited Grid"
                description="Control coordinator depth, concurrency, and approval checkpoints (no hard 7-agent panel limit)."
              >
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      key: 'maxDepth' as const,
                      label: 'Maximum Delegation Depth',
                      values: [0, 1, 2, 3, 4, 6],
                    },
                    {
                      key: 'maxActiveAgents' as const,
                      label: 'Maximum Active Agents',
                      values: [2, 4, 6, 8, 12, 16, 24],
                    },
                    {
                      key: 'maxConcurrentTasks' as const,
                      label: 'Concurrent Tasks',
                      values: [1, 2, 3, 4, 6, 8, 12],
                    },
                    {
                      key: 'maxIterations' as const,
                      label: 'Delegation Iterations',
                      values: [1, 2, 3, 4, 5, 6, 10],
                    },
                  ].map((field) => (
                    <label
                      key={field.key}
                      className="block rounded-lg border border-[#2c2c2c] bg-[#181818] p-3"
                    >
                      <span className="text-[10px] font-medium text-[#d4d4d4]">{field.label}</span>
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
                        className="mt-2 w-full rounded-md border border-[#333333] bg-[#121212] px-2 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
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

                <label className="block rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
                  <span className="text-[10px] font-medium text-[#d4d4d4]">Task Assignment Mode</span>
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
                    className="mt-2 w-full rounded-md border border-[#333333] bg-[#121212] px-2 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
                  >
                    <option value="automatic">Automatic runtime assignment</option>
                    <option value="manual">Plan first, approve before executing</option>
                  </select>
                </label>

                <Toggle
                  label="Require approval before worker execution"
                  description="Commander plans the task graph and pauses for interactive review before dispatching workers."
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
                  description="Still blocked when Exclusive Territories overlap or a file revision is stale."
                  checked={settings.autoApplyTrusted}
                  onChange={(autoApplyTrusted) => setSettings({ ...settings, autoApplyTrusted })}
                />
              </SettingsSection>
            )}

            {tab === 'permissions' && (
              <SettingsSection
                title="Tool Permissions & Territory Guards"
                description="Destructive commands and cross-territory edits stay approval-gated by default."
              >
                <Toggle
                  label="Confirm dangerous tools"
                  description="Require explicit review before deletes, destructive shell commands, or sensitive edits."
                  checked={settings.confirmDangerousTools}
                  onChange={(confirmDangerousTools) =>
                    setSettings({ ...settings, confirmDangerousTools })
                  }
                />
                <Toggle
                  label="Allow integrated terminal commands"
                  description="Permit local loopback shell execution inside the active workspace directory."
                  checked={settings.allowTerminal}
                  onChange={(allowTerminal) => setSettings({ ...settings, allowTerminal })}
                />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Exclusive Territory Guard',
                    'FE↔BE API Contract Gate',
                    'DNS-Verified SSRF Shield',
                    'Loopback-Only FS & ADB API',
                    'REV-xxx Edit Memory Rollback',
                    'Memory-Only Provider API Keys',
                  ].map((tool) => (
                    <div
                      key={tool}
                      className="flex items-center gap-2 rounded-md border border-[#2c2c2c] bg-[#181818] px-3 py-2 text-[10px] text-[#cccccc]"
                    >
                      <Check size={11} className="text-white" />
                      {tool}
                    </div>
                  ))}
                </div>
              </SettingsSection>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#2b2b2b] bg-[#181818] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[11px] text-[#a3a3a3] hover:bg-[#2a2a2a]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ provider, providers, settings })}
            className="rounded-md bg-[#e5e5e5] px-3.5 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white"
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
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-[10px] text-[#858585]">{description}</p>
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
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-[#2c2c2c] bg-[#181818] p-3 text-left hover:bg-[#1e1e1e]"
    >
      <span>
        <span className="block text-[11px] font-medium text-[#e5e5e5]">{label}</span>
        <span className="mt-1 block text-[10px] leading-4 text-[#858585]">{description}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-[#e5e5e5]' : 'bg-[#333333]'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full shadow transition ${checked ? 'left-[18px] bg-[#111111]' : 'left-0.5 bg-[#9d9d9d]'}`}
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
      <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[#333333] bg-[#101010] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
      />
    </label>
  )
}
