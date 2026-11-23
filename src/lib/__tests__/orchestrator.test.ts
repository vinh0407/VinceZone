import { describe, expect, it } from 'vitest'
import {
  extractAgentHandoffs,
  extractJsonObject,
  extractProposedPatches,
  parsePlan,
  partitionNextBatch,
  sanitizeTaskGraph,
  selectCompactWorkspaceFiles,
  type OrchestratorAgent,
  type PlannedTask,
} from '@/lib/orchestrator'

const workers: OrchestratorAgent[] = [
  { id: 'fe', name: 'Frontend', role: 'UI', model: 'gpt-4.1' },
  { id: 'be', name: 'Backend', role: 'API', model: 'claude-sonnet-4' },
]

describe('orchestrator pure utilities', () => {
  it('extracts JSON safely even when surrounding prose contains extra braces', () => {
    const raw = `Here is the plan for component {Dashboard}:\n\`\`\`json\n{"summary":"Build UI","tasks":[{"id":"T1","title":"Update UI","description":"Edit dashboard","assigneeId":"fe","relevantFiles":["src/app/page.tsx"]}]}\n\`\`\`\nNote: keep {props} typed.`
    const extracted = extractJsonObject(raw)
    expect(extracted).toContain('"summary":"Build UI"')

    const plan = parsePlan(raw, workers, new Set(['src/app/page.tsx']))
    expect(plan.summary).toBe('Build UI')
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].assigneeId).toBe('fe')
    expect(plan.tasks[0].relevantFiles).toEqual(['src/app/page.tsx'])
  })

  it('drops unknown assignees and unknown file references', () => {
    const raw = JSON.stringify({
      summary: 'Plan',
      tasks: [
        {
          id: 'T1',
          title: 'Valid',
          description: 'Do work',
          assigneeId: 'fe',
          relevantFiles: ['src/app/page.tsx', 'secret.env'],
        },
        {
          id: 'T2',
          title: 'Invalid assignee',
          description: 'Ghost',
          assigneeId: 'unknown',
        },
      ],
    })
    const plan = parsePlan(raw, workers, new Set(['src/app/page.tsx']))
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].relevantFiles).toEqual(['src/app/page.tsx'])
  })

  it('detects dependency failures and cycles in DAG partitioning', () => {
    const tasks: PlannedTask[] = [
      {
        id: 'r1-A',
        title: 'A',
        description: 'Task A',
        assigneeId: 'fe',
        dependencies: ['r1-B'],
        relevantFiles: [],
        expectedOutput: '',
        constraints: [],
        completionCriteria: [],
      },
      {
        id: 'r1-B',
        title: 'B',
        description: 'Task B',
        assigneeId: 'be',
        dependencies: ['r1-A'],
        relevantFiles: [],
        expectedOutput: '',
        constraints: [],
        completionCriteria: [],
      },
    ]

    const cycle = partitionNextBatch(tasks, new Set(), new Set(), 2)
    expect(cycle.cycleDetected).toBe(true)
    expect(cycle.readyBatch).toHaveLength(0)

    const failed = partitionNextBatch([tasks[0]], new Set(), new Set(['r1-B']), 2)
    expect(failed.blockedByFailure).toHaveLength(1)
  })

  it('sanitizes task graph IDs and deduplicates identical assignments', () => {
    const base: PlannedTask = {
      id: 'TASK-1',
      title: 'T1',
      description: 'Same work',
      assigneeId: 'fe',
      dependencies: ['TASK-1'],
      relevantFiles: [],
      expectedOutput: '',
      constraints: [],
      completionCriteria: [],
    }
    const sanitized = sanitizeTaskGraph([base, { ...base, id: 'TASK-2' }], 'abc', 5)
    expect(sanitized).toHaveLength(1)
    expect(sanitized[0].id).toBe('abc-TASK-1')
    expect(sanitized[0].dependencies).toEqual([])
  })

  it('extracts structured baton-patch blocks while ignoring path traversal', () => {
    const report = `Done analyzing.\n\`\`\`baton-patch\n[{"path":"src/app/page.tsx","summary":"Update title","content":"export default function Page() { return <main>Hi</main> }"},{"path":"../etc/passwd","summary":"Bad","content":"nope"}]\n\`\`\``
    const patches = extractProposedPatches(report, new Set(['src/app/page.tsx']))
    expect(patches).toHaveLength(1)
    expect(patches[0].path).toBe('src/app/page.tsx')
    expect(patches[0].summary).toBe('Update title')
  })

  it('extracts direct edit:<path> fenced blocks for reliable AI code editing', () => {
    const reply = `Updated the page component:\n\`\`\`edit:src/app/page.tsx\nexport default function Page() {\n  return <h1>Fixed</h1>\n}\n\`\`\`\n`
    const patches = extractProposedPatches(reply)
    expect(patches).toHaveLength(1)
    expect(patches[0].path).toBe('src/app/page.tsx')
    expect(patches[0].content).toContain('<h1>Fixed</h1>')
  })

  it('extracts HANDOFF @ROLE directives for inter-agent collaboration', () => {
    const agents = [
      { id: 'fe', name: 'Frontend Engineer', role: 'UI', roleId: 'fe' },
      { id: 'be', name: 'Backend Engineer', role: 'API', roleId: 'be' },
      { id: 'qa', name: 'QA Engineer', role: 'Testing', roleId: 'qa' },
    ]
    const reply = `UI shell ready.\nHANDOFF @BE: Add POST /api/profile endpoint returning { ok, user }\nHANDOFF @QA: Verify form validation`
    const handoffs = extractAgentHandoffs(reply, agents, 'fe')
    expect(handoffs).toHaveLength(2)
    expect(handoffs[0].targetAgentId).toBe('be')
    expect(handoffs[1].targetAgentId).toBe('qa')
  })

  it('keeps orchestration file payload compact and excludes lockfiles', () => {
    const files = [
      { path: 'pnpm-lock.yaml', content: 'x'.repeat(200_000) },
      { path: 'src/app/page.tsx', content: 'export default function Home() {}' },
      { path: 'src/lib/helper.ts', content: 'export const ok = true' },
    ]
    const compact = selectCompactWorkspaceFiles(files, 'src/app/page.tsx', 'edit helper')
    expect(compact.some((f) => f.path === 'pnpm-lock.yaml')).toBe(false)
    expect(compact[0].path).toBe('src/app/page.tsx')
  })
})
