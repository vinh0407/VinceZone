import type { Agent } from '@/components/ide/agent-types'
import { inferRoleId, ROLE_TERRITORIES, type VinceZoneRoleId } from './vincezone-protocol'

export type BridgeMessageKind = 'handoff' | 'reply' | 'broadcast' | 'code-share' | 'question'

export type BridgeMessage = {
  id: string
  fromAgentId: string
  fromAgentName: string
  fromRole: string
  toAgentId: string
  toAgentName: string
  toRole: string
  kind: BridgeMessageKind
  content: string
  relatedFiles?: string[]
  timestamp: string
}

export type BridgeRoute = {
  targetAgentId: string
  targetAgentName: string
  targetRoleCode: string
  message: string
  kind: BridgeMessageKind
}

const ROLE_ALIASES: Record<string, VinceZoneRoleId> = {
  pm: 'pm',
  orchestrator: 'pm',
  lead: 'pm',
  manager: 'pm',
  arch: 'arch',
  architect: 'arch',
  fe: 'fe',
  frontend: 'fe',
  ui: 'fe',
  uiux: 'uiux',
  ux: 'uiux',
  design: 'uiux',
  designer: 'uiux',
  be: 'be',
  backend: 'be',
  api: 'be',
  server: 'be',
  db: 'db',
  database: 'db',
  sql: 'db',
  mobile: 'mobile',
  android: 'mobile',
  ios: 'mobile',
  ai: 'ai',
  ml: 'ai',
  qa: 'qa',
  test: 'qa',
  tester: 'qa',
  sec: 'sec',
  security: 'sec',
  perf: 'perf',
  performance: 'perf',
  devops: 'devops',
  ops: 'devops',
  infra: 'devops',
  docs: 'docs',
  doc: 'docs',
  reviewer: 'qa',
  review: 'qa',
  custom: 'custom',
}

export function resolveAgentByRoleOrName(
  token: string,
  agents: Agent[],
  excludeAgentId?: string,
): Agent | null {
  const clean = token.trim().replace(/^@/, '').toLowerCase()
  if (!clean) return null

  const pool = agents.filter((a) => a.id !== excludeAgentId)
  if (pool.length === 0) return null

  const aliasedRole = ROLE_ALIASES[clean]

  // 1. Exact roleId or role code match
  const byRole = pool.find((agent) => {
    const rid = agent.roleId ?? inferRoleId(`${agent.id} ${agent.role}`)
    if (aliasedRole && rid === aliasedRole) return true
    if (rid === clean) return true
    const code = rid === 'custom' ? 'custom' : ROLE_TERRITORIES[rid].code.toLowerCase()
    return code === clean
  })
  if (byRole) return byRole

  // 2. Exact id or name match
  const byIdOrName = pool.find(
    (agent) =>
      agent.id.toLowerCase() === clean ||
      agent.name.toLowerCase() === clean ||
      agent.name.toLowerCase().replace(/\s+/g, '') === clean,
  )
  if (byIdOrName) return byIdOrName

  // 3. Partial name or role description match
  return (
    pool.find(
      (agent) =>
        agent.name.toLowerCase().includes(clean) || agent.role.toLowerCase().includes(clean),
    ) ?? null
  )
}

/**
 * Extracts structured or natural inter-agent handoffs from either user input or AI output:
 * - HANDOFF @BE: Implement /api/health
 * - DELEGATE @FE: Build login form
 * - ASK @QA: Verify edge cases
 * - TO @ARCH: Review schema
 * - @ALL: Sync on new API contract
 * - Leading @ROLE mention: "@BE add rate limiting"
 */
export function extractBridgeRoutes(
  text: string,
  agents: Agent[],
  senderId: string,
): BridgeRoute[] {
  const routes: BridgeRoute[] = []
  const seenTargets = new Set<string>()

  const pushTarget = (target: Agent, message: string, kind: BridgeMessageKind) => {
    const cleanMsg = message.trim()
    if (!cleanMsg || seenTargets.has(target.id)) return
    seenTargets.add(target.id)
    const rid = target.roleId ?? inferRoleId(`${target.id} ${target.role}`)
    routes.push({
      targetAgentId: target.id,
      targetAgentName: target.name,
      targetRoleCode: rid === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[rid].code,
      message: cleanMsg,
      kind,
    })
  }

  // Strip fenced code blocks so code comments mentioning @something don't falsely trigger handoffs
  const withoutCodeFences = text.replace(/```[\s\S]*?```/g, '')

  // Pattern 1: Explicit protocol directives (HANDOFF / DELEGATE / ASK / NOTIFY / TO / ->)
  const directiveRegex =
    /(?:^|\n)\s*(?:[-*]\s*)?(?:(HANDOFF|DELEGATE|ASK|NOTIFY|TO|BRIDGE|→|->)\s+)?@([A-Za-z0-9_-]{2,24})\s*[:\-–]\s*(.+)/gi

  let match: RegExpExecArray | null
  while ((match = directiveRegex.exec(withoutCodeFences)) !== null) {
    const verb = (match[1] || 'HANDOFF').toUpperCase()
    const rawToken = match[2]
    const body = match[3]
    const kind: BridgeMessageKind =
      verb === 'ASK' ? 'question' : rawToken.toUpperCase() === 'ALL' ? 'broadcast' : 'handoff'

    if (rawToken.toUpperCase() === 'ALL' || rawToken.toUpperCase() === 'TEAM') {
      for (const peer of agents.filter((a) => a.id !== senderId).slice(0, 4)) {
        pushTarget(peer, body, 'broadcast')
      }
      continue
    }

    const target = resolveAgentByRoleOrName(rawToken, agents, senderId)
    if (target) pushTarget(target, body, kind)
  }

  // Pattern 2: Direct leading @ROLE <instruction> without colon (common when users type "@BE fix api")
  if (routes.length === 0) {
    const leadingMatch = withoutCodeFences.trim().match(/^@([A-Za-z0-9_-]{2,24})\s+([\s\S]+)/)
    if (leadingMatch) {
      const rawToken = leadingMatch[1]
      const body = leadingMatch[2].trim()
      if (rawToken.toUpperCase() === 'ALL' || rawToken.toUpperCase() === 'TEAM') {
        for (const peer of agents.filter((a) => a.id !== senderId).slice(0, 4)) {
          pushTarget(peer, body, 'broadcast')
        }
      } else {
        const target = resolveAgentByRoleOrName(rawToken, agents, senderId)
        if (target) pushTarget(target, body, 'handoff')
      }
    }
  }

  return routes.slice(0, 4)
}

/**
 * Formats recent shared bridge messages and live teammate roster for system prompt injection,
 * ensuring every agent sees what teammates just decided, asked, or modified.
 */
export function buildBridgeContextPrompt(
  currentAgent: Agent,
  allAgents: Agent[],
  bridgeMessages: BridgeMessage[],
): string {
  const teammates = allAgents
    .filter((a) => a.id !== currentAgent.id)
    .map((a) => {
      const rid = a.roleId ?? inferRoleId(`${a.id} ${a.role}`)
      const code = rid === 'custom' ? 'CUSTOM' : ROLE_TERRITORIES[rid].code
      return `- @${code} (${a.name}): ${a.mission || a.role}`
    })
    .join('\n')

  const recentFeed = bridgeMessages
    .slice(-10)
    .map((msg) => {
      const filesTag = msg.relatedFiles?.length ? ` [files: ${msg.relatedFiles.join(', ')}]` : ''
      return `[${msg.timestamp.slice(11, 19)}] ${msg.fromAgentName} (@${msg.fromRole}) -> ${msg.toAgentName} (@${msg.toRole}) (${msg.kind}): ${msg.content.slice(0, 260)}${filesTag}`
    })
    .join('\n')

  return [
    '=== MULTI-AGENT COMMUNICATION BRIDGE (LIVE BUS) ===',
    'You are connected to your teammates via the VinceZone Agent Bridge.',
    'Teammates you can message directly:',
    teammates || '- (No other agents configured)',
    'How to communicate with another agent:',
    '1. Preferred (when tools are enabled): call the `message_agent` tool with `{ to_role, message, files }`.',
    '2. Text protocol (always active): emit a line starting with `HANDOFF @ROLE: <clear task or question>` (e.g., `HANDOFF @BE: Expose GET /api/health` or `HANDOFF @QA: Run tests for auth`).',
    '3. Whenever you finish a task delegated by a teammate, your response is automatically relayed back to them on the Bridge Bus.',
    recentFeed
      ? `Recent Team Bridge Messages (shared context):\n${recentFeed}`
      : 'Recent Team Bridge Messages: (none yet)',
  ].join('\n')
}
