import type {
  Agent,
  AppSettings,
  ProviderConfig,
  TerminalHistoryEntry,
  WorkspaceFile,
} from '@/components/ide/agent-types'
import type { EditorDiagnostic } from '@/components/ide/status-bar'

const SECRET_FIELD_PATTERN = /(api[_-]?key|token|secret|password|auth|authorization|bearer)/i

function redactSecretsDeep(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (/^(sk-|ghp_|gho_|AIza|xox[baprs]-|Bearer\s+)/i.test(value.trim())) {
      return '[REDACTED]'
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsDeep(item, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_PATTERN.test(k) && typeof v !== 'boolean') {
        out[k] = v ? '[REDACTED]' : ''
      } else {
        out[k] = redactSecretsDeep(v, depth + 1)
      }
    }
    return out
  }
  return value
}

export function buildDiagnosticsReport(input: {
  projectName: string
  rootPath?: string
  files: WorkspaceFile[]
  agents: Agent[]
  providers: ProviderConfig[]
  appSettings: AppSettings
  diagnostics: EditorDiagnostic[]
  terminalEntries: TerminalHistoryEntry[]
  gitBranch?: string
}) {
  const report = {
    app: 'VinceZone Studio',
    generatedAt: new Date().toISOString(),
    runtime: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
      platform: typeof navigator !== 'undefined' ? navigator.platform : process.platform,
    },
    workspace: {
      projectName: input.projectName,
      rootPath: input.rootPath || '(in-memory)',
      gitBranch: input.gitBranch || 'unknown',
      fileCount: input.files.length,
      dirtyFileCount: input.files.filter((f) => f.dirty).length,
    },
    providers: input.providers.map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      hasApiKey: Boolean(p.apiKey),
    })),
    agents: input.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      roleId: a.roleId,
      model: a.model,
      status: a.status,
      messageCount: a.messages.length,
    })),
    mcpServers: input.appSettings.mcpServers.map((s) => ({
      id: s.id,
      name: s.name,
      transport: s.transport,
      enabled: s.enabled,
    })),
    editorDiagnostics: input.diagnostics.slice(0, 50),
    recentTerminal: input.terminalEntries.slice(-10).map((t) => ({
      command: t.command,
      exitCode: t.exitCode,
      timestamp: t.timestamp,
      stderrPreview: t.stderr.slice(-400),
    })),
  }

  return redactSecretsDeep(report) as typeof report
}
