'use client'

import { Bot, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOrchestration } from '@/hooks/use-orchestration'
import type { BridgeMessage } from '@/lib/agent-bridge'
import {
  createEditRevision,
  findRevisionForIntent,
  parseRollbackPrompt,
  type EditRevision,
} from '@/lib/edit-memory'
import {
  applyPatchToFiles,
  inferLanguage,
  normalizeImportedPath,
  rollbackPatchInFiles,
} from '@/lib/file-tree'
import {
  getRoleBlueprint,
  inferRoleId,
  ROLE_INTELLIGENCE_VERSION,
  type VinceZoneRoleId,
} from '@/lib/vincezone-protocol'
import { ActivityBar } from './activity-bar'
import type {
  Agent,
  AgentTask,
  AgentView,
  AppSettings,
  CommunicationEvent,
  MemoryNote,
  PendingApprovalPlan,
  ProjectSessionData,
  ProjectTab,
  ProposedPatch,
  ProviderConfig,
  SidePanel,
  TerminalHistoryEntry,
  UsageRecord,
  WorkspaceFile,
  WorkspaceMode,
} from './agent-types'
import { AgentWorkspace } from './agent-workspace'
import { AndroidEmulator } from './android-emulator'
import { BottomPanel } from './bottom-panel'
import { CraftStudio } from './craft-studio'
import { EditorPane } from './editor-pane'
import { ExplorerSidebar } from './explorer-sidebar'
import { AgentCreatorModal } from './modals/agent-creator-modal'
import { CommandPaletteModal, type PaletteAction } from './modals/command-palette-modal'
import { DiffReviewModal } from './modals/diff-review-modal'
import { ProviderSettingsModal } from './modals/provider-settings-modal'
import { RightAiChatPanel } from './right-ai-chat-panel'
import type { SkillComboItem, SkillIndexItem } from './slash-command-popover'
import { StatusBar, type EditorDiagnostic } from './status-bar'
import { WebPreview } from './web-preview'
import {
  createSeedAgents,
  defaultAppSettings,
  defaultMemoryNotes,
  defaultProvider,
  LEGACY_STORAGE_KEYS,
  starterFiles,
  uid,
  WORKSPACE_STORAGE_KEY,
} from './workspace-defaults'
import { WorkspaceHeader } from './workspace-header'

declare global {
  interface Window {
    vincezoneDesktop?: {
      isDesktop: boolean
      port: number
      openDirectory: () => Promise<string | null>
      onMenuAction: (cb: (payload: { action: string; folder?: string }) => void) => () => void
    }
  }
}

function findPmAgentId(list: Agent[]): string {
  return (
    list.find((item) => item.roleId === 'pm' || item.id === 'pm')?.id ??
    list[0]?.id ??
    'pm'
  )
}

function createFreshSession(projectName: string): ProjectSessionData {
  const seeded = createSeedAgents().map((agent, index) =>
    index === 0
      ? {
          ...agent,
          messages: [
            {
              id: uid(),
              role: 'assistant' as const,
              text: `[${projectName}] PM Orchestrator ready. This project has its own isolated agent chat, memory, and revision timeline.`,
            },
          ],
        }
      : agent,
  )
  return {
    agents: seeded,
    agentTasks: [],
    communicationEvents: [],
    proposedPatches: [],
    revisions: [],
    memoryNotes: defaultMemoryNotes.map((note) => ({ ...note, id: `${note.id}-${uid()}` })),
  }
}

export function IDEWorkspace() {
  const [files, setFiles] = useState<WorkspaceFile[]>(starterFiles)
  const [projects, setProjects] = useState<ProjectTab[]>([
    {
      id: 'vincezone-studio',
      name: 'VinceZone Studio',
      files: starterFiles,
    },
  ])
  const [activeProjectId, setActiveProjectId] = useState('vincezone-studio')
  const [activePath, setActivePath] = useState(starterFiles[0].path)
  const [openPaths, setOpenPaths] = useState([starterFiles[0].path, starterFiles[1].path])
  const [agents, setAgents] = useState<Agent[]>(() => createSeedAgents())
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([])
  const [communicationEvents, setCommunicationEvents] = useState<CommunicationEvent[]>([])
  const [proposedPatches, setProposedPatches] = useState<ProposedPatch[]>([])
  const [revisions, setRevisions] = useState<EditRevision[]>([])
  const [memoryNotes, setMemoryNotes] = useState<MemoryNote[]>(defaultMemoryNotes)
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([])
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalPlan | null>(null)
  const [terminalEntries, setTerminalEntries] = useState<TerminalHistoryEntry[]>([])
  const [terminalRunning, setTerminalRunning] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [agentViews, setAgentViews] = useState<Record<string, AgentView>>({})
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('ide')
  const [sidePanel, setSidePanel] = useState<SidePanel>('explorer')
  const [rightPanelMode, setRightPanelMode] = useState<'chat' | 'phone' | null>('chat')
  const rightChatOpen = rightPanelMode === 'chat'
  const [rightChatAgentId, setRightChatAgentId] = useState('pm')
  const [searchQuery, setSearchQuery] = useState('')
  const [revealRequest, setRevealRequest] = useState<{
    path: string
    line: number
    seq: number
  } | null>(null)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalMaximized, setTerminalMaximized] = useState(false)
  const [bottomPanel, setBottomPanel] = useState<
    'terminal' | 'problems' | 'output' | 'debug' | 'mail'
  >('terminal')
  const [runState, setRunState] = useState<'idle' | 'running' | 'success'>('idle')
  const [debugState, setDebugState] = useState<'idle' | 'starting' | 'paused' | 'running'>('idle')
  const [debugLine, setDebugLine] = useState(5)
  const [aiActivity, setAiActivity] = useState<'idle' | 'reading' | 'editing'>('idle')
  const [editPulse, setEditPulse] = useState(false)
  const editPulseTimer = useRef<number | null>(null)
  const autoSaveTimersRef = useRef<Map<string, number>>(new Map())
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [agentCreatorOpen, setAgentCreatorOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [diffModalState, setDiffModalState] = useState<{ open: boolean; patchId?: string }>({
    open: false,
  })
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings)
  const [providers, setProviders] = useState<ProviderConfig[]>([defaultProvider])
  const [savedProvider, setSavedProvider] = useState<ProviderConfig>(defaultProvider)
  const [availableSkills, setAvailableSkills] = useState<SkillIndexItem[]>([])
  const [availableCombos, setAvailableCombos] = useState<SkillComboItem[]>([])
  const [isDesktop, setIsDesktop] = useState(false)

  // Group 1 + 2 Coding Experience & Multi-Agent Bridge state
  const [bridgeEnabled, setBridgeEnabled] = useState(true)
  const [bridgeMessages, setBridgeMessages] = useState<BridgeMessage[]>([])
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([])
  const [splitPath, setSplitPath] = useState<string | null>(null)
  const [paletteMode, setPaletteMode] = useState<'files' | 'commands' | null>(null)
  const [formatSeq, setFormatSeq] = useState(0)
  const [chatFocusSeq, setChatFocusSeq] = useState(0)
  const [explorerWidth, setExplorerWidth] = useState(256)
  const [rightChatWidth, setRightChatWidth] = useState(320)
  const [terminalHeight, setTerminalHeight] = useState(200)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const hydratedRef = useRef(false)
  const diskSnapshotRef = useRef<Map<string, string>>(new Map())

  // Keep latest session state in a ref so project switching & async loaders never read stale values
  const sessionRef = useRef<ProjectSessionData>({
    agents,
    agentTasks,
    communicationEvents,
    proposedPatches,
    revisions,
    memoryNotes,
  })
  sessionRef.current = {
    agents,
    agentTasks,
    communicationEvents,
    proposedPatches,
    revisions,
    memoryNotes,
  }

  const activeProjectIdRef = useRef(activeProjectId)
  activeProjectIdRef.current = activeProjectId

  const filesRef = useRef(files)
  filesRef.current = files

  const projectsRef = useRef(projects)
  projectsRef.current = projects

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const activeFile = files.find((file) => file.path === activePath) ?? files[0]

  const hydrateSession = useCallback((session: ProjectSessionData) => {
    const nextAgents = session.agents.length ? session.agents : createSeedAgents()
    setAgents(nextAgents)
    setAgentTasks(session.agentTasks ?? [])
    setCommunicationEvents(session.communicationEvents ?? [])
    setProposedPatches(session.proposedPatches ?? [])
    setRevisions(session.revisions ?? [])
    setMemoryNotes(session.memoryNotes ?? defaultMemoryNotes)
    setPendingApproval(null)
    setRightChatAgentId(findPmAgentId(nextAgents))
  }, [])

  const loadLocalDirectory = useCallback(
    async (dirPath?: string, preserveCurrentSession = false) => {
      try {
        const query = dirPath ? `?root=${encodeURIComponent(dirPath)}` : ''
        const response = await fetch(`/api/workspace${query}`, { cache: 'no-store' })
        if (!response.ok) return false
        const payload = (await response.json()) as {
          root: string
          name: string
          files: WorkspaceFile[]
        }
        if (!payload.files.length) return false

        const projectId = `disk-${payload.root}`
        diskSnapshotRef.current = new Map(payload.files.map((file) => [file.path, file.content]))

        const existingTarget = projectsRef.current.find((item) => item.id === projectId)
        const outgoingId = activeProjectIdRef.current
        const outgoingSession = sessionRef.current
        const outgoingFiles = filesRef.current

        const nextTargetSession = preserveCurrentSession
          ? outgoingSession
          : existingTarget?.session ?? createFreshSession(payload.name)

        setProjects((current) => {
          const withSavedOutgoing = current.map((item) =>
            item.id === outgoingId
              ? { ...item, files: outgoingFiles, session: outgoingSession }
              : item,
          )
          const exists = withSavedOutgoing.some((item) => item.id === projectId)
          if (exists) {
            return withSavedOutgoing.map((item) =>
              item.id === projectId
                ? {
                    ...item,
                    name: payload.name,
                    rootPath: payload.root,
                    files: payload.files,
                    session: nextTargetSession,
                  }
                : item,
            )
          }
          return [
            ...withSavedOutgoing.filter((item) => item.id !== 'vincezone-studio'),
            {
              id: projectId,
              name: payload.name,
              rootPath: payload.root,
              files: payload.files,
              session: nextTargetSession,
            },
          ]
        })

        setActiveProjectId(projectId)
        setFiles(payload.files)
        if (!preserveCurrentSession) {
          hydrateSession(nextTargetSession)
        }
        const preferred =
          payload.files.find((f) => f.path.endsWith('page.tsx')) ??
          payload.files.find((f) => f.name === 'README.md') ??
          payload.files[0]
        if (preferred) {
          setActivePath(preferred.path)
          setOpenPaths([preferred.path])
        }
        return true
      } catch {
        return false
      }
    },
    [hydrateSession],
  )

  // Hydrate persisted state + auto-load local workspace on localhost:40704 desktop runtime
  useEffect(() => {
    setIsDesktop(Boolean(window.vincezoneDesktop?.isDesktop))

    let rawSaved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (!rawSaved) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const found = window.localStorage.getItem(legacyKey)
        if (found) {
          rawSaved = found
          break
        }
      }
    }
    hydratedRef.current = true

    let restoredAgents = false
    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved) as {
          roleIntelligenceVersion?: number
          files?: WorkspaceFile[]
          provider?: ProviderConfig
          providers?: ProviderConfig[]
          projects?: ProjectTab[]
          activeProjectId?: string
          settings?: AppSettings
          agents?: Agent[]
          agentTasks?: AgentTask[]
          communicationEvents?: CommunicationEvent[]
          proposedPatches?: ProposedPatch[]
          revisions?: EditRevision[]
          memoryNotes?: MemoryNote[]
          usageRecords?: UsageRecord[]
        }

        const needsBlueprintUpgrade = parsed.roleIntelligenceVersion !== ROLE_INTELLIGENCE_VERSION
        const upgradeAgentBlueprint = (agent: Agent): Agent => {
          const roleId = agent.roleId ?? inferRoleId(`${agent.id} ${agent.role}`)
          const blueprint = getRoleBlueprint(roleId)
          const upgradeSoul = needsBlueprintUpgrade && (!agent.soul || agent.soul.length < 360)
          const upgradeMission =
            needsBlueprintUpgrade && (!agent.mission || agent.mission.length < 320)
          const upgradeMemory =
            needsBlueprintUpgrade && (!agent.memory || agent.memory.length < 300)
          const isStalledCombo =
            needsBlueprintUpgrade &&
            (agent.model === 'lead-architect' ||
              agent.model === 'backend-core' ||
              agent.model === 'frontend-ui-ux')
          return {
            ...agent,
            roleId,
            role: upgradeMission ? blueprint.summary : agent.role,
            soul: upgradeSoul ? blueprint.defaultSoul : agent.soul,
            mission: upgradeMission ? blueprint.defaultMission : agent.mission,
            memory: upgradeMemory ? blueprint.defaultMemory : agent.memory,
            model: isStalledCombo ? blueprint.recommendedModel : agent.model,
          }
        }

        if (parsed.settings) {
          setAppSettings((current) => ({
            ...current,
            ...parsed.settings,
            mcpServers: parsed.settings?.mcpServers?.length
              ? parsed.settings.mcpServers
              : current.mcpServers,
            plugins: parsed.settings?.plugins?.length ? parsed.settings.plugins : current.plugins,
            enabledSkillIds: parsed.settings?.enabledSkillIds ?? current.enabledSkillIds,
            delegation: { ...current.delegation, ...parsed.settings?.delegation },
          }))
        }
        if (parsed.provider) {
          setSavedProvider({
            ...parsed.provider,
            id: parsed.provider.id || 'restored-provider',
            models: parsed.provider.models || parsed.provider.model || '',
            apiKey: '',
          })
        }
        if (parsed.providers?.length) {
          setProviders(
            parsed.providers.map((item) => ({
              ...item,
              id: item.id || uid(),
              models: item.models || item.model || '',
              apiKey: '',
            })),
          )
        }
        if (parsed.projects?.length) {
          setProjects(
            parsed.projects.map((project) =>
              project.session?.agents?.length
                ? {
                    ...project,
                    session: {
                      ...project.session,
                      agents: project.session.agents.map(upgradeAgentBlueprint),
                    },
                  }
                : project,
            ),
          )
          if (parsed.activeProjectId) {
            setActiveProjectId(parsed.activeProjectId)
          }
        }
        if (parsed.agents?.length) {
          restoredAgents = true
          const normalized = parsed.agents.map((agent) => {
            const upgraded = upgradeAgentBlueprint(agent)
            return {
              ...upgraded,
              status:
                upgraded.status === 'running' || upgraded.status === 'reviewing'
                  ? ('paused' as const)
                  : upgraded.status,
              currentTask: undefined,
              composingPrompt: undefined,
            }
          })
          setAgents(normalized)
          setRightChatAgentId(findPmAgentId(normalized))
        }
        if (parsed.agentTasks) {
          setAgentTasks(
            parsed.agentTasks.map((task) => ({
              ...task,
              status: task.status === 'running' ? 'blocked' : task.status,
              error:
                task.status === 'running'
                  ? 'Runtime was disconnected before this task completed.'
                  : task.error,
            })),
          )
        }
        if (parsed.communicationEvents) {
          setCommunicationEvents(
            parsed.communicationEvents.map((event) => ({
              ...event,
              kind:
                event.kind ??
                (event.type === 'worker.response.completed' ? 'report' : 'delegation'),
            })),
          )
        }
        if (parsed.proposedPatches) setProposedPatches(parsed.proposedPatches)
        if (parsed.revisions) setRevisions(parsed.revisions)
        if (parsed.memoryNotes?.length) setMemoryNotes(parsed.memoryNotes)
        if (parsed.usageRecords?.length) setUsageRecords(parsed.usageRecords)
      } catch {
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
      }
    }

    // Load actual workspace files from disk via localhost API, preserving restored session on boot
    void loadLocalDirectory(undefined, restoredAgents)

    // Preload discovered skills + Saving Skill Combos for `/` slash commands
    void fetch('/api/extensions', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { skills?: SkillIndexItem[]; combos?: SkillComboItem[] } | null) => {
        if (data?.skills?.length) setAvailableSkills(data.skills)
        if (data?.combos?.length) setAvailableCombos(data.combos)
      })
      .catch(() => {})

    // Auto-discover local OmniRoute (with live model combos), OpenCode, and Saving providers (memory-only keys)
    void fetch('/api/providers/discover', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean; providers?: ProviderConfig[] } | null) => {
        if (!data?.ok || !data.providers?.length) return
        const foundList = data.providers
        setProviders((current) => {
          const filtered = current.filter((p) => !p.baseUrl.includes('api.omnirouter.ai'))
          const merged = [...filtered]
          for (const found of foundList) {
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
              merged.push(found)
            }
          }
          return merged
        })
        const omni = foundList.find((p) => p.id === 'omnirouter') ?? foundList[0]
        if (omni) {
          setSavedProvider((current) => {
            const isLegacyBroken =
              !current.apiKey ||
              current.baseUrl.includes('api.omnirouter.ai') ||
              current.id === 'omnirouter'
            return isLegacyBroken ? omni : current
          })
          // Migrate legacy placeholder models on restored agents to live OmniRoute combo models
          setAgents((current) =>
            current.map((agent) => {
              const isLegacyModel =
                !agent.model ||
                agent.model === 'openai/gpt-4.1' ||
                agent.model === 'anthropic/claude-sonnet-4' ||
                agent.model === 'google/gemini-2.5-pro' ||
                agent.model === 'lead-architect' ||
                agent.model === 'backend-core' ||
                agent.model === 'frontend-ui-ux'
              if (!isLegacyModel) return agent
              const rid = agent.roleId ?? inferRoleId(`${agent.id} ${agent.role}`)
              const comboForRole = getRoleBlueprint(rid).recommendedModel
              return { ...agent, providerId: omni.id, model: comboForRole }
            }),
          )
        }
      })
      .catch(() => {})

    // Hydrate saved split-pane sizes + live Agent Bridge history
    try {
      const savedSizes = JSON.parse(window.localStorage.getItem('vincezone-pane-sizes') || '{}') as {
        explorerWidth?: number
        rightChatWidth?: number
        terminalHeight?: number
      }
      if (savedSizes.explorerWidth) setExplorerWidth(savedSizes.explorerWidth)
      if (savedSizes.rightChatWidth) setRightChatWidth(savedSizes.rightChatWidth)
      if (savedSizes.terminalHeight) setTerminalHeight(savedSizes.terminalHeight)
    } catch {
      // ignore
    }

    void fetch('/api/bridge', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { messages?: BridgeMessage[] } | null) => {
        if (data?.messages?.length) setBridgeMessages(data.messages)
      })
      .catch(() => {})
  }, [loadLocalDirectory])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'vincezone-pane-sizes',
        JSON.stringify({ explorerWidth, rightChatWidth, terminalHeight }),
      )
    } catch {
      // ignore
    }
  }, [explorerWidth, rightChatWidth, terminalHeight])

  const startDragResize = (
    axis: 'x' | 'y',
    startPos: number,
    initialSize: number,
    min: number,
    max: number,
    invert: boolean,
    onChange: (next: number) => void,
  ) => {
    const onMove = (ev: MouseEvent) => {
      const delta = (axis === 'x' ? ev.clientX : ev.clientY) - startPos
      const raw = invert ? initialSize - delta : initialSize + delta
      onChange(Math.min(max, Math.max(min, Math.round(raw))))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const persistWorkspace = useCallback(
    (overrides?: {
      files?: WorkspaceFile[]
      projects?: ProjectTab[]
      activeProjectId?: string
      provider?: ProviderConfig
      providers?: ProviderConfig[]
      settings?: AppSettings
      revisions?: EditRevision[]
      memoryNotes?: MemoryNote[]
      usageRecords?: UsageRecord[]
    }) => {
      const nextFiles = overrides?.files ?? files
      const nextActiveId = overrides?.activeProjectId ?? activeProjectId
      const currentSession: ProjectSessionData = {
        agents,
        agentTasks,
        communicationEvents: communicationEvents.slice(-200),
        proposedPatches: proposedPatches.slice(0, 40),
        revisions: (overrides?.revisions ?? revisions).slice(-30),
        memoryNotes: overrides?.memoryNotes ?? memoryNotes,
      }
      const nextProjects = (overrides?.projects ?? projects).map((project) =>
        project.id === nextActiveId
          ? { ...project, files: nextFiles, session: currentSession }
          : project,
      )
      const nextProvider = overrides?.provider ?? savedProvider
      const nextProviders = overrides?.providers ?? providers
      const nextSettings = overrides?.settings ?? appSettings
      const nextRevisions = overrides?.revisions ?? revisions
      const nextMemory = overrides?.memoryNotes ?? memoryNotes
      const nextUsage = overrides?.usageRecords ?? usageRecords

      try {
        window.localStorage.setItem(
          WORKSPACE_STORAGE_KEY,
          JSON.stringify({
            roleIntelligenceVersion: ROLE_INTELLIGENCE_VERSION,
            files: nextFiles.slice(0, 30),
            projects: nextProjects.map((project) => ({
              id: project.id,
              name: project.name,
              rootPath: project.rootPath,
              files: project.files.slice(0, 10),
              session: project.session
                ? {
                    ...project.session,
                    communicationEvents: project.session.communicationEvents.slice(-120),
                    proposedPatches: project.session.proposedPatches.slice(0, 30),
                    revisions: project.session.revisions.slice(-20),
                  }
                : undefined,
            })),
            activeProjectId: nextActiveId,
            provider: { ...nextProvider, apiKey: '' },
            providers: nextProviders.map((item) => ({ ...item, apiKey: '' })),
            settings: nextSettings,
            agents,
            agentTasks,
            communicationEvents: communicationEvents.slice(-300),
            proposedPatches: proposedPatches.slice(0, 60),
            revisions: nextRevisions.slice(-40),
            memoryNotes: nextMemory,
            usageRecords: nextUsage.slice(-200),
          }),
        )
      } catch {
        // Ignore quota errors on very large disk workspaces.
      }
    },
    [
      activeProjectId,
      agentTasks,
      agents,
      appSettings,
      communicationEvents,
      files,
      memoryNotes,
      projects,
      proposedPatches,
      providers,
      revisions,
      savedProvider,
      usageRecords,
    ],
  )

  useEffect(() => {
    if (!hydratedRef.current) return
    const timer = window.setTimeout(() => persistWorkspace(), 350)
    return () => window.clearTimeout(timer)
  }, [persistWorkspace])

  const writeFileToDiskIfConnected = useCallback(
    async (filePath: string, content: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'write',
            root: activeProject?.rootPath || '',
            path: filePath,
            content,
          }),
        })
        if (!res.ok) return false
        diskSnapshotRef.current.set(filePath, content)
        return true
      } catch {
        // Keep browser state even if local disk write fails.
        return false
      }
    },
    [activeProject?.rootPath],
  )

  const recordRevision = useCallback(
    (input: {
      path: string
      actor: string
      summary: string
      previousContent: string | null
      nextContent: string
    }) => {
      if (input.previousContent === input.nextContent) return
      setRevisions((current) => {
        const nextRev = createEditRevision(current, input)
        return [...current.slice(-39), nextRev]
      })
    },
    [],
  )

  const restoreRevisionById = useCallback(
    (revisionId: string): { restored: boolean; message: string } => {
      const target = revisions.find((rev) => rev.id.toUpperCase() === revisionId.toUpperCase())
      if (!target) {
        return { restored: false, message: `Revision ${revisionId} was not found in Edit Memory.` }
      }
      const nextFiles = rollbackPatchInFiles(files, target.path, target.previousContent)
      setFiles(nextFiles)
      if (target.previousContent !== null) {
        void writeFileToDiskIfConnected(target.path, target.previousContent)
      }
      persistWorkspace({ files: nextFiles })
      return {
        restored: true,
        message: `Restored "${target.path}" to state before ${target.id} (${target.summary}).`,
      }
    },
    [files, persistWorkspace, revisions, writeFileToDiskIfConnected],
  )

  const handlePromptRollback = useCallback(
    (prompt: string) => {
      const intent = parseRollbackPrompt(prompt)
      if (!intent) return null
      const match = findRevisionForIntent(revisions, intent)
      if (!match) {
        return {
          restored: false,
          message: 'Edit Memory has no matching revision yet. Save a file or apply a patch first.',
        }
      }
      return restoreRevisionById(match.id)
    },
    [restoreRevisionById, revisions],
  )

  const handleRecordUsage = useCallback((record: UsageRecord) => {
    setUsageRecords((current) => [...current.slice(-199), record])
  }, [])

  const addMemoryNote = useCallback((title: string, content: string) => {
    setMemoryNotes((current) => [
      {
        id: `mem-${uid()}`,
        scope: 'project',
        title,
        content,
        updatedAt: new Date().toISOString(),
      },
      ...current,
    ])
  }, [])

  const deleteMemoryNote = useCallback((id: string) => {
    setMemoryNotes((current) => current.filter((note) => note.id !== id))
  }, [])

  const handleOpenLocalDirectory = useCallback(async () => {
    if (window.vincezoneDesktop?.openDirectory) {
      const folder = await window.vincezoneDesktop.openDirectory()
      if (folder) {
        await loadLocalDirectory(folder, false)
      }
      return
    }
    const typed = window.prompt(
      'Enter absolute local directory path to open (or cancel to pick files in browser):',
      activeProject?.rootPath || '',
    )
    if (typed && typed.trim()) {
      const ok = await loadLocalDirectory(typed.trim(), false)
      if (!ok) fileInputRef.current?.click()
    } else {
      fileInputRef.current?.click()
    }
  }, [activeProject?.rootPath, loadLocalDirectory])

  const runTerminalCommand = useCallback(
    async (command: string, options?: { openTerminal?: boolean }) => {
      const shouldOpen = options?.openTerminal ?? false
      if (shouldOpen) {
        setWorkspaceMode('ide')
        setTerminalOpen(true)
        setBottomPanel('terminal')
      }
      setTerminalRunning(true)
      setRunState('running')
      try {
        const response = await fetch('/api/runner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'run-silent',
            command,
            cwd: activeProject?.rootPath,
          }),
        })
        const data = (await response.json()) as {
          ok?: boolean
          exitCode?: number
          cwd?: string
          durationMs?: number
          stdout?: string
          stderr?: string
          error?: string
        }
        setTerminalEntries((current) => [
          ...current.slice(-24),
          {
            id: uid(),
            command,
            cwd: data.cwd || activeProject?.rootPath || 'workspace',
            stdout: data.stdout || '',
            stderr: data.stderr || data.error || '',
            exitCode: data.exitCode ?? (response.ok ? 0 : 1),
            durationMs: data.durationMs ?? 0,
            timestamp: new Date().toISOString(),
          },
        ])
        setRunState(data.ok ? 'success' : 'idle')
      } catch (error) {
        setTerminalEntries((current) => [
          ...current.slice(-24),
          {
            id: uid(),
            command,
            cwd: activeProject?.rootPath || 'workspace',
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Background run failed.',
            exitCode: 1,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          },
        ])
        setRunState('idle')
      } finally {
        setTerminalRunning(false)
      }
    },
    [activeProject?.rootPath],
  )

  // Global developer keyboard shortcuts + Electron native menu listener
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (mod && event.shiftKey && key === 'p') {
        event.preventDefault()
        setPaletteMode('commands')
      } else if (mod && !event.shiftKey && key === 'p') {
        event.preventDefault()
        setPaletteMode('files')
      } else if (mod && event.shiftKey && (key === 'f' || key === 'h')) {
        event.preventDefault()
        setWorkspaceMode('ide')
        setSidePanel('search')
        setExplorerOpen(true)
      } else if (mod && !event.shiftKey && key === 'b') {
        event.preventDefault()
        setWorkspaceMode('ide')
        setExplorerOpen((prev) => !prev)
      } else if (mod && !event.shiftKey && (key === 'j' || event.key === '`')) {
        event.preventDefault()
        setWorkspaceMode('ide')
        setTerminalOpen((prev) => !prev)
      } else if (mod && !event.shiftKey && event.key === '\\') {
        event.preventDefault()
        setWorkspaceMode('ide')
        setSplitPath((prev) => {
          if (prev) return null
          return filesRef.current.find((f) => f.path !== activePath)?.path ?? activePath ?? null
        })
      } else if (mod && !event.shiftKey && key === 'w') {
        if (activePath) {
          event.preventDefault()
          setOpenPaths((current) => {
            const next = current.filter((item) => item !== activePath)
            setActivePath(next[next.length - 1] ?? '')
            return next
          })
        }
      } else if (event.altKey && !mod && key === 'z') {
        event.preventDefault()
        setAppSettings((current) => ({ ...current, editorWordWrap: !current.editorWordWrap }))
      }
    }
    window.addEventListener('keydown', onKeyDown)

    const unsubscribeMenu = window.vincezoneDesktop?.onMenuAction?.((payload) => {
      if (payload.action === 'open-workspace' && payload.folder) {
        void loadLocalDirectory(payload.folder, false)
      } else if (payload.action === 'open-settings') {
        setSettingsOpen(true)
      } else if (payload.action === 'toggle-terminal') {
        setTerminalOpen((prev) => !prev)
      } else if (payload.action === 'open-agents') {
        setWorkspaceMode('agents')
      } else if (payload.action === 'open-revisions') {
        setWorkspaceMode('ide')
        setSidePanel('revisions')
        setExplorerOpen(true)
      }
    })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      unsubscribeMenu?.()
    }
  }, [activePath, loadLocalDirectory])

  // Clear pending debounced auto-save timers on unmount
  useEffect(() => {
    const timers = autoSaveTimersRef.current
    return () => {
      for (const id of timers.values()) {
        window.clearTimeout(id)
      }
      timers.clear()
    }
  }, [])

  const applyDirectAgentEdit = useCallback(
    ({
      path: targetPath,
      content,
      summary,
      agent,
    }: {
      path: string
      content: string
      summary: string
      agent: Agent
    }) => {
      const currentFiles = filesRef.current
      const { nextFiles, previousContent } = applyPatchToFiles(currentFiles, targetPath, content)
      const roleCode = (agent.roleId ?? inferRoleId(`${agent.id} ${agent.role}`)).toUpperCase()
      const nextRev = createEditRevision(sessionRef.current.revisions, {
        path: targetPath,
        actor: `${agent.name} (@${roleCode})`,
        summary,
        previousContent,
        nextContent: content,
      })
      setRevisions((current) => [...current.slice(-39), nextRev])
      setFiles(nextFiles)
      filesRef.current = nextFiles
      void writeFileToDiskIfConnected(targetPath, content).then((saved) => {
        if (!saved) return
        setFiles((current) => {
          const clean = current.map((f) =>
            f.path === targetPath && f.content === content ? { ...f, dirty: false } : f,
          )
          filesRef.current = clean
          return clean
        })
      })
      setActivePath(targetPath)
      setOpenPaths((current) => (current.includes(targetPath) ? current : [...current, targetPath]))
      persistWorkspace({ files: nextFiles })
      return { applied: true, revisionId: nextRev.id }
    },
    [persistWorkspace, writeFileToDiskIfConnected],
  )

  const handleBridgeMessage = useCallback((msg: BridgeMessage) => {
    setBridgeMessages((current) => [...current.slice(-119), msg])
  }, [])

  const { sendMessage, streamOrchestration, delegateAgent, pauseAgent, previewMailExchange } =
    useOrchestration({
      agents,
      files,
      activeFile,
      projectName: activeProject?.name ?? 'VinceZone Studio',
      workspaceRoot: activeProject?.rootPath,
      memoryNotes,
      bridgeMessages,
      bridgeEnabled,
      providers,
      savedProvider,
      appSettings,
      drafts,
      setAgents,
      setAgentTasks,
      setCommunicationEvents,
      setProposedPatches,
      setPendingApproval,
      setDrafts,
      setAiActivity,
      onBridgeMessage: handleBridgeMessage,
      onRecordUsage: handleRecordUsage,
      onApplyDirectEdit: applyDirectAgentEdit,
      onPromptRollback: handlePromptRollback,
    })

  const updateFile = (content = '') => {
    if (!activePath) return
    const targetPath = activePath
    setEditPulse(true)
    if (editPulseTimer.current) window.clearTimeout(editPulseTimer.current)
    editPulseTimer.current = window.setTimeout(() => setEditPulse(false), 420)

    setFiles((current) =>
      current.map((file) => (file.path === targetPath ? { ...file, content, dirty: true } : file)),
    )

    if (appSettings.autoSave) {
      const existingTimer = autoSaveTimersRef.current.get(targetPath)
      if (existingTimer) window.clearTimeout(existingTimer)
      const delay = Math.max(300, appSettings.autoSaveDelayMs || 1000)
      const timerId = window.setTimeout(() => {
        autoSaveTimersRef.current.delete(targetPath)
        const previous = diskSnapshotRef.current.get(targetPath) ?? null
        recordRevision({
          path: targetPath,
          actor: 'Auto-Save',
          summary: `Auto-saved (${delay}ms)`,
          previousContent: previous,
          nextContent: content,
        })
        void writeFileToDiskIfConnected(targetPath, content)
        setFiles((current) => {
          const next = current.map((file) =>
            file.path === targetPath ? { ...file, dirty: false } : file,
          )
          persistWorkspace({ files: next })
          return next
        })
      }, delay)
      autoSaveTimersRef.current.set(targetPath, timerId)
    }
  }

  const saveFile = () => {
    const target = files.find((file) => file.path === activePath)
    if (!target) return
    const existingTimer = autoSaveTimersRef.current.get(target.path)
    if (existingTimer) {
      window.clearTimeout(existingTimer)
      autoSaveTimersRef.current.delete(target.path)
    }
    const previous = diskSnapshotRef.current.get(target.path) ?? null
    recordRevision({
      path: target.path,
      actor: 'User',
      summary: 'Manual save (Ctrl+S)',
      previousContent: previous,
      nextContent: target.content,
    })
    void writeFileToDiskIfConnected(target.path, target.content)

    setFiles((current) => {
      const next = current.map((file) =>
        file.path === activePath ? { ...file, dirty: false } : file,
      )
      persistWorkspace({ files: next })
      return next
    })
  }

  const openFile = (path: string, line?: number) => {
    setWorkspaceMode('ide')
    setActivePath(path)
    setOpenPaths((current) => (current.includes(path) ? current : [...current, path]))
    if (line) {
      setRevealRequest((current) => ({ path, line, seq: (current?.seq ?? 0) + 1 }))
    }
  }

  const closeTab = (path: string) => {
    const next = openPaths.filter((item) => item !== path)
    setOpenPaths(next)
    if (activePath === path) setActivePath(next[next.length - 1] ?? '')
  }

  const switchProject = (id: string) => {
    if (id === activeProjectId) return
    const outgoingSession = sessionRef.current
    const target = projects.find((project) => project.id === id)
    if (!target) return
    const targetSession = target.session ?? createFreshSession(target.name)

    setProjects((current) =>
      current.map((project) =>
        project.id === activeProjectId
          ? { ...project, files, session: outgoingSession }
          : project.id === id
            ? { ...project, session: targetSession }
            : project,
      ),
    )
    setActiveProjectId(id)
    setFiles(target.files)
    setActivePath(target.files[0]?.path ?? '')
    setOpenPaths(target.files[0] ? [target.files[0].path] : [])
    hydrateSession(targetSession)
  }

  const closeProject = (id: string) => {
    if (projects.length === 1) return
    const remaining = projects.filter((project) => project.id !== id)
    setProjects(remaining)
    if (activeProjectId === id) {
      const next = remaining[0]
      const nextSession = next.session ?? createFreshSession(next.name)
      setActiveProjectId(next.id)
      setFiles(next.files)
      setActivePath(next.files[0]?.path ?? '')
      setOpenPaths(next.files[0] ? [next.files[0].path] : [])
      hydrateSession(nextSession)
    }
  }

  const importFolder = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).slice(0, 80)
    const folderName =
      selected[0]?.webkitRelativePath.split('/')[0] || `project-${projects.length + 1}`

    const imported = await Promise.all(
      selected
        .filter(
          (file) =>
            file.size < 300_000 &&
            !file.name.match(/\.(png|jpe?g|gif|webp|woff2?|ttf|eot|ico|zip|pdf|exe|dll)$/i),
        )
        .map(async (file) => {
          const cleanPath = normalizeImportedPath(file.webkitRelativePath || file.name, folderName)
          return {
            name: file.name,
            path: cleanPath || file.name,
            content: await file.text(),
            language: inferLanguage(file.name),
          }
        }),
    )

    if (imported.length) {
      const projectId = `${folderName}-${uid()}`
      const outgoingSession = sessionRef.current
      const freshSession = createFreshSession(folderName)
      const nextProjects = [
        ...projects.map((project) =>
          project.id === activeProjectId ? { ...project, files, session: outgoingSession } : project,
        ),
        { id: projectId, name: folderName, files: imported, session: freshSession },
      ]
      setProjects(nextProjects)
      setActiveProjectId(projectId)
      setFiles(imported)
      setActivePath(imported[0].path)
      setOpenPaths([imported[0].path])
      hydrateSession(freshSession)
      persistWorkspace({
        files: imported,
        projects: nextProjects,
        activeProjectId: projectId,
      })
    }
    event.target.value = ''
  }

  const applyProposedPatch = (patchId: string) => {
    const target = proposedPatches.find((patch) => patch.id === patchId)
    if (!target) return
    const { nextFiles, previousContent } = applyPatchToFiles(
      files,
      target.path,
      target.proposedContent,
    )
    recordRevision({
      path: target.path,
      actor: `${target.agentName}${target.roleCode ? ` (@${target.roleCode})` : ''}`,
      summary: target.summary,
      previousContent,
      nextContent: target.proposedContent,
    })
    void writeFileToDiskIfConnected(target.path, target.proposedContent)
    setFiles(nextFiles)
    setProposedPatches((current) =>
      current.map((patch) =>
        patch.id === patchId ? { ...patch, status: 'applied', previousContent } : patch,
      ),
    )
    openFile(target.path)
    persistWorkspace({ files: nextFiles })
  }

  const rejectProposedPatch = (patchId: string) => {
    setProposedPatches((current) =>
      current.map((patch) => (patch.id === patchId ? { ...patch, status: 'rejected' } : patch)),
    )
  }

  const rollbackProposedPatch = (patchId: string) => {
    const target = proposedPatches.find((patch) => patch.id === patchId)
    if (!target || target.status !== 'applied') return
    const nextFiles = rollbackPatchInFiles(files, target.path, target.previousContent ?? null)
    if (target.previousContent !== null && target.previousContent !== undefined) {
      void writeFileToDiskIfConnected(target.path, target.previousContent)
    }
    setFiles(nextFiles)
    setProposedPatches((current) =>
      current.map((patch) => (patch.id === patchId ? { ...patch, status: 'pending' } : patch)),
    )
    persistWorkspace({ files: nextFiles })
  }

  const handleApprovePlan = (selectedTaskIds: string[]) => {
    if (!pendingApproval) return
    const coordinator =
      agents.find((agent) => agent.id === pendingApproval.coordinatorId) ?? agents[0]
    const approvedTasks = pendingApproval.tasks.filter((task) => selectedTaskIds.includes(task.id))
    const planSnapshot = pendingApproval
    setPendingApproval(null)
    if (!coordinator || approvedTasks.length === 0) return
    void streamOrchestration(coordinator, planSnapshot.instruction, {
      approvedTasks,
      planningContext: planSnapshot.planningContext,
      planSummary: planSnapshot.planSummary,
    })
  }

  const saveAgent = (details: {
    id?: string
    name: string
    role: string
    roleId: VinceZoneRoleId
    soul: string
    mission: string
    memory: string
    providerId: string
    model: string
    view: AgentView
  }) => {
    if (details.id) {
      setAgents((current) =>
        current.map((agent) =>
          agent.id === details.id
            ? {
                ...agent,
                name: details.name,
                role: details.role,
                roleId: details.roleId,
                soul: details.soul,
                mission: details.mission,
                memory: details.memory,
                providerId: details.providerId,
                model: details.model,
              }
            : agent,
        ),
      )
      setAgentViews((current) => ({ ...current, [details.id!]: details.view }))
      setEditingAgent(null)
      setAgentCreatorOpen(false)
      return
    }

    const count = agents.length + 1
    const id = uid()
    const roleId = details.roleId || inferRoleId(`${details.name} ${details.role}`)
    setAgents((current) => [
      ...current,
      {
        id,
        name: details.name || `Specialist ${count}`,
        role: details.role || 'Custom coding agent',
        roleId,
        soul: details.soul,
        mission: details.mission,
        memory: details.memory,
        providerId: details.providerId || savedProvider.id,
        model: details.model || savedProvider.model || 'Select model',
        accent: ['#f5f5f5', '#d4d4d4', '#a3a3a3', '#e5e5e5'][count % 4],
        status: 'idle',
        messages: [
          {
            id: uid(),
            role: 'assistant',
            text: `Agent ready (@${roleId.toUpperCase()} · ${details.model || savedProvider.model}). Mission: ${details.mission || details.role}`,
          },
        ],
      },
    ])
    setAgentViews((current) => ({ ...current, [id]: details.view }))
    setRightChatAgentId(id)
    setEditingAgent(null)
    setAgentCreatorOpen(false)
  }

  const duplicateAgent = (source: Agent) => {
    const id = uid()
    setAgents((current) => [
      ...current,
      {
        ...source,
        id,
        name: `${source.name} copy`,
        status: 'idle',
        composingPrompt: undefined,
        messages: source.messages.map((message) => ({ ...message, id: uid() })),
      },
    ])
    setAgentViews((current) => ({ ...current, [id]: current[source.id] ?? 'chat' }))
  }

  const createNewFile = async () => {
    const fileName = window.prompt('New file path (relative to workspace):', 'src/untitled.ts')
    const clean = fileName?.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!clean) return
    if (files.some((item) => item.path === clean)) {
      openFile(clean)
      return
    }
    const name = clean.split('/').pop() || clean
    const created: WorkspaceFile = {
      name,
      path: clean,
      content: '',
      language: inferLanguage(name),
      dirty: false,
    }
    await writeFileToDiskIfConnected(clean, '')
    setFiles((current) => [...current, created])
    openFile(clean)
  }

  const createNewFolder = async () => {
    const folderName = window.prompt('New folder path (relative to workspace):', 'src/new-module')
    const clean = folderName?.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!clean) return
    if (activeProject?.rootPath) {
      await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-folder',
          root: activeProject.rootPath,
          path: clean,
        }),
      }).catch(() => {})
      await loadLocalDirectory(activeProject.rootPath, true)
    }
  }

  const renameWorkspaceFile = async (oldPath: string) => {
    const nextInput = window.prompt('Rename file to (relative path):', oldPath)
    const nextPath = nextInput?.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (!nextPath || nextPath === oldPath) return
    if (activeProject?.rootPath) {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename',
          root: activeProject.rootPath,
          path: oldPath,
          newPath: nextPath,
        }),
      }).catch(() => null)
      if (response && !response.ok) return
    }
    const nextName = nextPath.split('/').pop() || nextPath
    setFiles((current) =>
      current.map((file) =>
        file.path === oldPath
          ? { ...file, path: nextPath, name: nextName, language: inferLanguage(nextName) }
          : file,
      ),
    )
    setOpenPaths((current) => current.map((item) => (item === oldPath ? nextPath : item)))
    if (activePath === oldPath) setActivePath(nextPath)
  }

  const deleteWorkspaceFile = async (targetPath: string) => {
    if (!window.confirm(`Delete "${targetPath}" from workspace${activeProject?.rootPath ? ' and disk' : ''}?`)) {
      return
    }
    if (activeProject?.rootPath) {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          root: activeProject.rootPath,
          path: targetPath,
        }),
      }).catch(() => null)
      if (response && !response.ok) return
    }
    setFiles((current) => current.filter((file) => file.path !== targetPath))
    setOpenPaths((current) => current.filter((item) => item !== targetPath))
    if (activePath === targetPath) {
      const remaining = openPaths.filter((item) => item !== targetPath)
      setActivePath(remaining[remaining.length - 1] ?? '')
    }
  }

  const handleAcceptInlineEdit = useCallback(
    (targetPath: string, nextContent: string, summary: string) => {
      const currentFiles = filesRef.current
      const { nextFiles, previousContent } = applyPatchToFiles(currentFiles, targetPath, nextContent)
      recordRevision({
        path: targetPath,
        actor: 'Inline AI (Ctrl+K)',
        summary,
        previousContent,
        nextContent,
      })
      void writeFileToDiskIfConnected(targetPath, nextContent)
      setFiles(nextFiles)
      filesRef.current = nextFiles
      persistWorkspace({ files: nextFiles })
    },
    [persistWorkspace, recordRevision, writeFileToDiskIfConnected],
  )

  const updateFileByPath = useCallback(
    (targetPath: string, content: string) => {
      setFiles((current) =>
        current.map((file) => (file.path === targetPath ? { ...file, content, dirty: true } : file)),
      )
      if (appSettings.autoSave) {
        void writeFileToDiskIfConnected(targetPath, content)
      }
    },
    [appSettings.autoSave, writeFileToDiskIfConnected],
  )

  const replaceInWorkspaceFiles = useCallback(
    (
      query: string,
      replacement: string,
      options: { caseSensitive: boolean; regex: boolean },
    ) => {
      if (!query.trim()) return { filesUpdated: 0, occurrences: 0 }
      let matcher: RegExp
      try {
        const flags = options.caseSensitive ? 'g' : 'gi'
        matcher = options.regex
          ? new RegExp(query, flags)
          : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
      } catch {
        return { filesUpdated: 0, occurrences: 0 }
      }

      let filesUpdated = 0
      let occurrences = 0
      const updatedFiles = filesRef.current.map((file) => {
        const hits = file.content.match(matcher)
        if (!hits || hits.length === 0) return file
        const nextContent = file.content.replace(matcher, replacement)
        if (nextContent === file.content) return file
        filesUpdated += 1
        occurrences += hits.length
        recordRevision({
          path: file.path,
          actor: 'Replace All',
          summary: `Replace "${query.slice(0, 30)}" -> "${replacement.slice(0, 30)}" (${hits.length}x)`,
          previousContent: file.content,
          nextContent,
        })
        void writeFileToDiskIfConnected(file.path, nextContent)
        return { ...file, content: nextContent, dirty: false }
      })

      if (filesUpdated > 0) {
        setFiles(updatedFiles)
        filesRef.current = updatedFiles
        persistWorkspace({ files: updatedFiles })
      }
      return { filesUpdated, occurrences }
    },
    [persistWorkspace, recordRevision, writeFileToDiskIfConnected],
  )

  const handleChangeAgentModel = useCallback(
    (agentId: string, providerId: string, model: string) => {
      setAgents((current) =>
        current.map((item) =>
          item.id === agentId ? { ...item, providerId, model } : item,
        ),
      )
    },
    [],
  )

  const handleSendSelectionToChat = useCallback(
    (payload: { path: string; startLine: number; endLine: number; snippet: string }) => {
      const targetId = rightChatAgentId || findPmAgentId(agents)
      if (!targetId) return
      setWorkspaceMode('ide')
      setRightPanelMode('chat')
      const block = `@${payload.path}:${payload.startLine}-${payload.endLine}\n\`\`\`\n${payload.snippet}\n\`\`\`\n`
      setDrafts((current) => ({
        ...current,
        [targetId]: `${block}${current[targetId] ? `\n${current[targetId]}` : ''}`,
      }))
      setChatFocusSeq((n) => n + 1)
    },
    [agents, rightChatAgentId],
  )

  const toggleZenMode = useCallback(() => {
    const anyOpen = explorerOpen || rightPanelMode !== null || terminalOpen
    if (anyOpen) {
      setExplorerOpen(false)
      setRightPanelMode(null)
      setTerminalOpen(false)
    } else {
      setExplorerOpen(true)
      setRightPanelMode('chat')
    }
  }, [explorerOpen, rightPanelMode, terminalOpen])

  const paletteActions: PaletteAction[] = useMemo(
    () => [
      {
        id: 'save-all',
        category: 'File',
        label: 'Save All Files',
        shortcut: 'Ctrl+S',
        run: () => saveAllFiles(),
      },
      {
        id: 'new-file',
        category: 'File',
        label: 'New File',
        shortcut: 'Ctrl+N',
        run: () => void createNewFile(),
      },
      {
        id: 'format-doc',
        category: 'Editor',
        label: 'Format Document',
        shortcut: 'Shift+Alt+F',
        run: () => setFormatSeq((n) => n + 1),
      },
      {
        id: 'split-editor',
        category: 'Editor',
        label: splitPath ? 'Close Split Editor' : 'Split Editor Right',
        shortcut: 'Ctrl+\\',
        run: () =>
          setSplitPath((prev) =>
            prev ? null : filesRef.current.find((f) => f.path !== activePath)?.path ?? activePath ?? null,
          ),
      },
      {
        id: 'toggle-wrap',
        category: 'Editor',
        label: `Toggle Word Wrap (${appSettings.editorWordWrap ? 'ON' : 'OFF'})`,
        shortcut: 'Alt+Z',
        run: () =>
          setAppSettings((current) => ({ ...current, editorWordWrap: !current.editorWordWrap })),
      },
      {
        id: 'toggle-minimap',
        category: 'Editor',
        label: `Toggle Minimap (${appSettings.editorMinimap ? 'VISIBLE' : 'HIDDEN'})`,
        run: () =>
          setAppSettings((current) => ({ ...current, editorMinimap: !current.editorMinimap })),
      },
      {
        id: 'toggle-sidebar',
        category: 'View',
        label: 'Toggle Explorer Sidebar',
        shortcut: 'Ctrl+B',
        run: () => {
          setWorkspaceMode('ide')
          setExplorerOpen((prev) => !prev)
        },
      },
      {
        id: 'toggle-terminal',
        category: 'View',
        label: 'Toggle Bottom Terminal',
        shortcut: 'Ctrl+J',
        run: () => {
          setWorkspaceMode('ide')
          setTerminalOpen((prev) => !prev)
        },
      },
      {
        id: 'toggle-chat',
        category: 'AI',
        label: 'Toggle Right AI Agent Chat',
        shortcut: 'Ctrl+L',
        run: () => {
          setWorkspaceMode('ide')
          setRightPanelMode((prev) => (prev === 'chat' ? null : 'chat'))
        },
      },
      {
        id: 'toggle-phone-demo',
        category: 'View',
        label: 'Toggle Right Phone Demo / Android Emulator',
        run: () => {
          setWorkspaceMode('ide')
          setRightPanelMode((prev) => (prev === 'phone' ? null : 'phone'))
        },
      },
      {
        id: 'toggle-zen',
        category: 'View',
        label: 'Toggle Zen Focus Mode (Full-Screen Code)',
        run: toggleZenMode,
      },
      {
        id: 'open-git',
        category: 'Git',
        label: 'Open Source Control (Git GUI)',
        run: () => {
          setWorkspaceMode('ide')
          setSidePanel('git')
          setExplorerOpen(true)
        },
      },
      {
        id: 'open-search',
        category: 'Search',
        label: 'Find & Replace in Workspace',
        shortcut: 'Ctrl+Shift+F',
        run: () => {
          setWorkspaceMode('ide')
          setSidePanel('search')
          setExplorerOpen(true)
        },
      },
      {
        id: 'open-agents',
        category: 'AI',
        label: 'Open Multi-Agent Control Center',
        run: () => setWorkspaceMode('agents'),
      },
      {
        id: 'run-typecheck',
        category: 'Run',
        label: 'Run TypeScript Check (pnpm typecheck)',
        run: () => void runTerminalCommand('pnpm typecheck', { openTerminal: true }),
      },
      {
        id: 'run-tests',
        category: 'Run',
        label: 'Run Test Suite (pnpm test)',
        run: () => void runTerminalCommand('pnpm test', { openTerminal: true }),
      },
      {
        id: 'open-settings',
        category: 'Preferences',
        label: 'Open VinceZone Settings',
        shortcut: 'Ctrl+,',
        run: () => setSettingsOpen(true),
      },
    ],
    [
      activePath,
      appSettings.editorMinimap,
      appSettings.editorWordWrap,
      runTerminalCommand,
      splitPath,
      toggleZenMode,
    ],
  )

  const saveAllFiles = () => {
    const dirtyList = files.filter((file) => file.dirty)
    for (const file of dirtyList) {
      const previous = diskSnapshotRef.current.get(file.path) ?? null
      recordRevision({
        path: file.path,
        actor: 'User',
        summary: 'Save All',
        previousContent: previous,
        nextContent: file.content,
      })
      void writeFileToDiskIfConnected(file.path, file.content)
    }
    setFiles((current) => {
      const next = current.map((file) => ({ ...file, dirty: false }))
      persistWorkspace({ files: next })
      return next
    })
  }

  const cycleEditorTab = (direction: 1 | -1) => {
    if (openPaths.length <= 1) return
    const currentIndex = openPaths.indexOf(activePath)
    const nextIndex = (currentIndex + direction + openPaths.length) % openPaths.length
    setActivePath(openPaths[nextIndex])
  }

  const handleRunProject = useCallback(async () => {
    setWorkspaceMode('ide')
    const currentFile = filesRef.current.find((f) => f.path === activePath)
    const lowerPath = currentFile?.path.toLowerCase() || ''

    // HTML file -> immediately preview live on the right Phone Demo panel
    if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
      setRightPanelMode('phone')
      setRunState('success')
      return
    }

    // Android Gradle project -> open Phone Demo panel + open Terminal
    const hasGradle = filesRef.current.some(
      (f) => f.path.toLowerCase().endsWith('gradlew') || f.path.toLowerCase().endsWith('gradlew.bat'),
    )
    if (hasGradle && (lowerPath.endsWith('.kt') || lowerPath.endsWith('.java'))) {
      setRightPanelMode('phone')
    }

    // Runnable standalone script file
    if (lowerPath.endsWith('.py')) {
      await runTerminalCommand(`python "${currentFile!.path}"`, { openTerminal: true })
      return
    }
    if (
      (lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.cjs')) &&
      !lowerPath.includes('next.config')
    ) {
      await runTerminalCommand(`node "${currentFile!.path}"`, { openTerminal: true })
      return
    }

    // Default project run: open Terminal & run test suite / verification
    const hasPnpmLock = filesRef.current.some((f) => f.path === 'pnpm-lock.yaml')
    await runTerminalCommand(hasPnpmLock ? 'pnpm test' : 'npm test', { openTerminal: true })
  }, [activePath, runTerminalCommand])

  const debugProject = useCallback(async () => {
    setWorkspaceMode('ide')
    setTerminalOpen(true)
    setBottomPanel('debug')
    const currentFile = filesRef.current.find((f) => f.path === activePath)
    const lowerPath = currentFile?.path.toLowerCase() || ''
    setDebugLine(Math.max(1, cursor.line || 1))
    setDebugState('running')

    let cmd = 'pnpm exec tsc --noEmit'
    if (lowerPath.endsWith('.py')) {
      cmd = `python -m py_compile "${currentFile!.path}"`
    } else if (lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.cjs')) {
      cmd = `node --check "${currentFile!.path}"`
    }

    try {
      const response = await fetch('/api/runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-silent',
          command: cmd,
          cwd: activeProject?.rootPath,
        }),
      })
      const data = (await response.json()) as {
        ok?: boolean
        exitCode?: number
        cwd?: string
        durationMs?: number
        stdout?: string
        stderr?: string
        error?: string
      }
      const combined = `${data.stdout || ''}\n${data.stderr || data.error || ''}`
      const lineMatch = combined.match(/\((\d+),\d+\)|:(\d+):\d+|line (\d+)/i)
      const detectedLine = Number(lineMatch?.[1] || lineMatch?.[2] || lineMatch?.[3] || 0)
      if (detectedLine > 0) setDebugLine(detectedLine)

      setTerminalEntries((current) => [
        ...current.slice(-24),
        {
          id: uid(),
          command: `[Debug] ${cmd}`,
          cwd: data.cwd || activeProject?.rootPath || 'workspace',
          stdout:
            data.stdout ||
            (data.ok ? 'Debug check passed with 0 errors. Paused at active frame.' : ''),
          stderr: data.stderr || data.error || '',
          exitCode: data.exitCode ?? (response.ok ? 0 : 1),
          durationMs: data.durationMs ?? 0,
          timestamp: new Date().toISOString(),
        },
      ])
      setDebugState('paused')
    } catch {
      setDebugState('paused')
    }
  }, [activePath, activeProject?.rootPath, cursor.line])

  const dirtyCount = files.filter((file) => file.dirty).length
  const pendingPatchCount = proposedPatches.filter((patch) => patch.status === 'pending').length
  const activeAgentCount = agents.filter(
    (agent) => agent.status === 'running' || agent.status === 'reviewing',
  ).length

  return (
    <main className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[#1e1e1e] text-[#cccccc]">
      <WorkspaceHeader
        projects={projects}
        activeProjectId={activeProjectId}
        activeRootPath={activeProject?.rootPath}
        activeFilePath={activeFile?.path}
        workspaceMode={workspaceMode}
        explorerOpen={explorerOpen}
        rightChatOpen={rightChatOpen}
        terminalOpen={terminalOpen}
        terminalMaximized={terminalMaximized}
        autoSave={appSettings.autoSave}
        compactMode={appSettings.compactMode}
        fileInputRef={fileInputRef}
        runState={runState}
        debugState={debugState}
        pendingPatchCount={pendingPatchCount}
        latestRevisionId={revisions[revisions.length - 1]?.id}
        isDesktop={isDesktop}
        onSwitchProject={switchProject}
        onCloseProject={closeProject}
        onImportFolder={importFolder}
        onOpenLocalDirectory={() => void handleOpenLocalDirectory()}
        onNewFile={() => void createNewFile()}
        onSaveFile={saveFile}
        onSaveAll={saveAllFiles}
        onCloseActiveTab={() => {
          if (activePath) closeTab(activePath)
        }}
        onCopyActivePath={() => {
          if (activeFile?.path && navigator.clipboard) {
            void navigator.clipboard.writeText(activeFile.path)
          }
        }}
        onUndoLatestRevision={() => {
          const latest = revisions[revisions.length - 1]
          if (latest) restoreRevisionById(latest.id)
        }}
        onToggleAutoSave={() =>
          setAppSettings((current) => ({ ...current, autoSave: !current.autoSave }))
        }
        onToggleCompact={() =>
          setAppSettings((current) => ({ ...current, compactMode: !current.compactMode }))
        }
        onToggleExplorer={() => {
          setWorkspaceMode('ide')
          setExplorerOpen((prev) => !prev)
        }}
        onToggleRightChat={() => {
          setWorkspaceMode('ide')
          setRightPanelMode((prev) => (prev === 'chat' ? null : 'chat'))
        }}
        onToggleTerminal={() => {
          setWorkspaceMode('ide')
          setTerminalOpen((prev) => !prev)
        }}
        onToggleTerminalMaximized={() => {
          setWorkspaceMode('ide')
          setTerminalOpen(true)
          setTerminalMaximized((prev) => !prev)
        }}
        onClearTerminal={() => setTerminalEntries([])}
        onToggleAgents={() =>
          setWorkspaceMode((prev) => (prev === 'agents' ? 'ide' : 'agents'))
        }
        onSelectSidePanel={(panel) => {
          setWorkspaceMode('ide')
          setSidePanel(panel)
          setExplorerOpen(true)
        }}
        onSelectMode={setWorkspaceMode}
        onCycleTab={cycleEditorTab}
        onRun={() => void handleRunProject()}
        onRunCommand={(cmd) => void runTerminalCommand(cmd, { openTerminal: true })}
        onDebug={() => void debugProject()}
        onStopDebug={() => setDebugState('idle')}
        onOpenSearch={() => {
          setWorkspaceMode('ide')
          setSidePanel('search')
          setExplorerOpen(true)
        }}
        onOpenQuickOpen={() => setPaletteMode('files')}
        onOpenDiff={() => setDiffModalState({ open: true })}
        onOpenSettings={() => setSettingsOpen(true)}
        onPreviewMail={() => {
          setWorkspaceMode('agents')
          window.setTimeout(() => {
            previewMailExchange(
              'focus1',
              agents.map((agent) => agent.id),
            )
          }, 220)
        }}
      />

      <div className="flex min-h-0 flex-1">
        <ActivityBar
          workspaceMode={workspaceMode}
          sidePanel={sidePanel}
          explorerOpen={explorerOpen}
          dirtyCount={dirtyCount}
          revisionCount={revisions.length}
          memoryCount={memoryNotes.length}
          activeAgentCount={activeAgentCount}
          onSelectSidePanel={(panel) => {
            setWorkspaceMode('ide')
            if (panel === sidePanel && workspaceMode === 'ide') {
              setExplorerOpen((prev) => !prev)
            } else {
              setSidePanel(panel)
              setExplorerOpen(true)
            }
          }}
          onSelectMode={setWorkspaceMode}
          onToggleTerminal={() => {
            setWorkspaceMode('ide')
            setTerminalOpen((current) => !current)
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {workspaceMode === 'ide' ? (
          <>
            {explorerOpen && (
              <>
                <ExplorerSidebar
                  sidePanel={sidePanel}
                  width={explorerWidth}
                  projectName={activeProject?.name ?? 'VinceZone Studio'}
                  rootPath={activeProject?.rootPath}
                  files={files}
                  activePath={activePath}
                  agentTasks={agentTasks}
                  agents={agents}
                  revisions={revisions}
                  memoryNotes={memoryNotes}
                  collapsedGroups={collapsedGroups}
                  searchQuery={searchQuery}
                  compactMode={appSettings.compactMode}
                  onSearchQueryChange={setSearchQuery}
                  onReplaceInFiles={replaceInWorkspaceFiles}
                  onToggleGroup={(key) =>
                    setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }))
                  }
                  onOpenFile={openFile}
                  onOpenLocalDirectory={() => void handleOpenLocalDirectory()}
                  onCreateFile={() => void createNewFile()}
                  onCreateFolder={() => void createNewFolder()}
                  onRenameFile={(path) => void renameWorkspaceFile(path)}
                  onDeleteFile={(path) => void deleteWorkspaceFile(path)}
                  onRestoreRevision={(revId) => {
                    restoreRevisionById(revId)
                  }}
                  onAddMemoryNote={addMemoryNote}
                  onDeleteMemoryNote={deleteMemoryNote}
                  onCollapse={() => setExplorerOpen(false)}
                  onRefresh={() => {
                    if (activeProject?.rootPath) void loadLocalDirectory(activeProject.rootPath, true)
                    else setFiles((current) => [...current])
                  }}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenAgents={() => setWorkspaceMode('agents')}
                  onOpenDiff={() => setDiffModalState({ open: true })}
                />
                <div
                  data-resize="explorer"
                  onMouseDown={(event) =>
                    startDragResize('x', event.clientX, explorerWidth, 180, 460, false, setExplorerWidth)
                  }
                  className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#525252]"
                  title="Drag to resize Explorer sidebar"
                />
              </>
            )}

            <section className="relative flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
              <EditorPane
                projectName={activeProject?.name ?? 'VinceZone Studio'}
                files={files}
                openPaths={openPaths}
                activePath={activePath}
                activeFile={activeFile}
                splitPath={splitPath}
                explorerOpen={explorerOpen}
                aiActivity={aiActivity}
                editPulse={editPulse}
                fontSize={appSettings.editorFontSize}
                wordWrap={appSettings.editorWordWrap}
                minimap={appSettings.editorMinimap}
                revealRequest={revealRequest}
                formatSeq={formatSeq}
                provider={savedProvider}
                onOpenExplorer={() => setExplorerOpen(true)}
                onSelectTab={setActivePath}
                onCloseTab={closeTab}
                onCloseOtherTabs={(keepPath) => {
                  setOpenPaths([keepPath])
                  setActivePath(keepPath)
                }}
                onSetSplitPath={setSplitPath}
                onUpdateFile={updateFile}
                onUpdateFileByPath={updateFileByPath}
                onSaveFile={saveFile}
                onAcceptInlineEdit={handleAcceptInlineEdit}
                onSendSelectionToChat={handleSendSelectionToChat}
                onDiagnosticsChange={setDiagnostics}
                onCursorChange={setCursor}
              />

              {terminalOpen && !terminalMaximized && (
                <div
                  data-resize="terminal"
                  onMouseDown={(event) =>
                    startDragResize('y', event.clientY, terminalHeight, 120, 480, true, setTerminalHeight)
                  }
                  className="h-1 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-[#525252]"
                  title="Drag to resize Bottom Panel"
                />
              )}

              <BottomPanel
                open={terminalOpen}
                maximized={terminalMaximized}
                height={terminalHeight}
                activeTab={bottomPanel}
                projectName={activeProject?.name ?? 'VinceZone Studio'}
                rootPath={activeProject?.rootPath}
                files={files}
                activeFile={activeFile}
                diagnostics={diagnostics}
                runState={runState}
                debugState={debugState}
                debugLine={debugLine}
                agentCount={agents.length}
                communicationEvents={communicationEvents}
                bridgeMessages={bridgeMessages}
                terminalEntries={terminalEntries}
                terminalRunning={terminalRunning}
                onRunTerminalCommand={(cmd) => void runTerminalCommand(cmd)}
                onClearTerminal={() => setTerminalEntries([])}
                onSetOpen={setTerminalOpen}
                onToggleMaximized={() => setTerminalMaximized((current) => !current)}
                onSelectTab={setBottomPanel}
                onOpenFile={openFile}
                onStartDebug={() => void debugProject()}
                onContinueDebug={() => {
                  setDebugState('running')
                  window.setTimeout(() => {
                    setDebugLine((line) => line + 2)
                    setDebugState('paused')
                  }, 700)
                }}
                onStepOverDebug={() => setDebugLine((line) => line + 1)}
                onStopDebug={() => setDebugState('idle')}
              />
            </section>

            {rightPanelMode !== null && (
              <>
                <div
                  data-resize="chat"
                  onMouseDown={(event) =>
                    startDragResize(
                      'x',
                      event.clientX,
                      rightChatWidth,
                      260,
                      560,
                      true,
                      setRightChatWidth,
                    )
                  }
                  className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#525252]"
                  title="Drag to resize right side panel"
                />
                {rightPanelMode === 'chat' ? (
                  <RightAiChatPanel
                    agents={agents}
                    selectedAgentId={rightChatAgentId}
                    drafts={drafts}
                    files={files}
                    activeFilePath={activeFile?.path}
                    skills={availableSkills}
                    combos={availableCombos}
                    mcpServers={appSettings.mcpServers}
                    plugins={appSettings.plugins}
                    providers={providers}
                    width={rightChatWidth}
                    bridgeEnabled={bridgeEnabled}
                    bridgeMessages={bridgeMessages}
                    focusSeq={chatFocusSeq}
                    onToggleBridge={() => setBridgeEnabled((prev) => !prev)}
                    onRelayToAgent={(fromId, toId, prompt) => delegateAgent(fromId, toId, prompt)}
                    onChangeAgentModel={handleChangeAgentModel}
                    onSelectAgent={setRightChatAgentId}
                    onDraft={(id, value) => setDrafts((current) => ({ ...current, [id]: value }))}
                    onSend={(agent) => void sendMessage(agent)}
                    onPause={pauseAgent}
                    onOpenFullAgents={() => setWorkspaceMode('agents')}
                    onClose={() => setRightPanelMode(null)}
                  />
                ) : (
                  <AndroidEmulator
                    compact
                    width={rightChatWidth}
                    projectName={activeProject?.name ?? 'VinceZone Studio'}
                    rootPath={activeProject?.rootPath}
                    files={files}
                    activeFile={activeFile}
                    onClose={() => setRightPanelMode(null)}
                  />
                )}
              </>
            )}

            {/* Right-edge Quick Switcher Rail: Robot (AI Agent Chat @PM) & Phone (Live Phone Demo / Android) */}
            <aside
              aria-label="Right Panel Switcher"
              className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-[#2b2b2b] bg-[#181818] py-2"
            >
              <button
                type="button"
                onClick={() => {
                  if (rightPanelMode === 'chat') {
                    setRightPanelMode(null)
                  } else {
                    if (!agents.some((a) => a.id === rightChatAgentId)) {
                      setRightChatAgentId(findPmAgentId(agents))
                    }
                    setRightPanelMode('chat')
                  }
                }}
                title="AI Agent Chat (mặc định @PM)"
                className={`relative grid size-8 place-items-center rounded transition ${
                  rightPanelMode === 'chat'
                    ? 'bg-[#2a2a2a] text-white'
                    : 'text-[#858585] hover:bg-[#222222] hover:text-white'
                }`}
              >
                {rightPanelMode === 'chat' && (
                  <span className="absolute right-0 top-1 bottom-1 w-[2px] rounded-full bg-[#e5e5e5]" />
                )}
                <Bot size={16} />
              </button>

              <button
                type="button"
                onClick={() =>
                  setRightPanelMode((prev) => (prev === 'phone' ? null : 'phone'))
                }
                title="Demo giả lập điện thoại / Android trực tiếp"
                className={`relative grid size-8 place-items-center rounded transition ${
                  rightPanelMode === 'phone'
                    ? 'bg-[#2a2a2a] text-white'
                    : 'text-[#858585] hover:bg-[#222222] hover:text-white'
                }`}
              >
                {rightPanelMode === 'phone' && (
                  <span className="absolute right-0 top-1 bottom-1 w-[2px] rounded-full bg-[#e5e5e5]" />
                )}
                <Smartphone size={16} />
              </button>
            </aside>
          </>
        ) : workspaceMode === 'agents' ? (
          <AgentWorkspace
            agents={agents}
            views={agentViews}
            drafts={drafts}
            files={files}
            tasks={agentTasks}
            communicationEvents={communicationEvents}
            proposedPatches={proposedPatches}
            pendingApproval={pendingApproval}
            skills={availableSkills}
            combos={availableCombos}
            mcpServers={appSettings.mcpServers}
            plugins={appSettings.plugins}
            providers={providers}
            onCreate={() => {
              setEditingAgent(null)
              setAgentCreatorOpen(true)
            }}
            onEditAgent={(agent) => {
              setEditingAgent(agent)
              setAgentCreatorOpen(true)
            }}
            onChangeAgentModel={handleChangeAgentModel}
            onView={(id, view) => setAgentViews((current) => ({ ...current, [id]: view }))}
            onDraft={(id, value) => setDrafts((current) => ({ ...current, [id]: value }))}
            onSend={sendMessage}
            onRemove={(id) => setAgents((current) => current.filter((agent) => agent.id !== id))}
            onDuplicate={duplicateAgent}
            onDelegate={delegateAgent}
            onPause={pauseAgent}
            onDiff={(patchId) => setDiffModalState({ open: true, patchId })}
            onApprovePlan={handleApprovePlan}
            onCancelApproval={() => setPendingApproval(null)}
            onPreviewMailExchange={previewMailExchange}
          />
        ) : workspaceMode === 'android' ? (
          <AndroidEmulator
            projectName={activeProject?.name ?? 'VinceZone Studio'}
            rootPath={activeProject?.rootPath}
            files={files}
            activeFile={activeFile}
          />
        ) : workspaceMode === 'web' ? (
          <WebPreview
            projectName={activeProject?.name ?? 'VinceZone Studio'}
            rootPath={activeProject?.rootPath}
          />
        ) : (
          <CraftStudio
            projectName={activeProject?.name ?? 'VinceZone Studio'}
            onSendToAgents={(summaryTitle, evidenceText, prompt) => {
              addMemoryNote(summaryTitle, evidenceText)
              const pmId = agents.find((a) => a.roleId === 'pm')?.id ?? agents[0]?.id
              if (pmId) {
                setDrafts((current) => ({ ...current, [pmId]: prompt }))
              }
              setWorkspaceMode('agents')
            }}
          />
        )}
      </div>

      <StatusBar
        activeFile={activeFile}
        cursor={cursor}
        dirtyCount={dirtyCount}
        diagnostics={diagnostics}
        pendingPatchCount={pendingPatchCount}
        latestRevisionId={revisions[revisions.length - 1]?.id}
        debugActive={debugState === 'paused' || debugState === 'running'}
        isDesktop={isDesktop}
        bridgeCount={bridgeMessages.length}
        onOpenProblems={() => {
          setWorkspaceMode('ide')
          setTerminalOpen(true)
          setBottomPanel('problems')
        }}
        onOpenDiff={() => setDiffModalState({ open: true })}
        onOpenRevisions={() => {
          setWorkspaceMode('ide')
          setSidePanel('revisions')
          setExplorerOpen(true)
        }}
      />

      {paletteMode && (
        <CommandPaletteModal
          mode={paletteMode}
          files={files}
          actions={paletteActions}
          onOpenFile={openFile}
          onClose={() => setPaletteMode(null)}
        />
      )}

      {settingsOpen && (
        <ProviderSettingsModal
          initialProvider={savedProvider}
          initialProviders={providers}
          initialSettings={appSettings}
          usageRecords={usageRecords}
          memoryNotes={memoryNotes}
          rootPath={activeProject?.rootPath}
          onResetUsage={() => setUsageRecords([])}
          onAddMemoryNote={addMemoryNote}
          onDeleteMemoryNote={deleteMemoryNote}
          onClearMemoryNotes={() => setMemoryNotes([])}
          onClose={() => setSettingsOpen(false)}
          onSave={({ provider, providers: nextProviders, settings: nextSettings }) => {
            setSavedProvider(provider)
            setProviders(nextProviders)
            setAppSettings(nextSettings)
            persistWorkspace({
              provider,
              providers: nextProviders,
              settings: nextSettings,
            })
            setSettingsOpen(false)
          }}
        />
      )}

      {agentCreatorOpen && (
        <AgentCreatorModal
          providers={providers}
          defaultProviderId={savedProvider.id}
          defaultModel={savedProvider.model}
          initialAgent={editingAgent}
          initialView={editingAgent ? (agentViews[editingAgent.id] ?? 'chat') : 'chat'}
          onClose={() => {
            setEditingAgent(null)
            setAgentCreatorOpen(false)
          }}
          onSave={saveAgent}
        />
      )}

      {diffModalState.open && (
        <DiffReviewModal
          patches={proposedPatches}
          files={files}
          initialPatchId={diffModalState.patchId}
          onApply={applyProposedPatch}
          onReject={rejectProposedPatch}
          onRollback={rollbackProposedPatch}
          onClose={() => setDiffModalState({ open: false })}
        />
      )}
    </main>
  )
}
