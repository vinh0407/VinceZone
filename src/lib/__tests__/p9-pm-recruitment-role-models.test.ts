import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_DEFINITIONS, executeAgentTool } from '@/lib/agent-tools'
import { enforcePmCaptainInFocus1, getCaptainAgent } from '@/lib/command-hierarchy'
import { parsePlan } from '@/lib/orchestrator'
import {
  analyzeProjectAndRecruitTeam,
  extractRecruitTeamBlock,
  normalizeRecruitedMembers,
  resolveModelForRole,
} from '@/lib/pm-team-recruiter'
import { buildTeamCollaborationPrompt, ROLE_TERRITORIES } from '@/lib/vincezone-protocol'

describe('P9 PM 1:6 Captain Lock, AI-Native Multilingual Recruitment & Per-Role Models', () => {
  it('enforces @PM as sole Captain in 1:6 PM (focus1) mode', () => {
    const team = [
      { id: 'fe', name: 'Frontend', roleId: 'fe', commandRank: 'captain' as const },
      { id: 'pm', name: 'PM Orchestrator', roleId: 'pm', commandRank: 'member' as const },
      { id: 'be', name: 'Backend', roleId: 'be', commandRank: 'member' as const },
    ]
    const enforced = enforcePmCaptainInFocus1(team, 'focus1')
    expect(getCaptainAgent(enforced)?.id).toBe('pm')
    expect(enforced.find((a) => a.id === 'fe')?.commandRank).toBe('member')

    const equalLayout = enforcePmCaptainInFocus1(team, 'equal')
    expect(getCaptainAgent(equalLayout)?.id).toBe('fe')
  })

  it('exposes native recruit_team tool and validates multilingual specialist recruitment', async () => {
    const toolDef = AGENT_TOOL_DEFINITIONS.find((t) => t.function.name === 'recruit_team')
    expect(toolDef).toBeTruthy()
    expect(toolDef?.function.description).toContain('ANY language')

    // AI can pass responsibilities in ANY language (e.g. Japanese, Spanish, Vietnamese, English)
    const outcome = await executeAgentTool(
      'recruit_team',
      {
        project_summary: 'Next.js + Postgres SaaS platform with mobile companion app',
        members: [
          { role: 'fe', responsibility: 'UIコンポーネントと決済フローを実装する', owned_paths: ['src/components'] },
          { role: 'be', responsibility: 'Diseñar endpoints REST y webhooks de Stripe', owned_paths: ['src/app/api'] },
          { role: 'pm', responsibility: 'Should be ignored because PM is always Captain' },
          { role: 'custom', responsibility: 'Should be ignored because custom is freeform' },
          { role: 'qa', responsibility: 'Write Vitest & Playwright regression suites' },
        ],
      },
      process.cwd(),
    )

    expect(outcome.ok).toBe(true)
    expect(outcome.teamRecruitment?.members.map((m) => m.role)).toEqual(['fe', 'be', 'qa'])
    expect(outcome.teamRecruitment?.members[0].responsibility).toContain('UIコンポーネント')
    expect(outcome.teamRecruitment?.members[1].responsibility).toContain('Stripe')

    // Rejects invalid/empty role lists cleanly
    const invalid = await executeAgentTool('recruit_team', { members: [{ role: 'pm', responsibility: 'x' }] }, process.cwd())
    expect(invalid.ok).toBe(false)
  })

  it('parses fallback ```recruit-team blocks and orchestrator recruitTeam JSON payloads', () => {
    const block = extractRecruitTeamBlock(
      'Here is your squad:\n```recruit-team\n{"projectSummary":"Rust CLI + Web UI","members":[{"role":"be","responsibility":"Own Rust core engine"},{"role":"qa","responsibility":"Own integration benchmarks"}]}\n```',
    )
    expect(block?.projectSummary).toBe('Rust CLI + Web UI')
    expect(block?.members.map((m) => m.role)).toEqual(['be', 'qa'])

    const plan = parsePlan(
      JSON.stringify({
        summary: 'Recruited core specialists for your project',
        recruitTeam: {
          projectSummary: 'Mobile + Backend architecture',
          members: [
            { role: 'mobile', responsibility: 'Own Android Kotlin client', ownedPaths: ['android/'] },
            { role: 'sec', responsibility: 'Audit OAuth & token storage' },
          ],
        },
        tasks: [],
      }),
      [],
      new Set(),
    )
    expect(plan.recruitTeam?.members.map((m) => m.role)).toEqual(['mobile', 'sec'])

    const pmPrompt = buildTeamCollaborationPrompt(
      { id: 'pm', name: 'PM Orchestrator', role: 'Orchestrator', roleId: 'pm' },
      [],
    )
    expect(pmPrompt).toContain('recruit_team')
    expect(pmPrompt).toContain('ANY language')
  })

  it('applies AI-driven recruitment plan with pre-configured Role Models and preserves @PM + @CUSTOM', () => {
    const aiMembers = normalizeRecruitedMembers([
      { role: 'arch', responsibility: 'Define GraphQL schema & service boundaries', ownedPaths: ['src/schema.ts'] },
      { role: 'fe', responsibility: 'Build checkout UI & accessibility states', ownedPaths: ['src/components/ShopPage.tsx'] },
      { role: 'qa', responsibility: 'Verify checkout E2E flows' },
    ])

    const res = analyzeProjectAndRecruitTeam({
      projectName: 'GlobalShop',
      instruction: 'Put together a squad to ship our new checkout experience',
      files: [
        { path: 'src/components/ShopPage.tsx', name: 'ShopPage.tsx', language: 'typescript', content: '' },
      ],
      existingAgents: [
        {
          id: 'pm',
          name: 'PM Orchestrator',
          role: 'Orchestrator',
          roleId: 'pm',
          providerId: 'anthropic',
          model: 'claude-opus-4',
          accent: '#c9a24d',
          status: 'idle',
          messages: [{ id: 'm1', role: 'assistant', text: 'Existing AI analysis in user language' }],
        },
        {
          id: 'custom-1',
          name: 'Wildcard Helper',
          role: 'Free improvising agent',
          roleId: 'custom',
          providerId: 'openai',
          model: 'my-free-custom-model',
          accent: '#888',
          status: 'idle',
          messages: [],
        },
      ],
      roleModels: {
        pm: { providerId: 'anthropic', model: 'claude-opus-4' },
        fe: { providerId: 'openai', model: 'gpt-5-frontend' },
        arch: { providerId: 'anthropic', model: 'claude-sonnet-4' },
        custom: { providerId: 'ignored', model: 'should-never-override-custom' },
      },
      defaultProviderId: 'omnirouter',
      defaultModel: 'super-coder',
      aiPlan: {
        projectSummary: 'GlobalShop e-commerce checkout modernization',
        members: aiMembers,
        preservePmMessages: true,
      },
    })

    // 1. PM is index 0, sole Captain, and preserves its existing LLM analysis message
    expect(res.nextAgents[0].roleId).toBe('pm')
    expect(res.nextAgents[0].commandRank).toBe('captain')
    expect(res.nextAgents[0].model).toBe('claude-opus-4')
    expect(res.nextAgents[0].messages.some((m) => m.text.includes('Existing AI analysis'))).toBe(true)

    // 2. Exact AI-selected specialists recruited with configured Role Models
    const roleIds = res.nextAgents.map((a) => a.roleId)
    expect(roleIds).toEqual(['pm', 'arch', 'fe', 'qa', 'custom'])
    expect(res.nextAgents.find((a) => a.roleId === 'fe')?.model).toBe('gpt-5-frontend')
    expect(res.nextAgents.find((a) => a.roleId === 'arch')?.model).toBe('claude-sonnet-4')

    // 3. Every recruited member receives exact AI-written responsibility & owned scope
    const fe = res.nextAgents.find((a) => a.roleId === 'fe')!
    expect(fe.mission).toContain('Build checkout UI & accessibility states')
    expect(fe.messages.some((m) => m.text.includes('ShopPage.tsx'))).toBe(true)

    // 4. @CUSTOM agent stays untouched & unpinned
    const customAgent = res.nextAgents.find((a) => a.id === 'custom-1')!
    expect(customAgent.model).toBe('my-free-custom-model')
    expect(
      resolveModelForRole('custom', { custom: { model: 'forced-model' } }, 'openai', 'free-choice-model').model,
    ).toBe('free-choice-model')
    expect(Object.keys(ROLE_TERRITORIES).length).toBe(13)
  })
})
