import type { CommandRank } from '@/lib/command-hierarchy'
import type { EditRevision } from '@/lib/edit-memory'
import type { WorkspaceFileNode } from '@/lib/file-tree'
import type { VinceZoneRoleId } from '@/lib/vincezone-protocol'

export type { CommandRank }

export type WorkspaceFile = WorkspaceFileNode
export type WorkspaceMode = 'ide' | 'agents' | 'android' | 'web'
export type SidePanel = 'explorer' | 'search' | 'git' | 'revisions' | 'memory'

export type ChatImageAttachment = {
  id: string
  name: string
  mimeType: string
  dataUrl: string
}

export type Message = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'agent'
  text: string
  images?: ChatImageAttachment[]
  change?: boolean
  patchId?: string
  from?: string
  codeSnippet?: string
  typing?: boolean
}

export type ChatThreadSnapshot = {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  agents: Agent[]
}

export type Agent = {
  id: string
  name: string
  role: string
  roleId?: VinceZoneRoleId
  commandRank?: CommandRank
  soul?: string
  mission?: string
  memory?: string
  providerId?: string
  model: string
  accent: string
  status: 'running' | 'idle' | 'paused' | 'reviewing' | 'blocked'
  messages: Message[]
  currentTask?: string
  composingPrompt?: string
}

export type AgentView = 'chat' | 'terminal'
export type AgentLayout = 'equal' | 'focus2' | 'focus1'

export type DelegationLimits = {
  maxDepth: number
  maxActiveAgents: number
  maxConcurrentTasks: number
  maxIterations: number
  requireApproval: boolean
  assignmentMode: 'automatic' | 'manual'
}

export type TaskStatus =
  | 'planned'
  | 'awaiting-approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'

export type AgentTask = {
  id: string
  title: string
  description: string
  assigneeId: string
  status: TaskStatus
  dependencies: string[]
  relevantFiles: string[]
  expectedOutput: string
  constraints?: string[]
  completionCriteria: string[]
  result?: string
  error?: string
}

export type MailKind = 'delegation' | 'peer' | 'report' | 'direct' | 'conflict' | 'code'

export type CommunicationEvent = {
  id: string
  type: string
  kind: MailKind
  timestamp: string
  senderId: string
  recipientId?: string
  taskId?: string
  label?: string
  description: string
  codeSnippet?: string
  relevantFiles?: string[]
}

export type ProposedPatch = {
  id: string
  taskId: string
  agentId: string
  agentName: string
  roleCode?: string
  path: string
  summary: string
  originalContent: string
  proposedContent: string
  baseHash: string
  conflictWith?: string
  territoryViolation?: string
  requiresApiContract?: boolean
  status: 'pending' | 'applied' | 'rejected'
  previousContent?: string | null
  createdAt: string
}

export type PendingApprovalPlan = {
  coordinatorId: string
  instruction: string
  tasks: AgentTask[]
  planningContext: string
  planSummary: string
}

export type CommandApprovalItem = {
  id: string
  command: string
  reason: string
  cwd: string
  riskLevel: 'medium' | 'high'
  agentId: string
  agentName: string
  status: 'pending' | 'running' | 'approved' | 'rejected' | 'failed'
  output?: string
  exitCode?: number
}

export type InlineHunkReview = {
  path: string
  originalContent: string
  proposedContent: string
  summary: string
  decisions: Record<string, 'accepted' | 'rejected'>
}

export type TerminalHistoryEntry = {
  id: string
  command: string
  cwd: string
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  timestamp: string
}

export type ProviderConfig = {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  models: string
}

export type McpServerConfig = {
  id: string
  name: string
  transport: 'stdio' | 'http'
  endpoint: string
  enabled: boolean
}

export type PluginConfig = {
  id: string
  name: string
  description: string
  enabled: boolean
}

export type UsageRecord = {
  id: string
  providerName: string
  model: string
  agentName: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  timestamp: string
}

export type MemoryNote = {
  id: string
  scope: 'project' | 'agent'
  agentId?: string
  title: string
  content: string
  updatedAt: string
}

export type ProjectSessionData = {
  agents: Agent[]
  agentTasks: AgentTask[]
  communicationEvents: CommunicationEvent[]
  proposedPatches: ProposedPatch[]
  revisions: EditRevision[]
  memoryNotes: MemoryNote[]
  chatThreads?: ChatThreadSnapshot[]
  activeThreadId?: string
}

export type ProjectTab = {
  id: string
  name: string
  rootPath?: string
  files: WorkspaceFile[]
  session?: ProjectSessionData
}

export type AppTheme = 'dark' | 'light' | 'high-contrast'

export type AppSettings = {
  theme?: AppTheme
  autoSave: boolean
  autoSaveDelayMs: number
  confirmDangerousTools: boolean
  restoreWorkspace: boolean
  compactMode: boolean
  editorFontSize: number
  editorWordWrap: boolean
  editorMinimap: boolean
  maxConcurrentAgents: number
  autoApplyTrusted: boolean
  allowTerminal: boolean
  autoCaptureMemory: boolean
  defaultCliTool: string
  enabledSkillIds: string[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  delegation: DelegationLimits
}

export type CliDetectionResult = {
  tools: Array<{
    id: string
    name: string
    executable: string
    category?: string
    installed: boolean
    authentication: 'unknown'
  }>
  executionAvailable: false
  scope: 'deployment-runtime'
  notice: string
}

export type AgentWorkspaceState = {
  layout: AgentLayout
  order: string[]
  minimized: string[]
  mainAgentId?: string
}

export type RuntimeEvent = {
  type: string
  timestamp: string
  agentId?: string
  taskId?: string
  task?: AgentTask
  tasks?: AgentTask[]
  patch?: ProposedPatch
  planningContext?: string
  planSummary?: string
  message?: string
  senderId?: string
  recipientId?: string
  result?: string
  error?: string
  relevantFiles?: string[]
  path?: string
  content?: string
  previousContent?: string | null
  summary?: string
  chunk?: string
  agentName?: string
  approval?: {
    id: string
    command: string
    reason: string
    cwd: string
    riskLevel: 'medium' | 'high'
  }
}

export type { EditRevision }
