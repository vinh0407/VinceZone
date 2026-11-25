import type {
  Agent,
  CommunicationEvent,
  RoleModelAssignment,
  WorkspaceFile,
} from '@/components/ide/agent-types'
import { assignCaptain, findPmAgent } from '@/lib/command-hierarchy'
import { ROLE_TERRITORIES, type VinceZoneRoleId } from '@/lib/vincezone-protocol'

export type FixedSpecialistRoleId = Exclude<VinceZoneRoleId, 'pm' | 'custom'>

export const VALID_RECRUITABLE_ROLES: ReadonlySet<FixedSpecialistRoleId> = new Set([
  'arch',
  'fe',
  'be',
  'uiux',
  'db',
  'mobile',
  'ai',
  'sec',
  'qa',
  'devops',
  'perf',
  'docs',
])

export type AiRecruitedMemberSpec = {
  role: FixedSpecialistRoleId
  responsibility: string
  ownedPaths?: string[]
}

export type AiRecruitedTeamPlan = {
  projectSummary?: string
  members: AiRecruitedMemberSpec[]
  /** When true, @PM already wrote its own LLM report in chat so we keep @PM's messages intact. */
  preservePmMessages?: boolean
}

/**
 * Normalizes and validates raw AI tool / JSON recruitment members into 1–6 unique fixed specialist roles.
 * Never includes `pm` (always Captain) or `custom` (user-managed freeform specialist).
 */
export function normalizeRecruitedMembers(raw: unknown): AiRecruitedMemberSpec[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<FixedSpecialistRoleId>()
  const result: AiRecruitedMemberSpec[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const rawRole = String(rec.role ?? rec.roleId ?? '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '') as FixedSpecialistRoleId
    if (!VALID_RECRUITABLE_ROLES.has(rawRole) || seen.has(rawRole)) continue
    seen.add(rawRole)
    const meta = ROLE_TERRITORIES[rawRole]
    const responsibility =
      String(rec.responsibility ?? rec.reason ?? rec.mission ?? '').trim().slice(0, 500) ||
      meta.summary
    const rawPaths = rec.ownedPaths ?? rec.owned_paths ?? rec.files
    const ownedPaths = Array.isArray(rawPaths)
      ? rawPaths
          .map((p) => String(p).trim().replace(/\\/g, '/'))
          .filter(Boolean)
          .slice(0, 8)
      : undefined
    result.push({ role: rawRole, responsibility, ownedPaths })
    if (result.length >= 6) break
  }

  return result
}

/**
 * Extracts a fallback ```recruit-team JSON block emitted by models that don't support native tool calling.
 */
export function extractRecruitTeamBlock(text: string): AiRecruitedTeamPlan | null {
  const match = text.match(/```recruit-team\s*([\s\S]*?)```/i)
  if (!match?.[1]) return null
  try {
    const parsed = JSON.parse(match[1].trim()) as {
      projectSummary?: string
      project_summary?: string
      members?: unknown
    }
    const members = normalizeRecruitedMembers(parsed.members)
    if (members.length === 0) return null
    return {
      projectSummary: String(parsed.projectSummary ?? parsed.project_summary ?? '').trim() || undefined,
      members,
      preservePmMessages: true,
    }
  } catch {
    return null
  }
}

/**
 * Resolves the configured model & provider for any fixed specialist position.
 * Explicitly excludes `custom` so custom agents can freely improvise any model.
 */
export function resolveModelForRole(
  roleId: VinceZoneRoleId,
  roleModels: Record<string, RoleModelAssignment> | undefined,
  fallbackProviderId: string,
  fallbackModel: string,
): { providerId: string; model: string } {
  if (roleId === 'custom') {
    return { providerId: fallbackProviderId, model: fallbackModel }
  }
  const configured = roleModels?.[roleId]
  if (configured?.model?.trim()) {
    return {
      providerId: configured.providerId?.trim() || fallbackProviderId,
      model: configured.model.trim(),
    }
  }
  const preset = ROLE_TERRITORIES[roleId]
  return {
    providerId: fallbackProviderId,
    model: preset?.recommendedModel || fallbackModel,
  }
}

type RecruitedRolePlan = {
  roleId: FixedSpecialistRoleId
  reason: string
  ownedPaths: string[]
}

function collectSamplePaths(files: WorkspaceFile[], matchers: RegExp[], limit = 6): string[] {
  const matched: string[] = []
  for (const f of files) {
    const p = f.path.replace(/\\/g, '/')
    if (matchers.some((re) => re.test(p))) {
      matched.push(p)
      if (matched.length >= limit) break
    }
  }
  return matched
}

function detectWorkspaceStack(files: WorkspaceFile[]): string[] {
  const paths = files.map((f) => f.path.replace(/\\/g, '/'))
  const pkgFile = files.find((f) => f.path.replace(/\\/g, '/').toLowerCase() === 'package.json')
  const pkgText = (pkgFile?.content || '').toLowerCase()

  const detectedStack: string[] = []
  if (pkgText.includes('"next"')) detectedStack.push('Next.js')
  if (pkgText.includes('"react"')) detectedStack.push('React')
  if (pkgText.includes('"vue"') || pkgText.includes('"nuxt"')) detectedStack.push('Vue/Nuxt')
  if (pkgText.includes('"tailwindcss"')) detectedStack.push('Tailwind CSS')
  if (pkgText.includes('"electron"')) detectedStack.push('Electron Desktop')
  if (pkgText.includes('"typescript"') || paths.some((p) => /\.tsx?$/i.test(p))) {
    detectedStack.push('TypeScript')
  }
  if (paths.some((p) => /\.py$/i.test(p))) detectedStack.push('Python')
  if (paths.some((p) => /\.kt$|\.java$|gradlew/i.test(p))) detectedStack.push('Android/Kotlin')
  if (paths.some((p) => /pubspec\.yaml|\.dart$/i.test(p))) detectedStack.push('Flutter')
  if (paths.some((p) => /\.go$/i.test(p))) detectedStack.push('Go')
  if (paths.some((p) => /\.rs$|cargo\.toml/i.test(p))) detectedStack.push('Rust')
  if (paths.some((p) => /prisma|drizzle|\.sql$/i.test(p))) detectedStack.push('Database/ORM')
  if (paths.some((p) => /dockerfile|\.github\/workflows/i.test(p))) detectedStack.push('CI/CD & DevOps')
  if (detectedStack.length === 0) detectedStack.push('General Software Project')
  return detectedStack
}

const ROLE_PATH_MATCHERS: Record<FixedSpecialistRoleId, RegExp[]> = {
  arch: [/^package\.json$/i, /^tsconfig\.json$/i, /next\.config/i, /src\/lib\//i, /architecture/i],
  fe: [/src\/components\//i, /src\/hooks\//i, /src\/app\/.*page\.tsx$/i, /\.css$/i],
  uiux: [/\.css$/i, /layout\.tsx$/i, /components\//i, /theme/i],
  be: [/\/api\//i, /src\/lib\//i, /server/i, /routes/i],
  mobile: [/android/i, /mobile/i, /\.kt$/i, /pubspec\.yaml$/i],
  db: [/prisma/i, /drizzle/i, /migrations/i, /\.sql$/i, /schema/i],
  ai: [/orchestrat/i, /agent/i, /mcp/i, /semantic/i, /prompt/i, /chat\/route/i],
  sec: [/guard/i, /auth/i, /security/i, /approval/i, /context-fetch/i],
  devops: [/electron\//i, /\.github\/workflows\//i, /dockerfile/i, /package\.json$/i],
  perf: [/src\/components\//i, /src\/lib\//i],
  docs: [/readme\.md$/i, /docs\//i, /\.md$/i],
  qa: [/__tests__\//i, /\.test\./i, /\.spec\./i, /e2e\//i],
}

function analyzeWorkspaceForRoles(
  files: WorkspaceFile[],
  instruction: string,
): {
  detectedStack: string[]
  plans: RecruitedRolePlan[]
} {
  const paths = files.map((f) => f.path.replace(/\\/g, '/'))
  const joinedPaths = paths.join('\n')
  const lowerInst = instruction.toLowerCase()
  const pkgFile = files.find((f) => f.path.replace(/\\/g, '/').toLowerCase() === 'package.json')
  const pkgText = (pkgFile?.content || '').toLowerCase()
  const detectedStack = detectWorkspaceStack(files)

  const plans: RecruitedRolePlan[] = []
  const addPlan = (roleId: FixedSpecialistRoleId, reason: string) => {
    if (plans.some((p) => p.roleId === roleId)) return
    plans.push({
      roleId,
      reason,
      ownedPaths: collectSamplePaths(files, ROLE_PATH_MATCHERS[roleId]),
    })
  }

  if (files.length >= 6 || /\b(arch|architecture|system design)\b/i.test(lowerInst)) {
    addPlan(
      'arch',
      'Design module boundaries, API/data contracts, and scalable architecture across the repository.',
    )
  }

  const hasFrontend =
    paths.some((p) => /\.(tsx|jsx|vue|svelte|html|css)$/i.test(p) || /components\//i.test(p)) ||
    /\b(fe|frontend|web|ui|landing|react|next)\b/i.test(lowerInst)
  if (hasFrontend) {
    addPlan(
      'fe',
      'Build and maintain web UI components, client state management, user interactions, and API integration.',
    )
  }

  const hasUiDesign =
    paths.some((p) => /styles\.css|tailwind|theme|design/i.test(p)) ||
    /\b(ui|ux|uiux|design|styling|accessibility)\b/i.test(lowerInst)
  if (hasUiDesign && (files.length >= 12 || /\b(uiux|ux|design)\b/i.test(lowerInst))) {
    addPlan(
      'uiux',
      'Own the visual design system, typography, spacing, interaction polish, and accessibility standards.',
    )
  }

  const hasBackend =
    paths.some((p) => /\/api\/|server|routes|controllers|backend|\.py$|\.go$|\.rs$/i.test(p)) ||
    /\b(be|backend|api|server|endpoint|webhook)\b/i.test(lowerInst)
  if (hasBackend) {
    addPlan(
      'be',
      'Implement and maintain API endpoints, server handlers, business logic, concurrency, and system I/O.',
    )
  }

  const hasMobile =
    paths.some((p) => /android|ios|gradlew|\.kt$|pubspec\.yaml|react-native/i.test(p)) ||
    /\b(mobile|android|ios|flutter|emulator)\b/i.test(lowerInst)
  if (hasMobile) {
    addPlan(
      'mobile',
      'Own mobile clients (Android/iOS/Flutter), emulator/ADB workflows, and device compatibility.',
    )
  }

  const hasDb =
    paths.some((p) => /prisma|drizzle|migrations|\.sql$|schema\./i.test(p)) ||
    /\b(db|database|postgres|mysql|sqlite|mongo|schema)\b/i.test(lowerInst)
  if (hasDb) {
    addPlan(
      'db',
      'Design database schemas, safe migrations, indexes, and query performance.',
    )
  }

  const hasAi =
    /orchestrat|agent-tools|mcp-client|semantic-index|prompt|openai|anthropic|langchain/i.test(
      joinedPaths + '\n' + pkgText,
    ) || /\b(ai|llm|agent|rag|ml|embedding|model)\b/i.test(lowerInst)
  if (hasAi) {
    addPlan(
      'ai',
      'Optimize AI/LLM pipelines, tool-calling, context compaction, semantic search, and agent reliability.',
    )
  }

  const hasSec =
    /guard|auth|security|token|secret|encrypt|csrf|ssrf/i.test(joinedPaths) ||
    /\b(sec|security|auth|audit|pentest)\b/i.test(lowerInst)
  if (hasSec) {
    addPlan(
      'sec',
      'Audit security boundaries (injection, SSRF, CSRF, path traversal, authz/authn, secret handling).',
    )
  }

  const hasDevops =
    paths.some((p) => /electron\/|\.github\/workflows|dockerfile|docker-compose|k8s|terraform/i.test(p)) ||
    /\b(devops|ci|cd|docker|deploy|build|electron|installer)\b/i.test(lowerInst)
  if (hasDevops) {
    addPlan(
      'devops',
      'Maintain build pipelines, desktop/container packaging, CI/CD workflows, and release reliability.',
    )
  }

  if (/\b(perf|performance|latency|benchmark|optimize)\b/i.test(lowerInst)) {
    addPlan(
      'perf',
      'Profile bottlenecks and optimize rendering, build times, disk I/O, and API latency.',
    )
  }

  if (/\b(docs|readme|documentation|guide)\b/i.test(lowerInst)) {
    addPlan(
      'docs',
      'Author and maintain accurate technical documentation, README guides, and release notes.',
    )
  }

  // Always recruit QA so changes are verified with automated tests
  addPlan(
    'qa',
    'Write and execute automated unit/integration/E2E tests, hunt edge cases, and block regressions.',
  )

  if (!plans.some((p) => p.roleId === 'fe' || p.roleId === 'be')) {
    addPlan('fe', 'Build core application UI and user interactions.')
    addPlan('be', 'Build core server logic, APIs, and data workflows.')
  }

  // Up to 6 specialists alongside @PM Captain = ideal 1:6 PM grid
  return { detectedStack, plans: plans.slice(0, 6) }
}

/**
 * Recruits or updates the specialist engineering team under Captain @PM in 1:6 PM mode.
 *
 * - When `aiPlan` is provided (from @PM's native `recruit_team` tool call or orchestration plan),
 *   uses the LLM's exact multilingual project analysis, selected specialist roles, and tailored
 *   per-member responsibilities.
 * - When `aiPlan` is omitted (e.g. offline/unconnected fallback or `/recruit`), performs local
 *   repository stack analysis so recruitment still works out of the box.
 */
export function analyzeProjectAndRecruitTeam(input: {
  projectName: string
  files: WorkspaceFile[]
  instruction: string
  existingAgents: Agent[]
  roleModels?: Record<string, RoleModelAssignment>
  defaultProviderId: string
  defaultModel: string
  aiPlan?: AiRecruitedTeamPlan
}): {
  nextAgents: Agent[]
  pmReport: string
  recruitedCount: number
  communicationEvents: CommunicationEvent[]
} {
  const {
    projectName,
    files,
    instruction,
    existingAgents,
    roleModels,
    defaultProviderId,
    defaultModel,
    aiPlan,
  } = input

  const detectedStack = detectWorkspaceStack(files)
  let plans: RecruitedRolePlan[]

  if (aiPlan && aiPlan.members.length > 0) {
    plans = aiPlan.members.slice(0, 6).map((m) => ({
      roleId: m.role,
      reason: m.responsibility,
      ownedPaths:
        m.ownedPaths && m.ownedPaths.length > 0
          ? m.ownedPaths
          : collectSamplePaths(files, ROLE_PATH_MATCHERS[m.role]),
    }))
  } else {
    plans = analyzeWorkspaceForRoles(files, instruction).plans
  }

  const pmMeta = ROLE_TERRITORIES.pm
  const pmModelCfg = resolveModelForRole('pm', roleModels, defaultProviderId, defaultModel)

  const existingPm = findPmAgent(existingAgents)
  const pmId = existingPm?.id || 'pm'

  const rosterSummaryLine = [
    '@PM (Captain)',
    ...plans.map((p) => `@${ROLE_TERRITORIES[p.roleId].code} (${ROLE_TERRITORIES[p.roleId].title})`),
  ].join(', ')

  const recruitedSpecialists: Agent[] = plans.map((plan) => {
    const meta = ROLE_TERRITORIES[plan.roleId]
    const existingRoleAgent = existingAgents.find(
      (a) => a.roleId === plan.roleId || a.id === plan.roleId,
    )
    const modelCfg = resolveModelForRole(plan.roleId, roleModels, defaultProviderId, defaultModel)
    const ownedScopeText =
      plan.ownedPaths.length > 0
        ? plan.ownedPaths.map((p) => `\`${p}\``).join(', ')
        : `Files inside the @${meta.code} territory`

    const tailoredMission = [
      `[RECRUITED BY CAPTAIN @PM FOR PROJECT: ${projectName}]`,
      `Position: @${meta.code} — ${meta.title}`,
      `Team Role: ${meta.position}`,
      `Project-Specific Responsibility: ${plan.reason}`,
      `Owned Paths / Focus Area: ${plan.ownedPaths.join(', ') || `Standard @${meta.code} territory`}`,
      `Receives From: ${meta.receivesFrom.join(', ') || '@PM'} | Hands Off To: ${meta.handsOffTo.join(', ') || '@QA, @PM'}`,
      `Active Team Roster: ${rosterSummaryLine}`,
      '',
      meta.defaultMission,
    ].join('\n')

    const tailoredMemory = [
      `Project: ${projectName} (Stack: ${detectedStack.join(', ')})`,
      `Captain: @PM | Assigned Responsibility: ${plan.reason}`,
      `Key Paths: ${plan.ownedPaths.join(', ') || 'See workspace tree'}`,
      meta.defaultMemory,
    ].join('\n')

    const onboardingMsg = {
      id: `onboard-${plan.roleId}-${Date.now().toString(36)}`,
      role: 'assistant' as const,
      text: [
        `**@${meta.code} — ${meta.title}** onboarded to **${projectName}** (Model: \`${modelCfg.model}\`).`,
        `- **Position:** ${meta.position}`,
        `- **Responsibility:** ${plan.reason}`,
        `- **Owned Scope:** ${ownedScopeText}`,
        `- **Collaboration:** Receives from **${meta.receivesFrom.join(', ') || '@PM'}** → Hands off to **${meta.handsOffTo.join(', ') || '@QA, @PM'}**.`,
        `Role boundaries confirmed. Ready for tasks from Captain @PM.`,
      ].join('\n'),
    }

    const priorMessages = existingRoleAgent?.messages ?? []
    return {
      id: existingRoleAgent?.id || plan.roleId,
      name: meta.title,
      role: meta.summary,
      roleId: plan.roleId,
      commandRank: 'member' as const,
      soul: meta.defaultSoul,
      mission: tailoredMission,
      memory: tailoredMemory,
      providerId: modelCfg.providerId,
      model: modelCfg.model,
      accent: meta.accent,
      status: 'idle' as const,
      messages: [
        ...priorMessages.slice(-4),
        {
          id: `pm-brief-${plan.roleId}-${Date.now().toString(36)}`,
          role: 'agent' as const,
          from: existingPm?.name || 'PM Orchestrator',
          text: `Welcome @${meta.code} to ${projectName}. Your scope: ${plan.reason}`,
        },
        onboardingMsg,
      ],
    }
  })

  // Keep any user-created `@custom` agents intact so custom agents can freely improvise
  const preservedCustomAgents = existingAgents
    .filter((a) => a.roleId === 'custom')
    .map((a) => ({ ...a, commandRank: 'member' as const }))

  const rosterRows = plans
    .map((plan) => {
      const meta = ROLE_TERRITORIES[plan.roleId]
      const modelCfg = resolveModelForRole(plan.roleId, roleModels, defaultProviderId, defaultModel)
      const sample = plan.ownedPaths.slice(0, 2).join(', ') || 'Standard territory'
      return `| **@${meta.code}** | ${meta.title} | \`${modelCfg.model}\` | ${plan.reason} | \`${sample}\` |`
    })
    .join('\n')

  const pmReport = [
    `### Captain @PM Team Roster — **${projectName}**`,
    aiPlan?.projectSummary
      ? `- **Project Analysis:** ${aiPlan.projectSummary}`
      : `- **Detected Stack:** ${detectedStack.join(', ')} (${files.length} files)`,
    `- **Topology:** \`1:6 PM\` — **@PM** is locked as **Team Captain** on the left primary pane.`,
    `- **Recruited Specialists:** **${plans.length}** (+ @PM Captain${preservedCustomAgents.length ? ` + ${preservedCustomAgents.length} freeform @CUSTOM` : ''}).`,
    '',
    '| Role | Title | Assigned Model | Responsibility | Scope |',
    '|---|---|---|---|---|',
    rosterRows,
    '',
    `Every specialist has received their project mission, role memory, territory boundaries, and handoff protocol.`,
  ].join('\n')

  const nextPmMessages = aiPlan?.preservePmMessages
    ? [
        ...(existingPm?.messages ?? []),
        {
          id: `pm-roster-${Date.now().toString(36)}`,
          role: 'tool' as const,
          text: `Recruited ${plans.length} specialist(s) into 1:6 PM mode: ${plans.map((p) => `@${ROLE_TERRITORIES[p.roleId].code}`).join(', ')}.`,
        },
      ]
    : [
        ...(existingPm?.messages ?? []),
        {
          id: `usr-recruit-${Date.now().toString(36)}`,
          role: 'user' as const,
          text: instruction,
          sentAt: new Date().toISOString(),
        },
        {
          id: `pm-report-${Date.now().toString(36)}`,
          role: 'assistant' as const,
          text: pmReport,
        },
      ]

  const updatedPm: Agent = {
    ...(existingPm ?? {
      id: pmId,
      name: 'PM Orchestrator',
      role: pmMeta.summary,
      roleId: 'pm' as const,
      soul: pmMeta.defaultSoul,
      mission: pmMeta.defaultMission,
      memory: pmMeta.defaultMemory,
      accent: pmMeta.accent,
      status: 'idle' as const,
      messages: [],
    }),
    roleId: 'pm',
    commandRank: 'captain',
    providerId: pmModelCfg.providerId,
    model: pmModelCfg.model,
    status: 'idle',
    messages: nextPmMessages,
  }

  const nextAgents = assignCaptain(
    [updatedPm, ...recruitedSpecialists, ...preservedCustomAgents],
    updatedPm.id,
  )

  const nowIso = new Date().toISOString()
  const communicationEvents: CommunicationEvent[] = recruitedSpecialists.map((member, idx) => ({
    id: `ev-recruit-${member.id}-${Date.now().toString(36)}-${idx}`,
    type: 'message.sent',
    kind: 'delegation',
    timestamp: nowIso,
    senderId: updatedPm.id,
    recipientId: member.id,
    label: `PM Recruited @${(member.roleId || 'agent').toUpperCase()}`,
    description: `Assigned ${member.name} to ${projectName}`,
  }))

  return {
    nextAgents,
    pmReport,
    recruitedCount: recruitedSpecialists.length,
    communicationEvents,
  }
}
