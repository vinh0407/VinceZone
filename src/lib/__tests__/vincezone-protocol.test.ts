import { describe, expect, it } from 'vitest'
import {
  buildTeamCollaborationPrompt,
  CUSTOM_ROLE_META,
  findTerritoryOwner,
  getRoleBlueprint,
  GLOBAL_INTELLIGENCE_CORE,
  inferRoleId,
  ROLE_INTELLIGENCE_VERSION,
  ROLE_TERRITORIES,
  validateTerritoryAccess,
  type VinceZoneRoleId,
} from '@/lib/vincezone-protocol'

const ALL_14_ROLES: VinceZoneRoleId[] = [
  'pm',
  'arch',
  'uiux',
  'fe',
  'be',
  'db',
  'mobile',
  'ai',
  'sec',
  'qa',
  'perf',
  'devops',
  'docs',
  'custom',
]

describe('VinceZone territory & API contract enforcement', () => {
  it('infers department role IDs accurately', () => {
    expect(inferRoleId('pm Orchestrator')).toBe('pm')
    expect(inferRoleId('Frontend Engineer')).toBe('fe')
    expect(inferRoleId('Backend API Specialist')).toBe('be')
    expect(inferRoleId('QA Verification')).toBe('qa')
    expect(inferRoleId('Software Architect')).toBe('arch')
  })

  it('enforces FE vs BE API Contract rule and blocks cross-territory writes', () => {
    const feEditingApi = validateTerritoryAccess('fe', 'src/app/(frontend)/api/chat/route.ts')
    expect(feEditingApi.allowed).toBe(false)
    expect(feEditingApi.requiresApiContract).toBe(true)
    expect(feEditingApi.ownerRole).toBe('be')

    const feEditingUi = validateTerritoryAccess('fe', 'src/components/ide/editor-pane.tsx')
    expect(feEditingUi.allowed).toBe(true)

    const beEditingUi = validateTerritoryAccess('be', 'src/components/ide/editor-pane.tsx')
    expect(beEditingUi.allowed).toBe(false)
    expect(beEditingUi.ownerRole).toBe('fe')

    const qaEditingTests = validateTerritoryAccess('qa', 'src/lib/__tests__/provider-url.test.ts')
    expect(qaEditingTests.allowed).toBe(true)
    expect(findTerritoryOwner('prisma/schema.prisma')).toBe('db')
    expect(findTerritoryOwner('src/db/users.ts')).toBe('db')
  })
})

describe('VinceZone Multi-Agent Intelligence Configuration (v5 — 14 Roles)', () => {
  it('includes all global intelligence parts (Parts I, II, III, IV, VI, VII)', () => {
    expect(ROLE_INTELLIGENCE_VERSION).toBeGreaterThanOrEqual(5)
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('PART I — GLOBAL SOUL')
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('PART II — GLOBAL MISSION RULES')
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('PART III — GLOBAL HANDOFF PROTOCOL')
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('PART IV — GLOBAL ROLE MEMORY')
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('PART VI — UNIVERSAL COMPLETION REPORT')
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('PART VII — 10 TEAM-WIDE INTELLIGENCE PRINCIPLES')
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('HANDOFF @ROLE:')
    expect(GLOBAL_INTELLIGENCE_CORE).toContain('Correctness Over Confidence')
  })

  it('provides comprehensive multi-section Soul, Mission & Role Memory for all 14 specialist roles', () => {
    expect(Object.keys(ROLE_TERRITORIES)).toHaveLength(13)
    expect(CUSTOM_ROLE_META.roleId).toBe('custom')

    for (const roleId of ALL_14_ROLES) {
      const bp = getRoleBlueprint(roleId)
      expect(bp.roleId).toBe(roleId)
      expect(bp.defaultSoul.length).toBeGreaterThan(700)
      expect(bp.defaultMission.length).toBeGreaterThan(450)
      expect(bp.defaultMemory.length).toBeGreaterThan(400)
      expect(bp.defaultSoul).toContain('[')
      expect(bp.defaultMission).toContain('[')
      expect(bp.defaultSkills.length).toBeGreaterThanOrEqual(4)
      expect(bp.recommendedModel.length).toBeGreaterThan(0)
    }
  })

  it('injects full specialist Soul, Mission, Role Memory, Skills & compact 1-line teammate summaries', () => {
    const prompt = buildTeamCollaborationPrompt(
      {
        id: 'pm',
        name: 'PM Orchestrator',
        role: ROLE_TERRITORIES.pm.summary,
        roleId: 'pm',
      },
      [
        {
          id: 'fe',
          name: 'Frontend Engineer',
          role: ROLE_TERRITORIES.fe.summary,
          roleId: 'fe',
          mission: ROLE_TERRITORIES.fe.defaultMission,
        },
      ],
      'Use monochrome dark modern chrome.',
    )

    expect(prompt).toContain('[Strategic Thinking]')
    expect(prompt).toContain('[Requirement Management]')
    expect(prompt).toContain('Core coordination & accountability constraints for @PM')
    expect(prompt).toContain('/caveman-compress')
    expect(prompt).toContain('- @FE (Frontend Engineer): Own frontend architecture')
    expect(prompt).not.toContain('- @FE (Frontend Engineer): Own frontend architecture\n\n[Implementation')
  })
})
