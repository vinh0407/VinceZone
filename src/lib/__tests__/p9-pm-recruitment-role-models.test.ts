import { describe, expect, it } from 'vitest'
import { enforcePmCaptainInFocus1, getCaptainAgent } from '@/lib/command-hierarchy'
import {
  analyzeProjectAndRecruitTeam,
  isTeamRecruitmentPrompt,
  resolveModelForRole,
} from '@/lib/pm-team-recruiter'
import { ROLE_TERRITORIES } from '@/lib/vincezone-protocol'

describe('P9 PM 1:6 Captain Lock, Project-Analysis Recruitment & Per-Role Models', () => {
  it('enforces @PM as sole Captain in 1:6 PM (focus1) mode', () => {
    const team = [
      { id: 'fe', name: 'Frontend', roleId: 'fe', commandRank: 'captain' as const },
      { id: 'pm', name: 'PM Orchestrator', roleId: 'pm', commandRank: 'member' as const },
      { id: 'be', name: 'Backend', roleId: 'be', commandRank: 'member' as const },
    ]
    const enforced = enforcePmCaptainInFocus1(team, 'focus1')
    expect(getCaptainAgent(enforced)?.id).toBe('pm')
    expect(enforced.find((a) => a.id === 'fe')?.commandRank).toBe('member')

    // Non-focus1 layouts leave captain unchanged
    const equalLayout = enforcePmCaptainInFocus1(team, 'equal')
    expect(getCaptainAgent(equalLayout)?.id).toBe('fe')
  })

  it('detects Vietnamese and English team recruitment commands', () => {
    expect(isTeamRecruitmentPrompt('tạo nhóm cho dự án này')).toBe(true)
    expect(isTeamRecruitmentPrompt('PM tuyển thành viên cho app Android')).toBe(true)
    expect(isTeamRecruitmentPrompt('lập đội làm backend và mobile')).toBe(true)
    expect(isTeamRecruitmentPrompt('create team for this repository')).toBe(true)
    expect(isTeamRecruitmentPrompt('fix login button CSS')).toBe(false)
  })

  it('analyzes project files, recruits right roles with configured role models, and briefs each member', () => {
    const res = analyzeProjectAndRecruitTeam({
      projectName: 'ShopApp',
      instruction: 'tạo nhóm cho dự án này',
      files: [
        {
          path: 'package.json',
          name: 'package.json',
          language: 'json',
          content: '{"dependencies":{"next":"16.0.0","react":"19.0.0"}}',
        },
        { path: 'src/components/ShopPage.tsx', name: 'ShopPage.tsx', language: 'typescript', content: '' },
        { path: 'src/app/api/orders/route.ts', name: 'route.ts', language: 'typescript', content: '' },
        { path: 'prisma/schema.prisma', name: 'schema.prisma', language: 'plaintext', content: '' },
        { path: 'src/lib/auth-guard.ts', name: 'auth-guard.ts', language: 'typescript', content: '' },
        { path: 'src/lib/orders.test.ts', name: 'orders.test.ts', language: 'typescript', content: '' },
      ],
      existingAgents: [
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
        be: { providerId: 'anthropic', model: 'claude-sonnet-4' },
        custom: { providerId: 'ignored', model: 'should-never-override-custom' },
      },
      defaultProviderId: 'omnirouter',
      defaultModel: 'super-coder',
    })

    // 1. PM is index 0 and sole Captain
    expect(res.nextAgents[0].roleId).toBe('pm')
    expect(res.nextAgents[0].commandRank).toBe('captain')
    expect(res.nextAgents[0].model).toBe('claude-opus-4')

    // 2. Recruited FE, BE, DB, SEC, QA based on actual workspace files
    const roleIds = res.nextAgents.map((a) => a.roleId)
    expect(roleIds).toContain('fe')
    expect(roleIds).toContain('be')
    expect(roleIds).toContain('db')
    expect(roleIds).toContain('qa')

    // 3. Configured per-role models applied accurately
    const fe = res.nextAgents.find((a) => a.roleId === 'fe')!
    const be = res.nextAgents.find((a) => a.roleId === 'be')!
    expect(fe.model).toBe('gpt-5-frontend')
    expect(be.model).toBe('claude-sonnet-4')

    // 4. Every recruited member understands their exact position, project, and owned scope
    expect(fe.mission).toContain('ShopApp')
    expect(fe.mission).toContain('@FE')
    expect(fe.messages.some((m) => m.text.includes('ShopPage.tsx'))).toBe(true)

    // 5. @CUSTOM agent preserved untouched & free to improvise any model
    const customAgent = res.nextAgents.find((a) => a.id === 'custom-1')!
    expect(customAgent.model).toBe('my-free-custom-model')
    expect(
      resolveModelForRole(
        'custom',
        { custom: { model: 'forced-model' } },
        'openai',
        'free-choice-model',
      ).model,
    ).toBe('free-choice-model')

    // 6. All 13 fixed roles exist in ROLE_TERRITORIES (excluding custom)
    expect(Object.keys(ROLE_TERRITORIES).length).toBe(13)
    expect('custom' in ROLE_TERRITORIES).toBe(false)
  })
})
