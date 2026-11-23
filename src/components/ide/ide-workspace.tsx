'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOrchestration } from '@/hooks/use-orchestration'
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
import { inferRoleId, type VinceZoneRoleId } from '@/lib/vincezone-protocol'
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
import { DiffReviewModal } from './modals/diff-review-modal'
import { ProviderSettingsModal } from './modals/provider-settings-modal'
import { RightAiChatPanel } from './right-ai-chat-panel'
import { StatusBar } from './status-bar'
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
  const [rightChatOpen, setRightChatOpen] = useState(true)
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
  const [isDesktop, setIsDesktop] = useState(false)
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
    setAgents(session.agents.length ? session.agents : createSeedAgents())
    setAgentTasks(session.agentTasks ?? [])
    setCommunicationEvents(session.communicationEvents ?? [])
    setProposedPatches(session.proposedPatches ?? [])
    setRevisions(session.revisions ?? [])
    setMemoryNotes(session.memoryNotes ?? defaultMemoryNotes)
    setPendingApproval(null)
    setRightChatAgentId(session.agents[0]?.id ?? 'pm')
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
          setProjects(parsed.projects)
          if (parsed.activeProjectId) {
            setActiveProjectId(parsed.activeProjectId)
          }
        }
        if (parsed.agents?.length) {
          restoredAgents = true
          const normalized = parsed.agents.map((agent) => ({
            ...agent,
            roleId: agent.roleId ?? inferRoleId(`${agent.id} ${agent.role}`),
            status:
              agent.status === 'running' || agent.status === 'reviewing'
                ? ('paused' as const)
                : agent.status,
            currentTask: undefined,
            composingPrompt: undefined,
          }))
          setAgents(normalized)
          setRightChatAgentId(normalized[0]?.id ?? 'pm')
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
  }, [loadLocalDirectory])

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
    async (filePath: string, content: string) => {
      if (!activeProject?.rootPath) return
      try {
        await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'write',
            root: activeProject.rootPath,
            path: filePath,
            content,
          }),
        })
        diskSnapshotRef.current.set(filePath, content)
      } catch {
        // Keep browser state even if local disk write fails.
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

  // Global keyboard shortcuts + Electron native menu listener
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setWorkspaceMode('ide')
        setSidePanel('search')
        setExplorerOpen(true)
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
  }, [loadLocalDirectory])

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
      void writeFileToDiskIfConnected(targetPath, content)
      setActivePath(targetPath)
      setOpenPaths((current) => (current.includes(targetPath) ? current : [...current, targetPath]))
      persistWorkspace({ files: nextFiles })
      return { applied: true, revisionId: nextRev.id }
    },
    [persistWorkspace, writeFileToDiskIfConnected],
  )

  const { sendMessage, streamOrchestration, delegateAgent, pauseAgent, previewMailExchange } =
    useOrchestration({
      agents,
      files,
      activeFile,
      projectName: activeProject?.name ?? 'VinceZone Studio',
      memoryNotes,
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

  const createNewFile = () => {
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
      dirty: true,
    }
    setFiles((current) => [...current, created])
    openFile(clean)
  }

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

  const debugProject = () => {
    setWorkspaceMode('ide')
    setTerminalOpen(true)
    setBottomPanel('debug')
    setDebugLine(5)
    setDebugState('starting')
    window.setTimeout(() => setDebugState('paused'), 700)
  }

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
        onNewFile={createNewFile}
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
          setRightChatOpen((prev) => !prev)
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
        onRun={() => void runTerminalCommand('pnpm test')}
        onRunCommand={(cmd) => void runTerminalCommand(cmd)}
        onDebug={debugProject}
        onStopDebug={() => setDebugState('idle')}
        onOpenSearch={() => {
          setWorkspaceMode('ide')
          setSidePanel('search')
          setExplorerOpen(true)
        }}
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
              <ExplorerSidebar
                sidePanel={sidePanel}
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
                onToggleGroup={(key) =>
                  setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }))
                }
                onOpenFile={openFile}
                onOpenLocalDirectory={() => void handleOpenLocalDirectory()}
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
            )}

            <section className="relative flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
              <EditorPane
                projectName={activeProject?.name ?? 'VinceZone Studio'}
                files={files}
                openPaths={openPaths}
                activePath={activePath}
                activeFile={activeFile}
                explorerOpen={explorerOpen}
                aiActivity={aiActivity}
                editPulse={editPulse}
                fontSize={appSettings.editorFontSize}
                wordWrap={appSettings.editorWordWrap}
                minimap={appSettings.editorMinimap}
                revealRequest={revealRequest}
                onOpenExplorer={() => setExplorerOpen(true)}
                onSelectTab={setActivePath}
                onCloseTab={closeTab}
                onUpdateFile={updateFile}
                onSaveFile={saveFile}
                onCursorChange={setCursor}
              />

              <BottomPanel
                open={terminalOpen}
                maximized={terminalMaximized}
                activeTab={bottomPanel}
                projectName={activeProject?.name ?? 'VinceZone Studio'}
                rootPath={activeProject?.rootPath}
                files={files}
                activeFile={activeFile}
                runState={runState}
                debugState={debugState}
                debugLine={debugLine}
                agentCount={agents.length}
                communicationEvents={communicationEvents}
                terminalEntries={terminalEntries}
                terminalRunning={terminalRunning}
                onRunTerminalCommand={(cmd) => void runTerminalCommand(cmd)}
                onClearTerminal={() => setTerminalEntries([])}
                onSetOpen={setTerminalOpen}
                onToggleMaximized={() => setTerminalMaximized((current) => !current)}
                onSelectTab={setBottomPanel}
                onOpenFile={openFile}
                onStartDebug={debugProject}
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

            {rightChatOpen && (
              <RightAiChatPanel
                agents={agents}
                selectedAgentId={rightChatAgentId}
                drafts={drafts}
                files={files}
                activeFilePath={activeFile?.path}
                onSelectAgent={setRightChatAgentId}
                onDraft={(id, value) => setDrafts((current) => ({ ...current, [id]: value }))}
                onSend={(agent) => void sendMessage(agent, undefined, false, { forceDirectChat: true })}
                onPause={pauseAgent}
                onOpenFullAgents={() => setWorkspaceMode('agents')}
                onClose={() => setRightChatOpen(false)}
              />
            )}
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
            onCreate={() => {
              setEditingAgent(null)
              setAgentCreatorOpen(true)
            }}
            onEditAgent={(agent) => {
              setEditingAgent(agent)
              setAgentCreatorOpen(true)
            }}
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
        pendingPatchCount={pendingPatchCount}
        latestRevisionId={revisions[revisions.length - 1]?.id}
        debugActive={debugState === 'paused' || debugState === 'running'}
        isDesktop={isDesktop}
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
