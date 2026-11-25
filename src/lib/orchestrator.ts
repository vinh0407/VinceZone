import {
  normalizeRecruitedMembers,
  type AiRecruitedMemberSpec,
} from '@/lib/pm-team-recruiter'

export type OrchestratorAgent = {
  id: string
  name: string
  role: string
  model: string
  providerId?: string
  soul?: string
  mission?: string
  memory?: string
}

export type PlannedTask = {
  id: string
  title: string
  description: string
  assigneeId: string
  dependencies: string[]
  relevantFiles: string[]
  expectedOutput: string
  constraints: string[]
  completionCriteria: string[]
}

export type ProposedPatchInput = {
  path: string
  summary: string
  content: string
}

/**
 * Extract the first balanced JSON object from an LLM response.
 * Prefers fenced ```json blocks, then falls back to balanced-brace scanning
 * that ignores braces inside quoted string literals.
 */
export function extractJsonObject(raw: string): string | null {
  const fenceMatches = raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)
  for (const match of fenceMatches) {
    const candidate = match[1]?.trim()
    if (candidate?.startsWith('{')) {
      try {
        JSON.parse(candidate)
        return candidate
      } catch {
        // Try scanning inside the fenced block or continue.
      }
    }
  }

  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== '{') continue
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < raw.length; index += 1) {
      const ch = raw[index]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (ch === '\\') {
          escaped = true
        } else if (ch === '"') {
          inString = false
        }
        continue
      }
      if (ch === '"') {
        inString = true
      } else if (ch === '{') {
        depth += 1
      } else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          const slice = raw.slice(start, index + 1)
          try {
            JSON.parse(slice)
            return slice
          } catch {
            break
          }
        }
      }
    }
  }

  return null
}

export function parsePlan(
  raw: string,
  workers: OrchestratorAgent[],
  paths: Set<string>,
): {
  summary: string
  tasks: PlannedTask[]
  recruitTeam?: { projectSummary?: string; members: AiRecruitedMemberSpec[] }
} {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return { summary: raw, tasks: [] }

  let parsed: {
    summary?: string
    tasks?: Partial<PlannedTask>[]
    recruitTeam?: { projectSummary?: string; project_summary?: string; members?: unknown }
    recruit_team?: { projectSummary?: string; project_summary?: string; members?: unknown }
  }
  try {
    parsed = JSON.parse(jsonText) as typeof parsed
  } catch {
    return { summary: raw, tasks: [] }
  }

  const rawRecruit = parsed.recruitTeam ?? parsed.recruit_team
  const normalizedRecruitMembers = rawRecruit ? normalizeRecruitedMembers(rawRecruit.members) : []
  const recruitTeam =
    normalizedRecruitMembers.length > 0
      ? {
          projectSummary:
            String(rawRecruit?.projectSummary ?? rawRecruit?.project_summary ?? '').trim() ||
            undefined,
          members: normalizedRecruitMembers,
        }
      : undefined

  const tasks = (Array.isArray(parsed.tasks) ? parsed.tasks : []).flatMap((task, index) => {
    const rawAssignee = String(task.assigneeId ?? '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase()
    const assignee =
      workers.find((agent) => agent.id === task.assigneeId) ??
      workers.find(
        (agent) =>
          Boolean(rawAssignee) &&
          (agent.id.toLowerCase() === rawAssignee ||
            agent.name.toLowerCase() === rawAssignee ||
            agent.name.toLowerCase().replace(/\s+/g, '-') === rawAssignee),
      )
    if (!assignee || !task.description) return []
    return [
      {
        id: String(task.id || `TASK-${index + 1}`),
        title: String(task.title || `Delegated task ${index + 1}`).slice(0, 120),
        description: String(task.description).slice(0, 6000),
        assigneeId: assignee.id,
        dependencies: Array.isArray(task.dependencies)
          ? task.dependencies.map(String).slice(0, 12)
          : [],
        relevantFiles: Array.isArray(task.relevantFiles)
          ? task.relevantFiles.map(String).filter((filePath) => paths.has(filePath))
          : [],
        expectedOutput: String(task.expectedOutput || 'A concise implementation report.').slice(
          0,
          1000,
        ),
        constraints: Array.isArray(task.constraints)
          ? task.constraints.map(String).slice(0, 12)
          : [],
        completionCriteria: Array.isArray(task.completionCriteria)
          ? task.completionCriteria.map(String).slice(0, 12)
          : [],
      },
    ]
  })

  return { summary: String(parsed.summary || raw), tasks, ...(recruitTeam ? { recruitTeam } : {}) }
}

export function sanitizeTaskGraph(
  rawTasks: PlannedTask[],
  runId: string,
  maxTasks: number,
  preserveIds = false,
): PlannedTask[] {
  const deduplicated = rawTasks
    .filter(
      (task, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.id === task.id ||
            (candidate.assigneeId === task.assigneeId &&
              candidate.description === task.description),
        ) === index,
    )
    .slice(0, maxTasks)

  const taskIds = new Map(
    deduplicated.map((task) => [task.id, preserveIds ? task.id : `${runId}-${task.id}`]),
  )

  return deduplicated.map((task) => ({
    ...task,
    id: taskIds.get(task.id)!,
    dependencies: task.dependencies.flatMap((id) => {
      const mapped = taskIds.get(id)
      return mapped && mapped !== taskIds.get(task.id) ? [mapped] : []
    }),
  }))
}

export function partitionNextBatch(
  pending: PlannedTask[],
  completedTaskIds: Set<string>,
  failedTaskIds: Set<string>,
  maxBatchSize: number,
): {
  blockedByFailure: PlannedTask[]
  readyBatch: PlannedTask[]
  cycleDetected: boolean
} {
  const blockedByFailure = pending.filter((task) =>
    task.dependencies.some((dependency) => failedTaskIds.has(dependency)),
  )
  const remaining = pending.filter((task) => !blockedByFailure.includes(task))
  const ready = remaining.filter((task) =>
    task.dependencies.every((dependency) => completedTaskIds.has(dependency)),
  )

  if (!ready.length && remaining.length > 0) {
    return {
      blockedByFailure,
      readyBatch: [],
      cycleDetected: true,
    }
  }

  const assigned = new Set<string>()
  const readyBatch = ready
    .filter((task) => {
      if (assigned.has(task.assigneeId)) return false
      assigned.add(task.assigneeId)
      return true
    })
    .slice(0, Math.max(1, maxBatchSize))

  return {
    blockedByFailure,
    readyBatch,
    cycleDetected: false,
  }
}

/**
 * Extract structured file change proposals from an agent's report or chat message.
 * Supports BOTH:
 * 1) Easy markdown fenced blocks: ```edit:src/path/to/file.tsx ... ``` or ```file:src/path/to/file.tsx ... ```
 * 2) Legacy JSON fenced blocks: ```baton-patch { ... } ```
 */
export function extractProposedPatches(
  raw: string,
  allowedPaths?: Set<string>,
): ProposedPatchInput[] {
  const patches: ProposedPatchInput[] = []
  const seenPaths = new Set<string>()

  const pushPatch = (rawPath: string, content: string, summary: string) => {
    const normalizedPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim()
    if (!normalizedPath || normalizedPath.includes('..')) return
    if (allowedPaths && allowedPaths.size > 0 && !allowedPaths.has(normalizedPath)) {
      if (!/^[\w./()[\]-]+$/.test(normalizedPath)) return
    }
    if (seenPaths.has(normalizedPath)) return
    seenPaths.add(normalizedPath)
    patches.push({
      path: normalizedPath,
      summary: summary.slice(0, 200),
      content,
    })
  }

  // 1) Fenced ```edit:path/to/file, ```file:path/to/file, ```tsx:src/app/page.tsx, or ```ts src/app/page.tsx
  const fencedMatches = raw.matchAll(/```([^\n`]*)\r?\n([\s\S]*?)```/gi)
  for (const match of fencedMatches) {
    const header = (match[1] || '').trim()
    const content = match[2]
    if (typeof content !== 'string' || !content.trim()) continue
    if (/^baton-patch\b/i.test(header)) continue

    let targetPath: string | null = null

    // 1a. Explicit ```edit:path, ```file:path, ```tsx:path/to/file.tsx
    const colonMatch = header.match(/^[a-z0-9_+-]+:([^\s`]+)$/i)
    if (colonMatch?.[1] && /[./]/.test(colonMatch[1])) {
      targetPath = colonMatch[1].trim()
    }

    // 1b. Space-separated ```tsx src/app/page.tsx or ```typescript path=src/foo.ts
    if (!targetPath) {
      const spaceMatch = header.match(/^[a-z0-9_+-]+\s+(?:path=|file=)?([^\s`]+)$/i)
      if (spaceMatch?.[1] && /\.[a-z0-9]{1,8}$/i.test(spaceMatch[1])) {
        targetPath = spaceMatch[1].trim()
      }
    }

    // 1c. First-line comment header inside code fence: // src/app/page.tsx, # script.py, /* styles.css */, <!-- index.html -->
    let bodyContent = content
    if (!targetPath) {
      const lines = content.split(/\r?\n/)
      const firstLine = (lines[0] || '').trim()
      const commentPathMatch = firstLine.match(
        /^(?:\/\/|#|\/\*|<!--)\s*(?:file(?:path)?:?\s*)?([a-z0-9_./()[\]-]+\.[a-z0-9]{1,8})\s*(?:\*\/|-->)?$/i,
      )
      if (commentPathMatch?.[1]) {
        targetPath = commentPathMatch[1].trim()
        bodyContent = lines.slice(1).join('\n')
      }
    }

    if (targetPath && bodyContent.trim()) {
      pushPatch(targetPath, bodyContent, `Direct AI code edit for ${targetPath}`)
    }
  }

  // 2) Legacy JSON ```baton-patch blocks
  const matches = raw.matchAll(/```baton-patch\s*([\s\S]*?)```/gi)
  for (const match of matches) {
    const body = match[1]?.trim()
    if (!body) continue
    try {
      const parsed = JSON.parse(body) as
        | ProposedPatchInput[]
        | { changes?: ProposedPatchInput[]; path?: string; summary?: string; content?: string }
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.changes)
          ? parsed.changes
          : parsed.path && typeof parsed.content === 'string'
            ? [parsed as ProposedPatchInput]
            : []

      for (const item of list) {
        if (!item || typeof item.path !== 'string' || typeof item.content !== 'string') continue
        pushPatch(item.path, item.content, String(item.summary || 'Proposed file update'))
      }
    } catch {
      // Ignore malformed patch blocks without failing the worker report.
    }
  }

  return patches
}

export type AgentHandoffDirective = {
  targetAgentId: string
  targetName: string
  message: string
}

/**
 * Parses `HANDOFF @ROLE_OR_NAME: <instruction>` directives from an agent's reply
 * so agents can actively link and pass work to teammates.
 */
export function extractAgentHandoffs(
  raw: string,
  agents: Array<{ id: string; name: string; role: string; roleId?: string }>,
  senderId: string,
): AgentHandoffDirective[] {
  const handoffs: AgentHandoffDirective[] = []
  const lines = raw.split(/\r?\n/)
  const seenTargets = new Set<string>()

  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]\s*)?HANDOFF\s+@([a-zA-Z0-9_-]+)\s*[:\-]\s*(.+)$/i)
    if (!match) continue
    const token = match[1].toLowerCase()
    const message = match[2].trim()
    if (!message) continue

    const target = agents.find((agent) => {
      if (agent.id === senderId) return false
      const roleCode = (agent.roleId || '').toLowerCase()
      return (
        roleCode === token ||
        agent.id.toLowerCase() === token ||
        agent.name.toLowerCase().replace(/\s+/g, '') === token ||
        agent.name.toLowerCase().startsWith(token)
      )
    })

    if (target && !seenTargets.has(target.id)) {
      seenTargets.add(target.id)
      handoffs.push({
        targetAgentId: target.id,
        targetName: target.name,
        message: message.slice(0, 800),
      })
    }
  }

  return handoffs.slice(0, 3)
}

const SKIP_CONTEXT_FILES = /(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.min\.js|\.map)$/i

/**
 * Selects a compact, high-signal subset of workspace files so orchestration requests
 * never exceed HTTP payload limits (fixes 413 "Request is too large").
 */
export function selectCompactWorkspaceFiles<T extends { path: string; content: string }>(
  files: T[],
  activePath?: string,
  instruction = '',
  maxFiles = 14,
  maxBytesPerFile = 9_000,
  maxTotalBytes = 110_000,
): Array<{ path: string; content: string }> {
  const lowerPrompt = instruction.toLowerCase()
  const keywords = lowerPrompt
    .split(/[^a-z0-9_./-]+/)
    .filter((token) => token.length >= 3)

  const scored = files
    .filter((file) => !SKIP_CONTEXT_FILES.test(file.path))
    .map((file) => {
      let score = 0
      const p = file.path.toLowerCase()
      if (activePath && file.path === activePath) score += 100
      if (lowerPrompt.includes(`@${p}`) || lowerPrompt.includes(p)) score += 90
      if (p === 'package.json' || p === 'tsconfig.json' || p === 'readme.md') score += 20
      for (const kw of keywords) {
        if (p.includes(kw)) score += 18
      }
      if (p.startsWith('src/')) score += 5
      return { file, score }
    })
    .sort((a, b) => b.score - a.score)

  const selected: Array<{ path: string; content: string }> = []
  let totalBytes = 0

  for (const { file } of scored) {
    if (selected.length >= maxFiles) break
    const clipped = file.content.slice(0, maxBytesPerFile)
    if (totalBytes + clipped.length > maxTotalBytes && selected.length > 0) continue
    selected.push({ path: file.path, content: clipped })
    totalBytes += clipped.length
  }

  return selected
}
