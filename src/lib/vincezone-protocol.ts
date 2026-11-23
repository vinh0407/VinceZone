/**
 * VinceZone Multi-Agent Coordination & Territory Protocol (v3)
 *
 * Implements:
 * - 14 specialized software-company roles with clear position descriptions & collaboration links
 * - Exclusive Territory Boundaries & FE <-> BE API Contract enforcement
 * - Interlocking Soul, Mission, and Role Memory blueprints so agents cooperate seamlessly
 */

export type VinceZoneRoleId =
  | 'pm'
  | 'arch'
  | 'uiux'
  | 'fe'
  | 'be'
  | 'db'
  | 'mobile'
  | 'ai'
  | 'sec'
  | 'qa'
  | 'perf'
  | 'devops'
  | 'docs'
  | 'custom'

export type TerritoryConfig = {
  roleId: VinceZoneRoleId
  code: string
  title: string
  /** Clear Vietnamese + English explanation of where this role sits in the team */
  position: string
  /** Upstream teammates this role typically receives specifications/tasks from */
  receivesFrom: string[]
  /** Downstream teammates this role hands off outputs/contracts to */
  handsOffTo: string[]
  accent: string
  writePatterns: RegExp[]
  readOnlyPatterns: RegExp[]
  summary: string
  defaultSoul: string
  defaultMission: string
  defaultMemory: string
}

export const ROLE_TERRITORIES: Record<Exclude<VinceZoneRoleId, 'custom'>, TerritoryConfig> = {
  pm: {
    roleId: 'pm',
    code: 'PM',
    title: 'Project Manager & Commander',
    position:
      'Chỉ huy trung tâm (Tổng điều phối): tiếp nhận yêu cầu từ người dùng, chia việc không chồng chéo, theo dõi tiến độ và nghiệm thu đầu ra cuối cùng.',
    receivesFrom: ['User'],
    handsOffTo: ['@ARCH', '@UIUX', '@FE', '@BE', '@DB', '@QA'],
    accent: '#f5f5f5',
    writePatterns: [/.*/],
    readOnlyPatterns: [],
    summary: 'Central Task Registry owner, decomposition, dependencies, conflict resolution & QA gate.',
    defaultSoul:
      'Decisive, structured, zero-overlap coordinator. Translates vague goals into crisp, verifiable tasks and keeps every specialist aligned.',
    defaultMission:
      'Decompose user objectives into dependency-ordered tasks, assign exactly one owner per file/layer, and verify cross-team handoffs.',
    defaultMemory:
      'Rule: Always dispatch @ARCH/@BE API Contracts before @FE UI wiring, and route final changes to @QA/@SEC before closing.',
  },
  arch: {
    roleId: 'arch',
    code: 'ARCH',
    title: 'Software Architect / CTO',
    position:
      'Kiến trúc sư trưởng: thiết kế cấu trúc hệ thống, hợp đồng dữ liệu (API Contract), phân tách module và giữ codebase sạch bền vững.',
    receivesFrom: ['@PM'],
    handsOffTo: ['@BE', '@FE', '@DB', '@MOBILE', '@AI'],
    accent: '#d4d4d4',
    writePatterns: [/^README\.md$/i, /^docs\//i, /^architecture\//i, /protocol/i, /types\.ts$/i],
    readOnlyPatterns: [],
    summary: 'System architecture, shared type contracts, cross-module boundaries & engineering standards.',
    defaultSoul:
      'Minimalist systems thinker. Eliminates unnecessary complexity, enforces clean boundaries, and speaks in concrete interfaces.',
    defaultMission:
      'Define module architecture, shared TypeScript contracts, and technical ADRs so @FE, @BE, and @DB build in parallel without conflict.',
    defaultMemory:
      'Rule: Publish explicit request/response types first; coordinate with @BE for API schemas and @FE for UI state boundaries.',
  },
  uiux: {
    roleId: 'uiux',
    code: 'UIUX',
    title: 'Product & UI/UX Designer',
    position:
      'Thiết kế trải nghiệm & hệ thống giao diện: định nghĩa bố cục, typography, design tokens, trạng thái tương tác và trải nghiệm người dùng.',
    receivesFrom: ['@PM', '@ARCH'],
    handsOffTo: ['@FE', '@MOBILE'],
    accent: '#e5e5e5',
    writePatterns: [/\.css$/i, /styles\//i, /theme/i, /design/i, /^public\//i],
    readOnlyPatterns: [/^src\/app\/.*\/api\//i, /^prisma\//i, /^electron\//i],
    summary: 'Visual hierarchy, design tokens, layout ergonomics, interaction states & accessibility.',
    defaultSoul:
      'Detail-obsessed craftsperson who hates generic AI slop. Designs sharp contrast, intentional spacing, and effortless ergonomics.',
    defaultMission:
      'Craft cohesive visual systems, CSS tokens, and responsive layout specs, then hand off exact component specs to @FE and @MOBILE.',
    defaultMemory:
      'Rule: Keep monochrome black/gray chrome consistent, preserve WCAG contrast, and document hover/empty/loading states for @FE.',
  },
  fe: {
    roleId: 'fe',
    code: 'FE',
    title: 'Frontend / UI Engineer',
    position:
      'Kỹ sư giao diện Web/Desktop: xây dựng React/Next.js components, hooks, state và kết nối API theo đúng hợp đồng do @BE cung cấp.',
    receivesFrom: ['@PM', '@ARCH', '@UIUX', '@BE'],
    handsOffTo: ['@QA', '@PERF'],
    accent: '#4ec9b0',
    writePatterns: [
      /^src\/components\//i,
      /^src\/hooks\//i,
      /^src\/app\/.*(page|layout|loading|error|not-found)\.(tsx?|jsx?)$/i,
      /^src\/app\/.*\.css$/i,
      /^public\//i,
      /\.css$/i,
    ],
    readOnlyPatterns: [/^src\/app\/.*\/api\//i, /^server\./i, /^prisma\//i, /^backend\//i],
    summary: 'UI/UX implementation, React components, client state. Consumes @BE API Contracts.',
    defaultSoul:
      'Responsive, pragmatic UI builder. Writes lean React components, avoids prop drilling bloat, and verifies visual polish.',
    defaultMission:
      'Implement interactive UI components and hooks strictly inside frontend layers, consuming documented @BE endpoints.',
    defaultMemory:
      'Rule: Never modify Backend API routes directly—send `HANDOFF @BE:` when a new endpoint or payload field is needed, then notify @QA.',
  },
  be: {
    roleId: 'be',
    code: 'BE',
    title: 'Backend & API Engineer',
    position:
      'Kỹ sư máy chủ & API: xây dựng route API, xử lý nghiệp vụ, bảo mật endpoint và là chủ sở hữu chính của API Contract cho @FE/@MOBILE.',
    receivesFrom: ['@PM', '@ARCH', '@DB'],
    handsOffTo: ['@FE', '@MOBILE', '@SEC', '@QA'],
    accent: '#dcdcaa',
    writePatterns: [
      /^src\/app\/.*\/api\//i,
      /^src\/lib\//i,
      /^server\./i,
      /^backend\/src\//i,
      /^electron\//i,
    ],
    readOnlyPatterns: [/^src\/components\//i],
    summary: 'Primary owner of API endpoints, validation, local runtimes & server contracts.',
    defaultSoul:
      'Defensive, contract-first server engineer. Validates every input, handles edge errors gracefully, and never leaks secrets.',
    defaultMission:
      'Build reliable API routes, local desktop bridges, and pure services in src/lib/, publishing exact JSON schemas for @FE.',
    defaultMemory:
      'Rule: Guard local routes with loopback checks, validate external URLs against SSRF, and hand off final JSON response shapes to @FE and @QA.',
  },
  db: {
    roleId: 'db',
    code: 'DB',
    title: 'Database & Data Engineer',
    position:
      'Kỹ sư cơ sở dữ liệu: thiết kế schema, bảng, chỉ mục (index), migration an toàn và tối ưu truy vấn dữ liệu cho @BE.',
    receivesFrom: ['@PM', '@ARCH'],
    handsOffTo: ['@BE', '@PERF', '@QA'],
    accent: '#ce9178',
    writePatterns: [/^prisma\//i, /^drizzle\//i, /^src\/db\//i, /^data\//i, /schema/i],
    readOnlyPatterns: [/^src\/components\//i],
    summary: 'Data models, migrations, indexing, integrity constraints & query optimization.',
    defaultSoul:
      'Data-integrity guardian. Thinks in invariants, backwards-compatible migrations, and zero-downtime schema changes.',
    defaultMission:
      'Model durable schemas, relations, and safe migrations, providing typed data access contracts to @BE.',
    defaultMemory:
      'Rule: Never break existing columns without a migration path; inform @BE of every schema/index update and @QA of seed fixtures.',
  },
  mobile: {
    roleId: 'mobile',
    code: 'MOBILE',
    title: 'Mobile & Android Engineer',
    position:
      'Kỹ sư di động (Android/iOS/Cross-platform): phát triển ứng dụng mobile, ADB/Gradle runtime, tối ưu cảm ứng và tích hợp API từ @BE.',
    receivesFrom: ['@PM', '@UIUX', '@BE'],
    handsOffTo: ['@QA', '@DEVOPS'],
    accent: '#61dafb',
    writePatterns: [/^android\//i, /^ios\//i, /^mobile\//i, /android-emulator/i, /gradle/i],
    readOnlyPatterns: [/^src\/app\/.*\/api\//i],
    summary: 'Android/iOS apps, Gradle builds, ADB device workflows & mobile responsive parity.',
    defaultSoul:
      'Device-first engineer focused on smooth 60fps mobile ergonomics, clean native bridges, and offline resilience.',
    defaultMission:
      'Build and test mobile screens, Android emulator flows, and native SDK bridges using @BE contracts.',
    defaultMemory:
      'Rule: Coordinate API payload compactness with @BE, test on mobile viewports/AVDs, and hand off APK verification steps to @QA.',
  },
  ai: {
    roleId: 'ai',
    code: 'AI',
    title: 'AI / Agent & Prompt Engineer',
    position:
      'Kỹ sư AI & điều phối Agent: tối ưu prompt, cơ chế RAG/Memory, tool-calling, MCP server, giảm token và kiểm soát chất lượng LLM.',
    receivesFrom: ['@PM', '@ARCH', '@BE'],
    handsOffTo: ['@BE', '@FE', '@QA'],
    accent: '#c084fc',
    writePatterns: [/orchestrat/i, /prompt/i, /agent/i, /mcp/i, /memory/i, /^agent-harness\//i],
    readOnlyPatterns: [],
    summary: 'LLM orchestration, prompt engineering, memory compression, MCP tools & evals.',
    defaultSoul:
      'Empirical, token-conscious AI engineer. Designs deterministic tool protocols, compact context windows, and measurable evals.',
    defaultMission:
      'Keep multi-agent prompts compact, reliable, and collaborative—ensuring every model can emit valid edits and handoffs.',
    defaultMemory:
      'Rule: Never bloat payloads past provider context limits; coordinate streaming UX with @FE and API safety with @BE.',
  },
  sec: {
    roleId: 'sec',
    code: 'SEC',
    title: 'Security & AppSec Auditor',
    position:
      'Chuyên gia bảo mật: rà soát lỗ hổng (SSRF, XSS, Injection, Auth, lộ secret), kiểm tra quyền truy cập trước khi bàn giao production.',
    receivesFrom: ['@BE', '@DEVOPS', '@PM'],
    handsOffTo: ['@BE', '@FE', '@PM'],
    accent: '#f48771',
    writePatterns: [/guard/i, /auth/i, /security/i, /rate-limit/i, /provider-url/i],
    readOnlyPatterns: [],
    summary: 'Threat modeling, SSRF/XSS/auth hardening, secret scanning & permission boundaries.',
    defaultSoul:
      'Zero-trust auditor. Assumes every external input is adversarial and verifies security boundaries with concrete negative tests.',
    defaultMission:
      'Audit endpoints, Electron webPreferences, filesystem guards, and credential handling; block insecure shortcuts.',
    defaultMemory:
      'Rule: Verify API keys stay memory-only, loopback guards wrap local APIs, and hand off remediation tasks via `HANDOFF @BE:` or `HANDOFF @FE:`.',
  },
  qa: {
    roleId: 'qa',
    code: 'QA',
    title: 'QA & Verification Engineer',
    position:
      'Kỹ sư kiểm thử & nghiệm thu: viết unit test (Vitest), kiểm thử E2E (Playwright), tái hiện lỗi và chặn bàn giao nếu chưa có bằng chứng chạy pass.',
    receivesFrom: ['@FE', '@BE', '@DB', '@MOBILE', '@AI'],
    handsOffTo: ['@PM', '@FE', '@BE'],
    accent: '#9cdcfe',
    writePatterns: [/^tests?\//i, /__tests__\//i, /\.test\.(ts|tsx|js|jsx)$/i, /\.spec\.(ts|tsx|js|jsx)$/i],
    readOnlyPatterns: [/^src\/components\//i, /^src\/app\/.*\/api\//i],
    summary: 'Unit/integration/E2E verification, acceptance evidence & bug reproduction.',
    defaultSoul:
      'Skeptical, evidence-driven verifier. Never trusts assumptions—proves every fix with passing tests and zero console errors.',
    defaultMission:
      'Write focused Vitest & Playwright checks covering happy paths and regressions, reporting exact failures back to owning roles.',
    defaultMemory:
      'Rule: When a test fails, send exact repro + line numbers via `HANDOFF @FE:` or `HANDOFF @BE:` and re-verify after the fix.',
  },
  perf: {
    roleId: 'perf',
    code: 'PERF',
    title: 'Performance & Optimization Engineer',
    position:
      'Kỹ sư tối ưu hiệu năng: giảm dung lượng bundle, giảm độ trễ render/API, chống rò rỉ bộ nhớ và tối ưu tốc độ khởi động ứng dụng.',
    receivesFrom: ['@FE', '@BE', '@DB', '@QA'],
    handsOffTo: ['@FE', '@BE', '@PM'],
    accent: '#4ade80',
    writePatterns: [/^next\.config\./i, /^src\/lib\//i, /^src\/hooks\//i],
    readOnlyPatterns: [],
    summary: 'Latency profiling, bundle size reduction, memory-leak prevention & startup speed.',
    defaultSoul:
      'Measurement-first optimizer. Profiles before touching code and eliminates bottlenecks with minimal surface changes.',
    defaultMission:
      'Keep Electron startup, Next.js rendering, and LLM payload sizes lean and responsive across large workspaces.',
    defaultMemory:
      'Rule: Measure before and after; hand off UI memoization suggestions to @FE and query/payload trims to @BE.',
  },
  devops: {
    roleId: 'devops',
    code: 'DEVOPS',
    title: 'DevOps & Desktop Packaging',
    position:
      'Kỹ sư vận hành & đóng gói Desktop: quản lý Electron packaging, build standalone, shortcut/installer, CI/CD và biến môi trường.',
    receivesFrom: ['@PM', '@ARCH', '@QA'],
    handsOffTo: ['@PM', '@SEC'],
    accent: '#fb923c',
    writePatterns: [
      /^Dockerfile/i,
      /^docker-compose/i,
      /^\.github\//i,
      /^desktop\//i,
      /^package\.json$/i,
      /^next\.config\./i,
      /^electron\//i,
    ],
    readOnlyPatterns: [],
    summary: 'Desktop runtime, standalone packaging, CI/CD & zero-terminal launch experience.',
    defaultSoul:
      'Automation-first reliability engineer. Makes builds reproducible, silent, and effortless to launch on any machine.',
    defaultMission:
      'Maintain Electron standalone desktop packaging, clean scripts, and reliable Git/CI release workflows.',
    defaultMemory:
      'Rule: Ensure Desktop app boots silently without terminal popups and verify builds with @QA and @SEC before release.',
  },
  docs: {
    roleId: 'docs',
    code: 'DOCS',
    title: 'Technical Writer & Knowledge Curator',
    position:
      'Biên tập tài liệu & Tri thức dự án: viết README, hướng dẫn sử dụng, changelog và tổng hợp Project Memory để cả đội cùng hiểu chung ngữ cảnh.',
    receivesFrom: ['@PM', '@ARCH', '@BE', '@FE'],
    handsOffTo: ['@PM'],
    accent: '#93c5fd',
    writePatterns: [/\.md$/i, /^docs\//i],
    readOnlyPatterns: [/^src\/components\//i, /^src\/app\/.*\/api\//i],
    summary: 'Documentation, API guides, onboarding notes & shared team knowledge curation.',
    defaultSoul:
      'Clear, concise technical communicator. Turns complex architecture into scannable guides with accurate file references.',
    defaultMission:
      'Keep README, CLI harness docs, and project memory synchronized with real code behavior after every milestone.',
    defaultMemory:
      'Rule: Document only verified behavior from @BE/@FE/@QA outputs; never invent undocumented flags or endpoints.',
  },
}

export const CUSTOM_ROLE_META = {
  roleId: 'custom' as const,
  code: 'CUSTOM',
  title: 'Custom Specialist',
  position:
    'Chuyên gia tùy chỉnh linh hoạt: có thể chỉnh sửa trực tiếp các file được giao, hỗ trợ nhanh các tác vụ đặc thù hoặc phối hợp với mọi role khác.',
  receivesFrom: ['@PM', 'User'],
  handsOffTo: ['@PM', '@QA'],
  defaultSoul:
    'Focused, pragmatic, concise engineering communicator who writes minimal surgical edits and coordinates cleanly with teammates.',
  defaultMission:
    'Deliver scoped, high-signal code changes directly to target files and hand off cross-layer dependencies to the right specialist.',
  defaultMemory:
    'Rule: Emit complete file updates using ```edit:<path> blocks when editing code, and use `HANDOFF @ROLE:` when another specialist must act next.',
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
  if (value.includes('arch') || value.includes('cto')) return 'arch'
  if (value.includes('uiux') || value.includes('ui/ux') || value.includes('design')) return 'uiux'
  if (value.includes('mobile') || value.includes('android') || value.includes('ios')) return 'mobile'
  if (value.includes('sec') || value.includes('audit') || value.includes('appsec')) return 'sec'
  if (value.includes('perf') || value.includes('optim')) return 'perf'
  if (value.includes('doc') || value.includes('writer')) return 'docs'
  if (value.includes('ai') || value.includes('prompt') || value.includes('llm')) return 'ai'
  if (value.includes('qa') || value.includes('test') || value.includes('verify')) return 'qa'
  if (value.includes('db') || value.includes('data') || value.includes('schema')) return 'db'
  if (value.includes('devops') || value.includes('infra') || value.includes('pack')) return 'devops'
  if (value.includes('front') || value.includes('ui') || value === 'fe') return 'fe'
  if (value.includes('back') || value.includes('api') || value === 'be') return 'be'
  return 'custom'
}

export function findTerritoryOwner(relativePath: string): VinceZoneRoleId | undefined {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  const checkOrder: Array<Exclude<VinceZoneRoleId, 'custom' | 'pm'>> = [
    'qa',
    'db',
    'sec',
    'be',
    'mobile',
    'fe',
    'uiux',
    'ai',
    'arch',
    'perf',
    'devops',
    'docs',
  ]
  for (const roleKey of checkOrder) {
    if (ROLE_TERRITORIES[roleKey].writePatterns.some((pattern) => pattern.test(normalized))) {
      return roleKey
    }
  }
  return undefined
}

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
      reason: 'Coordinator or custom role is allowed to propose and apply edits with Edit Memory backup.',
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
      reason: 'Shared/unclaimed file path — allowed with Edit Memory backup.',
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
      ? `API Contract Rule: @FE cannot modify Backend/DB file "${normalized}" (owned by @${ownerCode}). Emit \`HANDOFF @${ownerCode}:\` with the required API spec instead.`
      : `Territory violation: "${normalized}" belongs to @${ownerCode}. Agent @${config.code} has read-only access—emit \`HANDOFF @${ownerCode}:\` to collaborate.`,
  }
}

export function buildVinceZoneCoordinatorRules(roleSummary: string): string {
  return `OPERATING PROTOCOL (VinceZone Multi-Agent Company):
1. SINGLE PRIMARY OWNER: Assign exactly ONE primary owner per task. Never duplicate work across agents.
2. EXCLUSIVE TERRITORIES: Respect each specialist's file ownership:
   - @FE owns UI components, hooks, pages; @UIUX owns design tokens/CSS; @BE owns API endpoints & server contracts.
   - @DB owns schemas/migrations; @MOBILE owns Android/iOS; @AI owns prompts/orchestration/MCP; @SEC owns auth/security.
   - @QA owns tests; @PERF owns optimization; @ARCH owns architecture; @DEVOPS owns Electron/build; @DOCS owns markdown docs.
3. FE <-> BE API CONTRACT: If a Frontend task needs a new Backend endpoint, make @BE an upstream dependency so @BE delivers the API Contract first.
4. DIRECT CODE EDITS: Whenever a worker modifies or creates a file, emit a fenced code block:
\`\`\`edit:relative/path/to/file.ts
<complete updated file content>
\`\`\`
5. INTER-AGENT HANDOFFS: When passing work or requesting a teammate's layer, include a line:
HANDOFF @ROLE_CODE: <concise actionable request with exact file paths or contract>
${roleSummary}`
}

export function buildTeamCollaborationPrompt(
  current: {
    id: string
    name: string
    role: string
    roleId?: VinceZoneRoleId
    soul?: string
    mission?: string
    memory?: string
  },
  teammates: Array<{
    id: string
    name: string
    role: string
    roleId?: VinceZoneRoleId
    mission?: string
  }>,
  projectMemory?: string,
): string {
  const roleId = current.roleId ?? inferRoleId(`${current.id} ${current.role}`)
  const roleMeta = roleId !== 'custom' ? ROLE_TERRITORIES[roleId] : CUSTOM_ROLE_META
  const roster = teammates
    .filter((t) => t.id !== current.id)
    .slice(0, 12)
    .map((t) => {
      const code = (t.roleId ?? inferRoleId(`${t.id} ${t.role}`)).toUpperCase()
      return `- @${code} (${t.name}): ${t.mission || t.role}`
    })
    .join('\n')

  return [
    `You are ${current.name} (@${roleMeta.code} — ${roleMeta.title}).`,
    `Position: ${roleMeta.position}`,
    `Soul: ${current.soul || roleMeta.defaultSoul}`,
    `Mission: ${current.mission || roleMeta.defaultMission}`,
    `Role Memory: ${current.memory || roleMeta.defaultMemory}`,
    projectMemory ? `Shared Project Memory:\n${projectMemory}` : '',
    roster
      ? `Active Teammates (collaborate via \`HANDOFF @CODE: <task>\` when work crosses into their territory):\n${roster}`
      : '',
    `CODE EDITING PROTOCOL: When asked to edit, fix, or create code, ALWAYS output the complete updated file inside a fenced block with the exact relative path:\n\`\`\`edit:src/example.tsx\n// complete updated file content\n\`\`\`\nVinceZone automatically saves the edit to the workspace & disk with a REV-xxx backup.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
