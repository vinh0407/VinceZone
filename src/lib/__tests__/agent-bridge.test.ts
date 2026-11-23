import { describe, expect, it } from 'vitest'
import type { Agent } from '@/components/ide/agent-types'
import {
  buildBridgeContextPrompt,
  extractBridgeRoutes,
  resolveAgentByRoleOrName,
} from '../agent-bridge'
import { executeAgentTool } from '../agent-tools'

const mockAgents: Agent[] = [
  {
    id: 'pm',
    name: 'PM Orchestrator',
    role: 'Coordinates team',
    roleId: 'pm',
    model: 'gpt-4.1',
    accent: '#fff',
    status: 'idle',
    messages: [],
  },
  {
    id: 'fe',
    name: 'Frontend Engineer',
    role: 'React UI specialist',
    roleId: 'fe',
    model: 'gpt-4.1',
    accent: '#ddd',
    status: 'idle',
    messages: [],
  },
  {
    id: 'be',
    name: 'Backend Engineer',
    role: 'API & Database specialist',
    roleId: 'be',
    model: 'gpt-4.1',
    accent: '#bbb',
    status: 'idle',
    messages: [],
  },
  {
    id: 'qa',
    name: 'QA Engineer',
    role: 'Testing & verification',
    roleId: 'qa',
    model: 'gpt-4.1',
    accent: '#999',
    status: 'idle',
    messages: [],
  },
]

describe('Multi-Agent Communication Bridge', () => {
  it('resolves agents by role code, alias, or name and excludes self', () => {
    expect(resolveAgentByRoleOrName('@BE', mockAgents, 'pm')?.id).toBe('be')
    expect(resolveAgentByRoleOrName('frontend', mockAgents, 'pm')?.id).toBe('fe')
    expect(resolveAgentByRoleOrName('PM', mockAgents, 'pm')).toBeNull()
  })

  it('extracts HANDOFF, ASK, @ALL, and direct leading @ROLE mentions while ignoring code blocks', () => {
    const text = [
      'Here is my plan.',
      '```ts',
      '// HANDOFF @QA: ignore inside code fence',
      '```',
      'HANDOFF @BE: Expose GET /api/health endpoint',
      'ASK @FE: Confirm expected JSON payload shape',
    ].join('\n')

    const routes = extractBridgeRoutes(text, mockAgents, 'pm')
    expect(routes).toHaveLength(2)
    expect(routes[0].targetAgentId).toBe('be')
    expect(routes[0].kind).toBe('handoff')
    expect(routes[1].targetAgentId).toBe('fe')
    expect(routes[1].kind).toBe('question')

    const direct = extractBridgeRoutes('@QA verify login edge cases', mockAgents, 'pm')
    expect(direct).toHaveLength(1)
    expect(direct[0].targetAgentId).toBe('qa')
    expect(direct[0].message).toBe('verify login edge cases')

    const broadcast = extractBridgeRoutes('@ALL: API schema frozen v2', mockAgents, 'pm')
    expect(broadcast).toHaveLength(3)
    expect(broadcast.every((r) => r.kind === 'broadcast')).toBe(true)
  })

  it('builds shared team bridge context prompt with recent messages', () => {
    const prompt = buildBridgeContextPrompt(mockAgents[1], mockAgents, [
      {
        id: 'b1',
        fromAgentId: 'be',
        fromAgentName: 'Backend Engineer',
        fromRole: 'BE',
        toAgentId: 'fe',
        toAgentName: 'Frontend Engineer',
        toRole: 'FE',
        kind: 'handoff',
        content: 'Created /api/health returning { ok: true }',
        relatedFiles: ['src/app/api/health/route.ts'],
        timestamp: '2026-11-24T01:10:00.000Z',
      },
    ])
    expect(prompt).toContain('MULTI-AGENT COMMUNICATION BRIDGE')
    expect(prompt).toContain('message_agent')
    expect(prompt).toContain('Created /api/health returning { ok: true }')
    expect(prompt).toContain('src/app/api/health/route.ts')
  })

  it('executes message_agent tool and returns structured agentHandoff', async () => {
    const outcome = await executeAgentTool(
      'message_agent',
      { to_role: '@BE', message: 'Check rate limiter', files: ['src/lib/rate-limit.ts'] },
      process.cwd(),
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.agentHandoff?.toRole).toBe('BE')
    expect(outcome.agentHandoff?.message).toBe('Check rate limiter')
    expect(outcome.agentHandoff?.files).toEqual(['src/lib/rate-limit.ts'])
  })
})
