import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { executeAgentTool } from '@/lib/agent-tools'
import {
  BUILTIN_PROJECT_TEAM_COMBOS,
  buildPmComboRecommendationPrompt,
  buildTeamFromCombo,
  deleteCustomTeamCombo,
  loadSavedCustomTeamCombos,
  recommendTeamComboForWorkspace,
  saveCustomTeamCombo,
  UNIVERSAL_ELITE_SKILLS,
} from '@/lib/team-combos'
import { getRoleBlueprint, ROLE_TERRITORIES, type VinceZoneRoleId } from '@/lib/vincezone-protocol'

function createMemoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

describe('P10 Project Team Combos, Universal Elite Skills & Deep Agent Tools', () => {
  it('equips every single role (@PM..@CUSTOM) with ponytail, playwright-cli, cli-anything, and unslop/taste on UI/mobile roles', () => {
    const allRoles: VinceZoneRoleId[] = [
      ...(Object.keys(ROLE_TERRITORIES) as VinceZoneRoleId[]),
      'custom',
    ]
    for (const rid of allRoles) {
      const bp = getRoleBlueprint(rid)
      for (const coreSkill of UNIVERSAL_ELITE_SKILLS) {
        expect(bp.defaultSkills).toContain(coreSkill)
      }
      if (['pm', 'uiux', 'fe', 'mobile'].includes(rid)) {
        expect(bp.defaultSkills).toContain('unslop')
        expect(bp.defaultSkills).toContain('design-taste-frontend')
        expect(bp.defaultSkills).toContain('hallmark')
      }
    }
  })

  it('recommends the right Project Team Combo for Web, Mobile, SaaS, AI, and Desktop projects', () => {
    const mobileRec = recommendTeamComboForWorkspace([
      { path: 'android/app/build.gradle.kts', name: 'build.gradle.kts', language: 'kotlin', content: '' },
      { path: 'android/app/src/main/MainActivity.kt', name: 'MainActivity.kt', language: 'kotlin', content: '' },
    ])
    expect(mobileRec.recommended.id).toBe('mobile-app')
    expect(mobileRec.recommended.comboSkills).toContain('unslop')
    expect(mobileRec.recommended.comboSkills).toContain('design-taste-frontend')

    const webRec = recommendTeamComboForWorkspace([
      { path: 'src/components/Hero.tsx', name: 'Hero.tsx', language: 'typescript', content: '' },
      { path: 'src/app/page.tsx', name: 'page.tsx', language: 'typescript', content: '' },
    ])
    expect(webRec.recommended.id).toBe('web-app')
    expect(webRec.recommended.comboSkills).toContain('unslop')

    const advisorPrompt = buildPmComboRecommendationPrompt([
      { path: 'src/components/Hero.tsx', name: 'Hero.tsx', language: 'typescript', content: '' },
    ])
    expect(advisorPrompt).toContain('PROJECT TEAM COMBO ADVISOR')
    expect(advisorPrompt).toContain('Web Application Team')
  })

  it('materializes a Project Team Combo with custom name, per-combo PM/member logic, Role Models, and custom presets', () => {
    const webCombo = BUILTIN_PROJECT_TEAM_COMBOS.find((c) => c.id === 'web-app')!
    const built = buildTeamFromCombo({
      combo: webCombo,
      teamName: 'Acme Storefront Squad',
      projectName: 'AcmeShop',
      selectedRoles: ['arch', 'fe', 'uiux', 'be', 'qa'],
      customPmInstruction: 'Use Tailwind v4 and strict WCAG AA contrast',
      includeCustomAgent: {
        name: 'Stripe Billing Bot',
        role: 'Own Stripe checkout webhooks',
        model: 'freeform-billing-model',
        providerId: 'openai',
      },
      existingAgents: [],
      roleModels: {
        pm: { providerId: 'anthropic', model: 'claude-opus-4' },
        fe: { providerId: 'openai', model: 'gpt-5-fe' },
      },
      defaultProviderId: 'omnirouter',
      defaultModel: 'super-coder',
    })

    // @PM is locked Captain at index 0 with combo logic + skills
    const pm = built.nextAgents[0]
    expect(pm.roleId).toBe('pm')
    expect(pm.commandRank).toBe('captain')
    expect(pm.model).toBe('claude-opus-4')
    expect(pm.soul).toContain('WEB PRODUCT CAPTAIN LOGIC')
    expect(pm.mission).toContain('Acme Storefront Squad')
    expect(pm.mission).toContain('Use Tailwind v4')

    // @FE receives combo logic, unslop + taste skills, and configured Role Model
    const fe = built.nextAgents.find((a) => a.roleId === 'fe')!
    expect(fe.model).toBe('gpt-5-fe')
    expect(fe.soul).toContain('/unslop')
    expect(fe.soul).toContain('/design-taste-frontend')
    expect(fe.soul).toContain('/ponytail')

    // Custom member added with freeform model
    const custom = built.nextAgents.find((a) => a.roleId === 'custom')!
    expect(custom.name).toBe('Stripe Billing Bot')
    expect(custom.model).toBe('freeform-billing-model')

    // Custom combo persistence works
    const storage = createMemoryStorage()
    saveCustomTeamCombo({ ...webCombo, id: 'custom-my-web', name: 'My Custom Web Team' }, storage)
    expect(loadSavedCustomTeamCombos(storage)).toHaveLength(1)
    deleteCustomTeamCombo('custom-my-web', storage)
    expect(loadSavedCustomTeamCombos(storage)).toHaveLength(0)
  })

  it('executes deep workspace file tools (write_file, move_file, delete_file) and returns commandOutput', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'vz-deep-tools-'))
    try {
      const writeRes = await executeAgentTool(
        'write_file',
        { path: 'src/demo.ts', content: 'export const x = 42\n' },
        tmpDir,
      )
      expect(writeRes.ok).toBe(true)

      const moveRes = await executeAgentTool(
        'move_file',
        { from: 'src/demo.ts', to: 'src/renamed.ts' },
        tmpDir,
      )
      expect(moveRes.ok).toBe(true)
      expect(moveRes.fileDeleted?.path).toBe('src/demo.ts')
      expect(moveRes.fileUpdated?.path).toBe('src/renamed.ts')
      expect(await readFile(path.join(tmpDir, 'src/renamed.ts'), 'utf8')).toContain('42')

      const runRes = await executeAgentTool(
        'run_code',
        { code: 'console.log("BUILD_TEST_OK")', language: 'node' },
        tmpDir,
      )
      expect(runRes.ok).toBe(true)
      expect(runRes.commandOutput?.output).toContain('BUILD_TEST_OK')
      expect(runRes.commandOutput?.exitCode).toBe(0)

      const delRes = await executeAgentTool('delete_file', { path: 'src/renamed.ts' }, tmpDir)
      expect(delRes.ok).toBe(true)
      expect(delRes.fileDeleted?.path).toBe('src/renamed.ts')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})
