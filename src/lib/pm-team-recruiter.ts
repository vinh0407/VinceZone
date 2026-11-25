import type {
  Agent,
  CommunicationEvent,
  RoleModelAssignment,
  WorkspaceFile,
} from '@/components/ide/agent-types'
import { assignCaptain, findPmAgent } from '@/lib/command-hierarchy'
import { ROLE_TERRITORIES, type VinceZoneRoleId } from '@/lib/vincezone-protocol'

type FixedRoleId = Exclude<VinceZoneRoleId, 'custom'>

const RECRUIT_PATTERNS = [
  /\b(tạo|tuyển|lập|xây|dựng|khởi tạo)\s+(nhóm|đội|team|thành viên)\b/i,
  /\bpm\s+(tuyển|lập|tạo)\s+(nhóm|đội|team|thành viên)/i,
  /\b(create|assemble|recruit|form|build|setup|spin up)\s+(a\s+|the\s+)?(team|squad|group|agents)\b/i,
  /\b(tự\s+tuyển|tuyển\s+dụng\s+thành\s+viên|tuyển\s+agent)\b/i,
]

export function isTeamRecruitmentPrompt(text: string): boolean {
  const clean = text.trim()
  if (!clean) return false
  return RECRUIT_PATTERNS.some((re) => re.test(clean))
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
  roleId: FixedRoleId
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

  const plans: RecruitedRolePlan[] = []
  const addPlan = (roleId: FixedRoleId, reason: string, matchers: RegExp[]) => {
    if (plans.some((p) => p.roleId === roleId)) return
    plans.push({
      roleId,
      reason,
      ownedPaths: collectSamplePaths(files, matchers),
    })
  }

  // 1. Architecture — always valuable for multi-module projects or explicit request
  if (files.length >= 6 || /\b(arch|kiến trúc|thiết kế hệ thống)\b/i.test(lowerInst)) {
    addPlan(
      'arch',
      'Thiết kế cấu trúc module, hợp đồng giao diện (API/data contracts) và kiểm soát ranh giới kỹ thuật.',
      [/^package\.json$/i, /^tsconfig\.json$/i, /next\.config/i, /src\/lib\//i, /architecture/i],
    )
  }

  // 2. Frontend
  const hasFrontend =
    paths.some((p) => /\.(tsx|jsx|vue|svelte|html|css)$/i.test(p) || /components\//i.test(p)) ||
    /\b(fe|frontend|web|ui|giao diện|landing|react|next)\b/i.test(lowerInst)
  if (hasFrontend) {
    addPlan(
      'fe',
      'Phát triển toàn bộ giao diện React/Web, quản lý state client, tương tác người dùng và tích hợp API.',
      [/src\/components\//i, /src\/hooks\//i, /src\/app\/.*page\.tsx$/i, /\.css$/i],
    )
  }

  // 3. UI/UX Designer (when UI styling / design / landing / polish is relevant)
  const hasUiDesign =
    paths.some((p) => /styles\.css|tailwind|theme|design/i.test(p)) ||
    /\b(ui|ux|uiux|design|thiết kế|thẩm mỹ|giao diện đẹp)\b/i.test(lowerInst)
  if (hasUiDesign && (files.length >= 12 || /\b(uiux|ux|design|thiết kế)\b/i.test(lowerInst))) {
    addPlan(
      'uiux',
      'Chuẩn hóa hệ thống màu sắc, typography, spacing, trạng thái tương tác và trải nghiệm người dùng.',
      [/\.css$/i, /layout\.tsx$/i, /components\//i],
    )
  }

  // 4. Backend / API
  const hasBackend =
    paths.some((p) => /\/api\/|server|routes|controllers|backend|\.py$|\.go$|\.rs$/i.test(p)) ||
    /\b(be|backend|api|server|endpoint|webhook)\b/i.test(lowerInst)
  if (hasBackend) {
    addPlan(
      'be',
      'Xây dựng và duy trì các API route/server handler, business logic, xử lý đồng thời và I/O hệ thống.',
      [/\/api\//i, /src\/lib\//i, /server/i, /routes/i],
    )
  }

  // 5. Mobile
  const hasMobile =
    paths.some((p) => /android|ios|gradlew|\.kt$|pubspec\.yaml|react-native/i.test(p)) ||
    /\b(mobile|android|ios|flutter|app di động|giả lập)\b/i.test(lowerInst)
  if (hasMobile) {
    addPlan(
      'mobile',
      'Phụ trách mã nguồn di động (Android/iOS/Flutter), emulator/ADB và tương thích thiết bị.',
      [/android/i, /mobile/i, /\.kt$/i, /pubspec\.yaml$/i],
    )
  }

  // 6. Database
  const hasDb =
    paths.some((p) => /prisma|drizzle|migrations|\.sql$|schema\./i.test(p)) ||
    /\b(db|database|csdl|postgres|mysql|sqlite|mongo|schema)\b/i.test(lowerInst)
  if (hasDb) {
    addPlan(
      'db',
      'Thiết kế schema cơ sở dữ liệu, migration an toàn, chỉ mục (index) và tối ưu truy vấn.',
      [/prisma/i, /drizzle/i, /migrations/i, /\.sql$/i, /schema/i],
    )
  }

  // 7. AI / LLM Engineer
  const hasAi =
    /orchestrat|agent-tools|mcp-client|semantic-index|prompt|openai|anthropic|langchain/i.test(
      joinedPaths + '\n' + pkgText,
    ) || /\b(ai|llm|agent|rag|ml|embedding|model)\b/i.test(lowerInst)
  if (hasAi) {
    addPlan(
      'ai',
      'Tối ưu pipeline AI/LLM, tool-calling, context management, semantic search và chất lượng phản hồi Agent.',
      [/orchestrat/i, /agent/i, /mcp/i, /semantic/i, /prompt/i, /chat\/route/i],
    )
  }

  // 8. Security
  const hasSec =
    /guard|auth|security|token|secret|encrypt|csrf|ssrf/i.test(joinedPaths) ||
    /\b(sec|security|bảo mật|auth|audit|pentest)\b/i.test(lowerInst)
  if (hasSec) {
    addPlan(
      'sec',
      'Kiểm toán bảo mật (injection, SSRF, CSRF, path traversal, authz/authn, rò rỉ secret) trước khi bàn giao.',
      [/guard/i, /auth/i, /security/i, /approval/i, /context-fetch/i],
    )
  }

  // 9. DevOps / Packaging
  const hasDevops =
    paths.some((p) => /electron\/|\.github\/workflows|dockerfile|docker-compose|k8s|terraform/i.test(p)) ||
    /\b(devops|ci|cd|docker|deploy|build|electron|installer)\b/i.test(lowerInst)
  if (hasDevops) {
    addPlan(
      'devops',
      'Quản lý quy trình build, đóng gói desktop/container, CI/CD pipelines và độ ổn định phát hành.',
      [/electron\//i, /\.github\/workflows\//i, /dockerfile/i, /package\.json$/i],
    )
  }

  // 10. Performance (explicit or large codebase)
  if (/\b(perf|hiệu năng|tối ưu tốc độ|lag|chậm|benchmark)\b/i.test(lowerInst)) {
    addPlan(
      'perf',
      'Đo đạc bottleneck, tối ưu render React, thời gian build, I/O đĩa và độ trễ API.',
      [/src\/components\//i, /src\/lib\//i],
    )
  }

  // 11. Docs (explicit)
  if (/\b(docs|tài liệu|readme|hướng dẫn|documentation)\b/i.test(lowerInst)) {
    addPlan(
      'docs',
      'Biên soạn tài liệu kỹ thuật, README, hướng dẫn cài đặt và changelog chính xác theo code thực tế.',
      [/readme\.md$/i, /docs\//i, /\.md$/i],
    )
  }

  // 12. QA Verification — ALWAYS recruit to ensure every code change is tested & verified!
  addPlan(
    'qa',
    'Viết và chạy kiểm thử tự động (unit/integration/E2E), săn edge case và xác minh không có lỗi hồi quy.',
    [/__tests__\//i, /\.test\./i, /\.spec\./i, /e2e\//i],
  )

  // Guarantee at least FE or BE if repo was tiny/empty
  if (!plans.some((p) => p.roleId === 'fe' || p.roleId === 'be')) {
    addPlan('fe', 'Xây dựng giao diện và tương tác chính của ứng dụng.', [/src\//i])
    addPlan('be', 'Xây dựng logic xử lý, API và dữ liệu lõi của ứng dụng.', [/src\//i])
  }

  // Keep team focused & crisp (up to 6 specialists alongside PM = ideal 1:6 PM grid!)
  const prioritized = plans.slice(0, 6)
  return { detectedStack, plans: prioritized }
}

/**
 * PM analyzes the project & user instruction, recruits the exact specialist team
 * needed (with pre-configured Role Models from Settings), and writes clear
 * role-specific onboarding instructions so every member knows their exact position.
 */
export function analyzeProjectAndRecruitTeam(input: {
  projectName: string
  files: WorkspaceFile[]
  instruction: string
  existingAgents: Agent[]
  roleModels?: Record<string, RoleModelAssignment>
  defaultProviderId: string
  defaultModel: string
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
  } = input

  const { detectedStack, plans } = analyzeWorkspaceForRoles(files, instruction)
  const pmMeta = ROLE_TERRITORIES.pm
  const pmModelCfg = resolveModelForRole('pm', roleModels, defaultProviderId, defaultModel)

  // Preserve existing PM messages if PM already exists
  const existingPm = findPmAgent(existingAgents)
  const pmId = existingPm?.id || 'pm'

  const rosterSummaryLine = [
    `@PM (Đội trưởng)`,
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
        : 'Các file thuộc lãnh thổ chuyên môn của vị trí này trong dự án'

    const tailoredMission = [
      `[TUYỂN DỤNG BỞI ĐỘI TRƯỞNG @PM CHO DỰ ÁN: ${projectName}]`,
      `Vị trí của bạn: @${meta.code} — ${meta.title}`,
      `Vai trò trong nhóm: ${meta.position}`,
      `Nhiệm vụ cụ thể cho dự án này: ${plan.reason}`,
      `Phạm vi file/thư mục tiêu biểu cần nắm: ${plan.ownedPaths.join(', ') || 'Theo territory chuẩn của @' + meta.code}`,
      `Nhận yêu cầu từ: ${meta.receivesFrom.join(', ') || '@PM'} | Bàn giao đầu ra cho: ${meta.handsOffTo.join(', ') || '@QA, @PM'}`,
      `Đội hình hiện tại: ${rosterSummaryLine}`,
      '',
      meta.defaultMission,
    ].join('\n')

    const tailoredMemory = [
      `Dự án: ${projectName} (Stack: ${detectedStack.join(', ')})`,
      `Đội trưởng: @PM | Nhiệm vụ được giao: ${plan.reason}`,
      `File tiêu biểu: ${plan.ownedPaths.join(', ') || 'Xem cây thư mục dự án'}`,
      meta.defaultMemory,
    ].join('\n')

    const onboardingMsg = {
      id: `onboard-${plan.roleId}-${Date.now().toString(36)}`,
      role: 'assistant' as const,
      text: [
        `**@${meta.code} — ${meta.title}** đã nhận vị trí trong dự án **${projectName}** (Model: \`${modelCfg.model}\`).`,
        `- **Vị trí của tôi:** ${meta.position}`,
        `- **Trách nhiệm chính:** ${plan.reason}`,
        `- **Phạm vi phụ trách:** ${ownedScopeText}`,
        `- **Phối hợp:** Nhận spec từ **${meta.receivesFrom.join(', ') || '@PM'}** → Bàn giao cho **${meta.handsOffTo.join(', ') || '@QA, @PM'}**.`,
        `Tôi đã hiểu rõ ranh giới công việc và sẵn sàng nhận lệnh từ Đội trưởng @PM.`,
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
          text: `Chào mừng @${meta.code} gia nhập dự án ${projectName}. Nhiệm vụ của bạn: ${plan.reason}`,
        },
        onboardingMsg,
      ],
    }
  })

  // Keep any user-created `@custom` agents intact (so custom agents can freely improvise!)
  const preservedCustomAgents = existingAgents
    .filter((a) => a.roleId === 'custom')
    .map((a) => ({ ...a, commandRank: 'member' as const }))

  const rosterRows = plans
    .map((plan) => {
      const meta = ROLE_TERRITORIES[plan.roleId]
      const modelCfg = resolveModelForRole(plan.roleId, roleModels, defaultProviderId, defaultModel)
      const sample = plan.ownedPaths.slice(0, 2).join(', ') || 'Theo territory chuẩn'
      return `| **@${meta.code}** | ${meta.title} | \`${modelCfg.model}\` | ${plan.reason} | \`${sample}\` |`
    })
    .join('\n')

  const pmReport = [
    `### Đội trưởng @PM đã phân tích dự án **${projectName}** & hoàn tất tuyển nhóm`,
    `- **Stack phát hiện:** ${detectedStack.join(', ')} (${files.length} file)`,
    `- **Chế độ đội hình:** \`1:6 PM\` — **@PM** giữ vai trò **Đội trưởng (Captain)** ở khung lớn bên trái.`,
    `- **Tổng số thành viên tuyển mới/cập nhật:** **${plans.length} chuyên gia** (+ @PM Đội trưởng${preservedCustomAgents.length ? ` + ${preservedCustomAgents.length} @CUSTOM tự do` : ''}).`,
    '',
    '| Vị trí | Chức danh | Model đã gán | Nhiệm vụ chính | Phạm vi tiêu biểu |',
    '|---|---|---|---|---|',
    rosterRows,
    '',
    `Mỗi thành viên đã nhận hồ sơ bàn giao (Mission, Role Memory, ranh giới sở hữu file & luồng phối hợp) ngay trong khung chat riêng. Bạn có thể ra lệnh trực tiếp cho **@PM** để bắt đầu điều phối cả nhóm!`,
  ].join('\n')

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
    messages: [
      ...(existingPm?.messages ?? []),
      {
        id: `usr-recruit-${Date.now().toString(36)}`,
        role: 'user',
        text: instruction,
        sentAt: new Date().toISOString(),
      },
      {
        id: `pm-report-${Date.now().toString(36)}`,
        role: 'assistant',
        text: pmReport,
      },
    ],
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
    label: `PM Tuyển @${(member.roleId || 'agent').toUpperCase()}`,
    description: `Giao vị trí ${member.name} trong dự án ${projectName}`,
  }))

  return {
    nextAgents,
    pmReport,
    recruitedCount: recruitedSpecialists.length,
    communicationEvents,
  }
}
