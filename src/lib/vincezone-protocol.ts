/**
 * VinceZone Multi-Agent Coordination & Territory Protocol (v2 — Upgraded TypeScript Engine)
 *
 * Implements:
 * - Role-based Exclusive Territory Boundaries (prevents agents overwriting each other's layers)
 * - FE vs BE API Contract rule (Frontend cannot overwrite Backend API endpoints)
 * - Centralized Task Registry lifecycle (BACKLOG -> ASSIGNED -> READY -> IN_PROGRESS -> REVIEW -> QA -> COMPLETED)
 * - Control Room Message modes: execute | probe | handoff | conflict
 */

export type VinceZoneRoleId = 'pm' | 'arch' | 'fe' | 'be' | 'db' | 'qa' | 'devops' | 'custom'

export type TerritoryConfig = {
  roleId: VinceZoneRoleId
  code: string
  title: string
  accent: string
  writePatterns: RegExp[]
  readOnlyPatterns: RegExp[]
  summary: string
}

export const ROLE_TERRITORIES: Record<Exclude<VinceZoneRoleId, 'custom'>, TerritoryConfig> = {
  pm: {
    roleId: 'pm',
    code: 'PM',
    title: 'Project Manager & Orchestrator',
    accent: '#0078d4',
    writePatterns: [/.*/],
    readOnlyPatterns: [],
    summary: 'Central Task Registry owner, decomposition, dependencies, conflict resolution & QA gate.',
  },
  arch: {
    roleId: 'arch',
    code: 'ARCH',
    title: 'Software Architect / CTO',
    accent: '#c586c0',
    writePatterns: [/^AGENTS\.md$/i, /^README\.md$/i, /^docs\//i, /^architecture\//i, /protocol/i],
    readOnlyPatterns: [],
    summary: 'System architecture, API contracts, cross-module boundaries & standards.',
  },
  fe: {
    roleId: 'fe',
    code: 'FE',
    title: 'Frontend / UI Engineer',
    accent: '#4ec9b0',
    writePatterns: [
      /^src\/components\//i,
      /^src\/hooks\//i,
      /^src\/app\/.*(page|layout|loading|error|not-found)\.(tsx?|jsx?)$/i,
      /^src\/app\/.*\.css$/i,
      /^public\//i,
      /^desktop\/ui\//i,
      /\.css$/i,
    ],
    readOnlyPatterns: [/^src\/app\/.*\/api\//i, /^server\./i, /^src\/collections\//i, /^backend\//i],
    summary: 'UI/UX, components, styles. Consumes API Contracts; forbidden from modifying Backend APIs.',
  },
  be: {
    roleId: 'be',
    code: 'BE',
    title: 'Backend & API Engineer',
    accent: '#dcdcaa',
    writePatterns: [
      /^src\/app\/.*\/api\//i,
      /^src\/lib\//i,
      /^server\./i,
      /^backend\/src\//i,
      /^electron\//i,
    ],
    readOnlyPatterns: [/^src\/components\//i, /^desktop\/ui\//i],
    summary: 'Primary owner of API endpoints, validation, security & server contracts.',
  },
  db: {
    roleId: 'db',
    code: 'DB',
    title: 'Database & Schema Engineer',
    accent: '#ce9178',
    writePatterns: [/^src\/collections\//i, /^src\/payload\.config\.ts$/i, /^prisma\//i, /^data\//i, /schema/i],
    readOnlyPatterns: [/^src\/components\//i],
    summary: 'Collections, database schemas, ownership access rules & migrations.',
  },
  qa: {
    roleId: 'qa',
    code: 'QA',
    title: 'QA & Verification Engineer',
    accent: '#9cdcfe',
    writePatterns: [/^tests?\//i, /__tests__\//i, /\.test\.(ts|tsx|js|jsx)$/i, /\.spec\.(ts|tsx|js|jsx)$/i],
    readOnlyPatterns: [/^src\/components\//i, /^src\/app\/.*\/api\//i],
    summary: 'Unit/integration/E2E verification, acceptance evidence & bug reproduction.',
  },
  devops: {
    roleId: 'devops',
    code: 'DEVOPS',
    title: 'DevOps & Desktop Packaging',
    accent: '#f48771',
    writePatterns: [
      /^Dockerfile/i,
      /^docker-compose/i,
      /^\.github\//i,
      /^scripts\//i,
      /^package\.json$/i,
      /^next\.config\./i,
      /^electron\//i,
    ],
    readOnlyPatterns: [],
    summary: 'Desktop runtime, CI/CD, build configuration & container packaging.',
  },
}

export type TerritoryCheckResult = {
  allowed: boolean
  roleId: VinceZoneRoleId
  path: string
  ownerRole?: VinceZoneRoleId
  reason: string
  requiresApiContract?: boolean
}

export function inferRoleId(agentIdOrRole: string): VinceZoneRoleId {
  const value = agentIdOrRole.toLowerCase()
  if (value.includes('pm') || value.includes('orchestr') || value.includes('coordinator')) return 'pm'
  if (value.includes('arch') || value.includes('cto') || value.includes('lead')) return 'arch'
  if (value.includes('qa') || value.includes('test') || value.includes('verify')) return 'qa'
  if (value.includes('db') || value.includes('data') || value.includes('schema')) return 'db'
  if (value.includes('devops') || value.includes('infra') || value.includes('desk')) return 'devops'
  if (value.includes('front') || value.includes('ui') || value === 'fe') return 'fe'
  if (value.includes('back') || value.includes('api') || value === 'be') return 'be'
  return 'custom'
}

export function findTerritoryOwner(relativePath: string): VinceZoneRoleId | undefined {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  const checkOrder: Array<Exclude<VinceZoneRoleId, 'custom' | 'pm'>> = [
    'qa',
    'db',
    'be',
    'fe',
    'arch',
    'devops',
  ]
  for (const roleKey of checkOrder) {
    if (ROLE_TERRITORIES[roleKey].writePatterns.some((pattern) => pattern.test(normalized))) {
      return roleKey
    }
  }
  return undefined
}

/**
 * Validate whether an agent with `roleId` is permitted to write to `relativePath`.
 * Enforces VinceZone's Exclusive Territory Boundaries & FE-vs-BE API Contract rule.
 */
export function validateTerritoryAccess(
  roleId: VinceZoneRoleId,
  relativePath: string,
): TerritoryCheckResult {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')

  if (roleId === 'pm' || roleId === 'custom') {
    return {
      allowed: true,
      roleId,
      path: normalized,
      reason: 'Coordinator or custom role is allowed to propose edits with review.',
    }
  }

  const config = ROLE_TERRITORIES[roleId]
  const isReadOnlyBlocked = config.readOnlyPatterns.some((pattern) => pattern.test(normalized))
  const isOwner = config.writePatterns.some((pattern) => pattern.test(normalized))

  if (isOwner && !isReadOnlyBlocked) {
    return {
      allowed: true,
      roleId,
      path: normalized,
      ownerRole: roleId,
      reason: `Within @${config.code} exclusive territory.`,
    }
  }

  const ownerRole = findTerritoryOwner(normalized)
  if (!ownerRole && !isReadOnlyBlocked) {
    return {
      allowed: true,
      roleId,
      path: normalized,
      reason: 'Shared/unclaimed file path — allowed with diff approval.',
    }
  }

  const requiresApiContract = roleId === 'fe' && (ownerRole === 'be' || ownerRole === 'db')
  const ownerCode =
    ownerRole && ownerRole !== 'custom' ? ROLE_TERRITORIES[ownerRole].code : 'OTHER'

  return {
    allowed: false,
    roleId,
    path: normalized,
    ownerRole,
    requiresApiContract,
    reason: requiresApiContract
      ? `API Contract Rule: @FE cannot modify Backend/DB file "${normalized}" (owned by @${ownerCode}). Send an API Specification Request to @${ownerCode} instead.`
      : `Territory violation: "${normalized}" belongs to @${ownerCode}. Agent @${config.code} has read-only access to prevent conflicting edits.`,
  }
}

export function buildVinceZoneCoordinatorRules(roleSummary: string): string {
  return `OPERATING PROTOCOL (VinceZone Multi-Agent Company):
1. SINGLE PRIMARY OWNER: Assign exactly ONE primary owner per task. Never duplicate work across agents.
2. EXCLUSIVE TERRITORIES: Respect each specialist's file ownership:
   - @FE owns UI components, styles, pages — NEVER modifies Backend API routes or DB schemas.
   - @BE owns API endpoints, server lib, validation — Primary Owner of API Contracts.
   - @DB owns schemas/collections; @QA owns tests; @ARCH owns architecture/docs; @DEVOPS owns build/packaging.
3. FE <-> BE API CONTRACT: If a Frontend task needs a new Backend endpoint, make the Backend API task an upstream dependency so @BE delivers the API Contract first.
4. MANDATORY VERIFIABLE HANDOFF: Every worker must return concrete files, decisions, and verification notes.
${roleSummary}`
}
