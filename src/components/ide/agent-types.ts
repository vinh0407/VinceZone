import type { EditRevision } from '@/lib/edit-memory'
import type { WorkspaceFileNode } from '@/lib/file-tree'
import type { VinceZoneRoleId } from '@/lib/vincezone-protocol'

export type WorkspaceFile = WorkspaceFileNode
export type WorkspaceMode = 'ide' | 'agents' | 'android'
export type SidePanel = 'explorer' | 'search' | 'git' | 'revisions'

export type Message = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'agent'
  text: string
  change?: boolean
  patchId?: string
  from?: string
  typing?: boolean
}

export type Agent = {
  id: string
  name: string
  role: string
  roleId?: VinceZoneRoleId
  model: string
  accent: string
  status: 'running' | 'idle' | 'paused' | 'reviewing' | 'blocked'
  messages: Message[]
  currentTask?: string
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

export type MailKind = 'delegation' | 'peer' | 'report' | 'direct' | 'conflict'

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

export type ProjectTab = {
  id: string
  name: string
  rootPath?: string
  files: WorkspaceFile[]
}

export type AppSettings = {
  autoSave: boolean
  confirmDangerousTools: boolean
  restoreWorkspace: boolean
  compactMode: boolean
  maxConcurrentAgents: number
  autoApplyTrusted: boolean
  allowTerminal: boolean
  delegation: DelegationLimits
}

export type CliDetectionResult = {
  tools: Array<{
    id: 'claude' | 'codex' | 'gemini'
    name: string
    executable: string
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
}

export type { EditRevision }
