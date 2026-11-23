import { describe, expect, it } from 'vitest'
import {
  findTerritoryOwner,
  inferRoleId,
  validateTerritoryAccess,
} from '@/lib/vincezone-protocol'

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
