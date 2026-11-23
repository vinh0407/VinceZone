export type OrchestratorAgent = {
  id: string
  name: string
  role: string
  model: string
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
): { summary: string; tasks: PlannedTask[] } {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return { summary: raw, tasks: [] }

  let parsed: { summary?: string; tasks?: Partial<PlannedTask>[] }
  try {
    parsed = JSON.parse(jsonText) as { summary?: string; tasks?: Partial<PlannedTask>[] }
  } catch {
    return { summary: raw, tasks: [] }
  }

  const tasks = (Array.isArray(parsed.tasks) ? parsed.tasks : []).flatMap((task, index) => {
    const assignee = workers.find((agent) => agent.id === task.assigneeId)
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

  return { summary: String(parsed.summary || raw), tasks }
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
 * Extract structured file change proposals from a worker's report.
 * Supports fenced ```baton-patch blocks containing either an array of changes
 * or {"changes": [...]}.
 */
export function extractProposedPatches(
  raw: string,
  allowedPaths?: Set<string>,
): ProposedPatchInput[] {
  const patches: ProposedPatchInput[] = []
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
        const normalizedPath = item.path.replace(/^\/+/, '').trim()
        if (!normalizedPath || normalizedPath.includes('..')) continue
        if (allowedPaths && allowedPaths.size > 0 && !allowedPaths.has(normalizedPath)) {
          // Allow proposing new files only under relative project paths without traversal
          if (!/^[\w./-]+$/.test(normalizedPath)) continue
        }
        patches.push({
          path: normalizedPath,
          summary: String(item.summary || 'Proposed file update').slice(0, 200),
          content: item.content,
        })
      }
    } catch {
      // Ignore malformed patch blocks without failing the worker report.
    }
  }

  return patches
}
