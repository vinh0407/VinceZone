import type {
  Agent,
  CommunicationEvent,
  RoleModelAssignment,
  WorkspaceFile,
} from '@/components/ide/agent-types'
import { assignCaptain, findPmAgent } from '@/lib/command-hierarchy'
import { resolveModelForRole, type FixedSpecialistRoleId } from '@/lib/pm-team-recruiter'
import {
  CUSTOM_ROLE_META,
  ROLE_TERRITORIES,
  type VinceZoneRoleId,
} from '@/lib/vincezone-protocol'

/**
 * Core high-IQ & token-saving skills injected into EVERY position (@PM through @CUSTOM)
 * so every agent writes surgical code, compresses context, drives CLI/browser tools, and verifies before completion.
 */
export const UNIVERSAL_ELITE_SKILLS: readonly string[] = [
  'ponytail',
  'playwright-cli',
  'cli-anything',
  'headroom',
  'caveman-compress',
  'karpathy-guidelines',
  'surgical-patch',
  'verification-before-completion',
]

export type SpecialistComboOverride = {
  roleId: FixedSpecialistRoleId
  responsibility: string
  soulAddon: string
  missionAddon: string
  memoryAddon: string
  extraSkills: string[]
}

export type ProjectTeamCombo = {
  id: string
  name: string
  badge: string
  tagline: string
  description: string
  roles: FixedSpecialistRoleId[]
  comboSkills: string[]
  pmLogic: {
    soulAddon: string
    missionAddon: string
    memoryAddon: string
  }
  specialistLogic: Record<string, SpecialistComboOverride>
  isCustom?: boolean
}

export const BUILTIN_PROJECT_TEAM_COMBOS: readonly ProjectTeamCombo[] = [
  {
    id: 'web-app',
    name: 'Web Application Team',
    badge: 'Web / Frontend / Full-Stack',
    tagline: 'Anti-AI-Slop Web UI, React/Next.js Architecture, API & Playwright E2E',
    description:
      'Tailored for modern web apps, landing pages, dashboards, and full-stack web products. Enforces strict anti-AI-slop aesthetics (unslop, design-taste-frontend, hallmark), responsive layout discipline, and real browser verification.',
    roles: ['arch', 'fe', 'uiux', 'be', 'qa'],
    comboSkills: [
      'unslop',
      'design-taste-frontend',
      'hallmark',
      'ui-styling',
      'impeccable',
      'ponytail',
      'playwright-cli',
      'cli-anything',
      'vitest',
      'headroom',
      'caveman-compress',
    ],
    pmLogic: {
      soulAddon:
        'WEB PRODUCT CAPTAIN LOGIC: Enforce cohesive visual identity, zero AI-slop UI (no generic purple gradients or cookie-cutter 3-card grids), clean component hierarchy, and end-to-end build + Playwright verification before marking any feature done.',
      missionAddon:
        'Coordinate @ARCH (contracts/routes), @UIUX (design tokens & unslop audit), @FE (components & state), @BE (API endpoints), and @QA (typecheck, Vitest, Playwright smoke tests). Keep running the team in a relay loop until build and tests pass.',
      memoryAddon:
        'Mandatory Web Standards: Apply /unslop + /design-taste-frontend + /hallmark on every UI change; apply /ponytail for minimal surgical diffs; verify with /playwright-cli and pnpm build.',
    },
    specialistLogic: {
      arch: {
        roleId: 'arch',
        responsibility: 'Own route architecture, component boundaries, state flow, and typed API contracts.',
        soulAddon: 'Design lean, zero-bloat web module hierarchies with strict TypeScript contracts.',
        missionAddon: 'Prevent circular imports, oversized components, and redundant client state.',
        memoryAddon: 'Enforce /ponytail + /karpathy-guidelines across all web modules.',
        extraSkills: ['ponytail', 'cli-anything', 'architecture-diagram'],
      },
      fe: {
        roleId: 'fe',
        responsibility: 'Build production React/Next.js UI components, interactive hooks, and client-server integration.',
        soulAddon: 'Write crisp, accessible, anti-slop frontend code (/unslop, /design-taste-frontend) with semantic HTML and zero dead CSS.',
        missionAddon: 'Implement real interactive UI flows, wire APIs cleanly, and verify zero TypeScript/build errors.',
        memoryAddon: 'Always apply /unslop, /design-taste-frontend, /hallmark, and /ponytail.',
        extraSkills: ['unslop', 'design-taste-frontend', 'hallmark', 'ponytail', 'playwright-cli'],
      },
      uiux: {
        roleId: 'uiux',
        responsibility: 'Own typography scale, purposeful color tokens, spacing rhythm, micro-interactions, and WCAG AA contrast.',
        soulAddon: 'Eliminate vibecoded AI-slop immediately using /unslop (spacing -> color -> icons -> copy -> typography -> layout -> motion).',
        missionAddon: 'Audit and refine every screen for visual hierarchy, keyboard focus, and responsive breakpoints.',
        memoryAddon: 'Core skills: /unslop, /design-taste-frontend, /hallmark, /impeccable, /ui-styling.',
        extraSkills: ['unslop', 'design-taste-frontend', 'hallmark', 'impeccable', 'ui-styling'],
      },
      be: {
        roleId: 'be',
        responsibility: 'Implement backend API routes, validation, data persistence, and fast server responses.',
        soulAddon: 'Build resilient, type-safe API handlers with explicit input validation and error recovery.',
        missionAddon: 'Deliver tested endpoints matching @ARCH contracts and verify with real requests.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything, /api-design, /backend-patterns.',
        extraSkills: ['ponytail', 'cli-anything', 'api-design', 'backend-patterns'],
      },
      qa: {
        roleId: 'qa',
        responsibility: 'Run TypeScript checks, unit tests, production build, and Playwright E2E verification.',
        soulAddon: 'Never sign off without running real build/test commands and reporting exact outputs.',
        missionAddon: 'Execute build/test tools after specialist edits; if anything fails, hand back to @FE/@BE until green.',
        memoryAddon: 'Core skills: /playwright-cli, /vitest, /verification-before-completion, /cli-anything.',
        extraSkills: ['playwright-cli', 'vitest', 'verification-before-completion', 'cli-anything'],
      },
    },
  },
  {
    id: 'mobile-app',
    name: 'Mobile Application Team',
    badge: 'Android / iOS / Flutter / RN',
    tagline: 'Native & Cross-Platform Mobile UI (Unslop + Taste), Emulator/ADB & API Sync',
    description:
      'Designed for Android (Kotlin/Jetpack Compose), iOS (SwiftUI), Flutter, and React Native projects. Combines anti-slop mobile design taste with live Android Emulator / ADB logcat debugging and resilient offline-first API sync.',
    roles: ['arch', 'mobile', 'uiux', 'be', 'qa'],
    comboSkills: [
      'unslop',
      'design-taste-frontend',
      'mobile-android-design',
      'android-native-dev',
      'ios-application-dev',
      'flutter-dev',
      'react-native-dev',
      'ponytail',
      'playwright-cli',
      'cli-anything',
      'headroom',
    ],
    pmLogic: {
      soulAddon:
        'MOBILE PRODUCT CAPTAIN LOGIC: Prioritize native 60/120fps touch feel, thumb-zone ergonomics, anti-slop mobile visual polish (/unslop, /design-taste-frontend), lifecycle safety, and live ADB/emulator verification.',
      missionAddon:
        'Coordinate @ARCH (navigation & offline state), @MOBILE (screens, native modules, Gradle/Xcode build), @UIUX (touch targets, mobile typography & unslop), @BE (mobile APIs), and @QA (build, unit tests & logcat crash audit).',
      memoryAddon:
        'Mandatory Mobile Standards: Apply /unslop + /design-taste-frontend + /mobile-android-design on every screen; inspect ADB logcat on crashes; keep diffs surgical with /ponytail.',
    },
    specialistLogic: {
      arch: {
        roleId: 'arch',
        responsibility: 'Own mobile clean architecture, navigation graph, offline cache strategy, and API DTOs.',
        soulAddon: 'Design lifecycle-safe mobile state and clean domain/data/presentation separation.',
        missionAddon: 'Keep startup fast, avoid memory leaks, and define strict API contracts.',
        memoryAddon: 'Core skills: /android-clean-architecture, /ponytail, /cli-anything.',
        extraSkills: ['ponytail', 'cli-anything'],
      },
      mobile: {
        roleId: 'mobile',
        responsibility: 'Build mobile screens, platform integrations, Gradle/Flutter/RN builds, and fix ADB Logcat crashes.',
        soulAddon: 'Ship buttery-smooth mobile UI free of AI-slop (/unslop, /design-taste-frontend) with proper loading/empty/error states.',
        missionAddon: 'Implement mobile features, run build/emulator checks, and inspect read_android_logcat.',
        memoryAddon: 'Core skills: /android-native-dev, /flutter-dev, /react-native-dev, /unslop, /design-taste-frontend, /ponytail.',
        extraSkills: ['android-native-dev', 'flutter-dev', 'react-native-dev', 'unslop', 'design-taste-frontend', 'ponytail'],
      },
      uiux: {
        roleId: 'uiux',
        responsibility: 'Craft mobile design tokens, 48dp+ touch targets, safe-area layouts, and fluid screen transitions.',
        soulAddon: 'Strip generic AI-slop mobile cards/gradients using /unslop and /design-taste-frontend.',
        missionAddon: 'Ensure dark/light theme contrast, one-handed usability, and platform-authentic motion.',
        memoryAddon: 'Core skills: /unslop, /design-taste-frontend, /mobile-android-design, /ui-styling.',
        extraSkills: ['unslop', 'design-taste-frontend', 'ui-styling'],
      },
      be: {
        roleId: 'be',
        responsibility: 'Provide low-latency mobile APIs, pagination, auth tokens, and push/webhook endpoints.',
        soulAddon: 'Optimize payload sizes and handle flaky mobile network retries gracefully.',
        missionAddon: 'Implement and test backend endpoints supporting the mobile client.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything, /api-design.',
        extraSkills: ['ponytail', 'cli-anything', 'api-design'],
      },
      qa: {
        roleId: 'qa',
        responsibility: 'Verify mobile compilation, unit tests, ADB logcat crash-free runs, and API edge cases.',
        soulAddon: 'Test rotation, offline states, permission denials, and build outputs rigorously.',
        missionAddon: 'Run build & test verification and relay any compiler or runtime errors back to @MOBILE/@BE.',
        memoryAddon: 'Core skills: /verification-before-completion, /cli-anything, /ponytail.',
        extraSkills: ['verification-before-completion', 'cli-anything', 'ponytail'],
      },
    },
  },
  {
    id: 'fullstack-saas',
    name: 'Full-Stack SaaS & Security Team',
    badge: 'SaaS / Auth / DB / Payments',
    tagline: 'End-to-End SaaS UI (Unslop), Database Migrations, Auth/Security Audit & E2E QA',
    description:
      'Complete product squad for multi-tenant SaaS, billing, dashboards, and data-intensive web apps. Pairs anti-slop UI taste with database schema engineering and 6-phase security auditing.',
    roles: ['arch', 'fe', 'be', 'db', 'sec', 'qa'],
    comboSkills: [
      'unslop',
      'design-taste-frontend',
      'hallmark',
      'postgres-patterns',
      'drizzle-orm',
      'security-audit',
      'ponytail',
      'playwright-cli',
      'cli-anything',
      'vitest',
      'headroom',
    ],
    pmLogic: {
      soulAddon:
        'SAAS CAPTAIN LOGIC: Balance polished anti-slop UI (/unslop, /design-taste-frontend) with rock-solid data integrity (@DB) and zero-shortcut security (@SEC).',
      missionAddon:
        'Drive features from schema (@DB) -> API (@BE) -> UI (@FE) -> security gate (@SEC) -> build & test verification (@QA) in an autonomous relay loop.',
      memoryAddon:
        'Mandatory SaaS Gate: No auth/payment/input change ships without @SEC review and @QA passing build + tests.',
    },
    specialistLogic: {
      arch: {
        roleId: 'arch',
        responsibility: 'Define multi-tenant boundaries, auth flows, and schema-to-UI type contracts.',
        soulAddon: 'Keep SaaS architecture modular, auditable, and strictly typed.',
        missionAddon: 'Coordinate data models and API contracts across @DB, @BE, and @FE.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything, /api-design.',
        extraSkills: ['ponytail', 'cli-anything', 'api-design'],
      },
      fe: {
        roleId: 'fe',
        responsibility: 'Build high-craft SaaS dashboards, forms, and billing/auth flows with zero AI-slop.',
        soulAddon: 'Apply /unslop, /design-taste-frontend, and /hallmark for Linear/Stripe-grade clarity.',
        missionAddon: 'Implement responsive UI views with optimistic updates and clear error states.',
        memoryAddon: 'Core skills: /unslop, /design-taste-frontend, /hallmark, /ponytail, /playwright-cli.',
        extraSkills: ['unslop', 'design-taste-frontend', 'hallmark', 'ponytail', 'playwright-cli'],
      },
      be: {
        roleId: 'be',
        responsibility: 'Implement transactional APIs, webhooks, background jobs, and rate limiting.',
        soulAddon: 'Write idempotent, race-condition-free backend handlers.',
        missionAddon: 'Deliver verified server routes and business logic.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything, /backend-patterns.',
        extraSkills: ['ponytail', 'cli-anything', 'backend-patterns'],
      },
      db: {
        roleId: 'db',
        responsibility: 'Design normalized schemas, safe migrations, composite indexes, and N+1-free queries.',
        soulAddon: 'Protect production data integrity with reversible migrations and strict constraints.',
        missionAddon: 'Author and verify schema changes, indexes, and query helpers.',
        memoryAddon: 'Core skills: /postgres-patterns, /drizzle-orm, /database-migrations, /ponytail.',
        extraSkills: ['postgres-patterns', 'drizzle-orm', 'database-migrations', 'ponytail'],
      },
      sec: {
        roleId: 'sec',
        responsibility: 'Audit authn/authz, tenant isolation, SSRF/CSRF/XSS, secret handling, and input validation.',
        soulAddon: 'Zero shortcuts on security boundaries; verify every external input and privilege check.',
        missionAddon: 'Harden endpoints and patch vulnerabilities before completion.',
        memoryAddon: 'Core skills: /security-audit, /web-perimeter-owasp-2025-audit, /ponytail.',
        extraSkills: ['security-audit', 'ponytail', 'cli-anything'],
      },
      qa: {
        roleId: 'qa',
        responsibility: 'Run full typecheck, unit/integration tests, and Playwright E2E checks.',
        soulAddon: 'Verify both happy paths and hostile auth/input edge cases.',
        missionAddon: 'Run build & test suite and loop with teammates until 100% green.',
        memoryAddon: 'Core skills: /vitest, /playwright-cli, /verification-before-completion.',
        extraSkills: ['vitest', 'playwright-cli', 'verification-before-completion'],
      },
    },
  },
  {
    id: 'ai-agentic',
    name: 'AI / LLM & Agentic System Team',
    badge: 'Agents / RAG / MCP / Evals',
    tagline: 'Multi-Agent Orchestration, Tool-Calling, Token Compaction, RAG & AI UI',
    description:
      'Built for AI products, LLM pipelines, MCP servers, RAG search, and agentic IDEs. Focuses on deterministic tool-calling, token efficiency (headroom, caveman-compress), and verifiable evals.',
    roles: ['arch', 'ai', 'be', 'fe', 'sec', 'qa'],
    comboSkills: [
      'dspy',
      'ai-sdk',
      'faiss',
      'chroma',
      'fastmcp',
      'unslop',
      'design-taste-frontend',
      'ponytail',
      'playwright-cli',
      'cli-anything',
      'headroom',
      'caveman-compress',
    ],
    pmLogic: {
      soulAddon:
        'AI SYSTEMS CAPTAIN LOGIC: Optimize tool-calling accuracy, streaming latency, token compaction (/headroom, /caveman-compress), prompt injection defense, and anti-slop AI UX (/unslop).',
      missionAddon:
        'Coordinate @AI (prompts, tools, RAG, evals), @BE (streaming SSE & MCP runtime), @FE (streaming chat/agent UI), @SEC (sandbox & injection guards), and @QA (deterministic tests).',
      memoryAddon:
        'Mandatory AI Standards: Never waste context tokens; test tool schemas end-to-end; verify build & tests.',
    },
    specialistLogic: {
      arch: {
        roleId: 'arch',
        responsibility: 'Design agent state machines, tool contracts, MCP protocols, and streaming pipelines.',
        soulAddon: 'Keep agent orchestration deterministic, abort-safe, and composable.',
        missionAddon: 'Define clean contracts between LLM loop, tools, and UI.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything, /langgraph.',
        extraSkills: ['ponytail', 'cli-anything', 'langgraph'],
      },
      ai: {
        roleId: 'ai',
        responsibility: 'Engineer system prompts, tool schemas, context compaction, semantic search, and model routing.',
        soulAddon: 'Maximize reasoning quality per token using /headroom, /caveman-compress, and grounded citations.',
        missionAddon: 'Implement and benchmark LLM tools, prompts, and retrieval accuracy.',
        memoryAddon: 'Core skills: /dspy, /faiss, /chroma, /headroom, /caveman-compress, /ponytail.',
        extraSkills: ['dspy', 'faiss', 'chroma', 'headroom', 'caveman-compress', 'ponytail'],
      },
      be: {
        roleId: 'be',
        responsibility: 'Build low-latency SSE streaming routes, tool execution sandboxes, and MCP clients.',
        soulAddon: 'Handle timeouts, retries, model fallbacks, and backpressure cleanly.',
        missionAddon: 'Implement reliable server routes and tool runners.',
        memoryAddon: 'Core skills: /fastmcp, /ponytail, /cli-anything.',
        extraSkills: ['fastmcp', 'ponytail', 'cli-anything'],
      },
      fe: {
        roleId: 'fe',
        responsibility: 'Build responsive streaming AI interfaces, tool cards, and diff reviewers.',
        soulAddon: 'Craft refined, anti-slop AI UX (/unslop, /design-taste-frontend) without lag during token streaming.',
        missionAddon: 'Implement smooth streaming UI components and keyboard-first controls.',
        memoryAddon: 'Core skills: /unslop, /design-taste-frontend, /ponytail, /playwright-cli.',
        extraSkills: ['unslop', 'design-taste-frontend', 'ponytail', 'playwright-cli'],
      },
      sec: {
        roleId: 'sec',
        responsibility: 'Guard against prompt injection, command injection, path traversal, and SSRF in agent tools.',
        soulAddon: 'Enforce strict workspace sandboxing and secret redaction.',
        missionAddon: 'Audit and harden every tool execution path.',
        memoryAddon: 'Core skills: /security-audit, /agent-security-hardening, /ponytail.',
        extraSkills: ['security-audit', 'ponytail'],
      },
      qa: {
        roleId: 'qa',
        responsibility: 'Run automated unit/integration tests for tool execution, streaming, and security guards.',
        soulAddon: 'Verify deterministic behavior across edge cases and malformed LLM outputs.',
        missionAddon: 'Execute test suites and verify zero regressions.',
        memoryAddon: 'Core skills: /vitest, /verification-before-completion, /cli-anything.',
        extraSkills: ['vitest', 'verification-before-completion', 'cli-anything'],
      },
    },
  },
  {
    id: 'api-backend',
    name: 'API, Microservices & Database Team',
    badge: 'Backend / DB / Security / Perf',
    tagline: 'High-Throughput APIs, Database Indexing, Security Hardening & Load Verification',
    description:
      'Focused backend engineering squad for REST/GraphQL services, CLIs, workers, and database engines. Emphasizes clean contracts, query optimization, and automated test coverage.',
    roles: ['arch', 'be', 'db', 'sec', 'perf', 'qa'],
    comboSkills: [
      'api-design',
      'backend-patterns',
      'postgres-patterns',
      'security-audit',
      'ponytail',
      'cli-anything',
      'vitest',
      'headroom',
      'caveman-compress',
    ],
    pmLogic: {
      soulAddon:
        'BACKEND CAPTAIN LOGIC: Enforce strict API contracts, transactional safety, low P99 latency, and comprehensive automated test verification.',
      missionAddon:
        'Coordinate @ARCH, @BE, @DB, @SEC, @PERF, and @QA in an execution + test loop until all endpoints and migrations pass verification.',
      memoryAddon: 'Core discipline: /ponytail minimal code, /cli-anything verification, zero untested endpoints.',
    },
    specialistLogic: {
      arch: {
        roleId: 'arch',
        responsibility: 'Design service boundaries, error taxonomies, and API schemas.',
        soulAddon: 'Favor simple, composable service contracts.',
        missionAddon: 'Keep APIs backward-compatible and well-typed.',
        memoryAddon: 'Core skills: /api-design, /ponytail, /cli-anything.',
        extraSkills: ['api-design', 'ponytail', 'cli-anything'],
      },
      be: {
        roleId: 'be',
        responsibility: 'Implement endpoints, workers, validation, and integration logic.',
        soulAddon: 'Write clean, defensive server code with explicit error handling.',
        missionAddon: 'Build and verify backend handlers and services.',
        memoryAddon: 'Core skills: /backend-patterns, /ponytail, /cli-anything.',
        extraSkills: ['backend-patterns', 'ponytail', 'cli-anything'],
      },
      db: {
        roleId: 'db',
        responsibility: 'Optimize schemas, migrations, transactions, and indexes.',
        soulAddon: 'Eliminate N+1 queries and lock contention.',
        missionAddon: 'Deliver safe schema migrations and fast queries.',
        memoryAddon: 'Core skills: /postgres-patterns, /ponytail.',
        extraSkills: ['postgres-patterns', 'ponytail'],
      },
      sec: {
        roleId: 'sec',
        responsibility: 'Audit authentication, rate limits, injection risks, and secrets.',
        soulAddon: 'Enforce least privilege and strict input validation.',
        missionAddon: 'Harden all public and internal endpoints.',
        memoryAddon: 'Core skills: /security-audit, /ponytail.',
        extraSkills: ['security-audit', 'ponytail'],
      },
      perf: {
        roleId: 'perf',
        responsibility: 'Profile throughput, memory footprint, caching, and I/O latency.',
        soulAddon: 'Measure bottlenecks before optimizing; keep hot paths allocation-light.',
        missionAddon: 'Optimize slow endpoints and resource usage.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything.',
        extraSkills: ['ponytail', 'cli-anything'],
      },
      qa: {
        roleId: 'qa',
        responsibility: 'Write and execute API integration tests, concurrency tests, and build checks.',
        soulAddon: 'Verify status codes, error payloads, and edge cases.',
        missionAddon: 'Run test suite continuously until all checks pass.',
        memoryAddon: 'Core skills: /vitest, /verification-before-completion, /cli-anything.',
        extraSkills: ['vitest', 'verification-before-completion', 'cli-anything'],
      },
    },
  },
  {
    id: 'desktop-devops',
    name: 'Desktop App & DevOps Release Team',
    badge: 'Electron / CI-CD / Packaging',
    tagline: 'Native Desktop Runtime, Anti-Slop Desktop UI, Cross-Platform Installers & CI/CD',
    description:
      'Ideal for Electron/Tauri desktop apps, developer tools, and multi-platform release pipelines. Combines desktop UI polish with native packaging, performance, and CI/CD automation.',
    roles: ['arch', 'fe', 'be', 'devops', 'perf', 'qa'],
    comboSkills: [
      'unslop',
      'design-taste-frontend',
      'docker-management',
      'ci-cd-and-automation',
      'ponytail',
      'playwright-cli',
      'cli-anything',
      'vitest',
      'headroom',
    ],
    pmLogic: {
      soulAddon:
        'DESKTOP & DEVOPS CAPTAIN LOGIC: Ensure zero-port/sandboxed desktop stability, responsive native-grade UI (/unslop, /design-taste-frontend), cross-platform path safety (win32/posix), and green CI/release builds.',
      missionAddon:
        'Coordinate @ARCH, @FE, @BE, @DEVOPS, @PERF, and @QA through implementation, build packaging, and automated test verification.',
      memoryAddon: 'Always verify both Windows and POSIX path semantics and run full build + test checks.',
    },
    specialistLogic: {
      arch: {
        roleId: 'arch',
        responsibility: 'Own IPC contracts, process isolation, and standalone bundling architecture.',
        soulAddon: 'Keep main/preload/renderer boundaries minimal and secure.',
        missionAddon: 'Maintain clean desktop and web runtime parity.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything.',
        extraSkills: ['ponytail', 'cli-anything'],
      },
      fe: {
        roleId: 'fe',
        responsibility: 'Build keyboard-first desktop UI panels, menus, and editors with zero AI-slop.',
        soulAddon: 'Apply /unslop and /design-taste-frontend for native IDE precision.',
        missionAddon: 'Deliver responsive panels and shortcut workflows.',
        memoryAddon: 'Core skills: /unslop, /design-taste-frontend, /ponytail, /playwright-cli.',
        extraSkills: ['unslop', 'design-taste-frontend', 'ponytail', 'playwright-cli'],
      },
      be: {
        roleId: 'be',
        responsibility: 'Implement local filesystem, terminal, Git, debugger, and runner services.',
        soulAddon: 'Ensure cross-platform process management and clean resource cleanup.',
        missionAddon: 'Build and test local runtime APIs.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything.',
        extraSkills: ['ponytail', 'cli-anything'],
      },
      devops: {
        roleId: 'devops',
        responsibility: 'Maintain Electron packaging, NSIS/DMG/AppImage installers, and GitHub Actions CI/CD.',
        soulAddon: 'Keep build pipelines reproducible, fast, and cross-platform green.',
        missionAddon: 'Configure and verify build scripts and workflows.',
        memoryAddon: 'Core skills: /ci-cd-and-automation, /docker-management, /ponytail, /cli-anything.',
        extraSkills: ['ci-cd-and-automation', 'docker-management', 'ponytail', 'cli-anything'],
      },
      perf: {
        roleId: 'perf',
        responsibility: 'Optimize cold start time, bundle size, memory usage, and UI frame rates.',
        soulAddon: 'Keep desktop memory and CPU overhead minimal.',
        missionAddon: 'Eliminate unnecessary re-renders and heavy dependencies.',
        memoryAddon: 'Core skills: /ponytail, /cli-anything.',
        extraSkills: ['ponytail', 'cli-anything'],
      },
      qa: {
        roleId: 'qa',
        responsibility: 'Run TypeScript, Vitest, standalone build, and Playwright E2E smoke tests.',
        soulAddon: 'Verify both unit logic and packaged runtime health.',
        missionAddon: 'Run verification commands and loop with the team until green.',
        memoryAddon: 'Core skills: /vitest, /playwright-cli, /verification-before-completion.',
        extraSkills: ['vitest', 'playwright-cli', 'verification-before-completion'],
      },
    },
  },
]

const CUSTOM_COMBOS_STORAGE_KEY = 'vincezone-custom-team-combos-v1'

export function loadSavedCustomTeamCombos(storage?: Pick<Storage, 'getItem'>): ProjectTeamCombo[] {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!target) return []
  try {
    const raw = target.getItem(CUSTOM_COMBOS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ProjectTeamCombo[]
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.roles)) : []
  } catch {
    return []
  }
}

export function saveCustomTeamCombo(
  combo: ProjectTeamCombo,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): ProjectTeamCombo[] {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  const existing = loadSavedCustomTeamCombos(target)
  const next = [{ ...combo, isCustom: true }, ...existing.filter((c) => c.id !== combo.id)].slice(0, 12)
  if (target) {
    try {
      target.setItem(CUSTOM_COMBOS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage quota
    }
  }
  return next
}

export function deleteCustomTeamCombo(
  comboId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): ProjectTeamCombo[] {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  const existing = loadSavedCustomTeamCombos(target)
  const next = existing.filter((c) => c.id !== comboId)
  if (target) {
    try {
      target.setItem(CUSTOM_COMBOS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }
  return next
}

/**
 * Analyzes the workspace files and optional user instruction to recommend the best Project Team Combo.
 * Used both in the New Agent -> Project Team modal AND injected into @PM's analysis context.
 */
export function recommendTeamComboForWorkspace(
  files: WorkspaceFile[],
  instruction = '',
): {
  recommended: ProjectTeamCombo
  reason: string
  alternatives: ProjectTeamCombo[]
} {
  const paths = files.map((f) => f.path.replace(/\\/g, '/'))
  const joinedPaths = paths.join('\n')
  const lowerInst = instruction.toLowerCase()
  const pkgFile = files.find((f) => f.path.replace(/\\/g, '/').toLowerCase() === 'package.json')
  const pkgText = (pkgFile?.content || '').toLowerCase()

  const hasMobile =
    paths.some((p) => /(^|\/)(android|ios)\/|gradlew|\.kt$|\.swift$|pubspec\.yaml|react-native/i.test(p)) ||
    /\b(mobile|android|ios|flutter|react native|apk)\b/i.test(lowerInst)

  const hasDesktop =
    paths.some((p) => /^electron\/|tauri|\.nsi$/i.test(p)) ||
    pkgText.includes('"electron"') ||
    /\b(electron|desktop|installer|tauri)\b/i.test(lowerInst)

  const hasAi =
    /orchestrat|agent-tools|mcp-client|semantic-index|openai|anthropic|langchain|dspy|llm/i.test(
      `${joinedPaths}\n${pkgText}`,
    ) || /\b(ai|llm|agent|rag|mcp|embedding)\b/i.test(lowerInst)

  const hasDbOrSaas =
    paths.some((p) => /prisma|drizzle|migrations|\.sql$|schema\./i.test(p)) ||
    /\b(saas|billing|stripe|postgres|database|auth|tenant)\b/i.test(lowerInst)

  const hasFrontend =
    paths.some((p) => /\.(tsx|jsx|vue|svelte|html|css)$/i.test(p) || /components\//i.test(p))

  let recommendedId = 'web-app'
  let reason =
    'Detected web UI components and routes — Web Application Team activates @ARCH, @FE, @UIUX, @BE, @QA with anti-AI-slop skills (/unslop, /design-taste-frontend, /hallmark, /playwright-cli, /ponytail).'

  if (hasMobile && !hasDesktop) {
    recommendedId = 'mobile-app'
    reason =
      'Detected mobile application files/intent — Mobile Application Team activates @ARCH, @MOBILE, @UIUX, @BE, @QA with /unslop, /design-taste-frontend, mobile native skills, and live ADB/emulator verification.'
  } else if (hasAi && hasDesktop) {
    recommendedId = 'ai-agentic'
    reason =
      'Detected AI/Multi-Agent orchestration + desktop runtime — AI / LLM & Agentic System Team (or Desktop & DevOps Team) pairs @AI, @ARCH, @BE, @FE, @SEC, @QA with /headroom, /caveman-compress, /unslop, /ponytail, and /playwright-cli.'
  } else if (hasDesktop) {
    recommendedId = 'desktop-devops'
    reason =
      'Detected Electron/Desktop packaging & CI workflows — Desktop App & DevOps Release Team activates @ARCH, @FE, @BE, @DEVOPS, @PERF, @QA with /unslop, /design-taste-frontend, /playwright-cli, and cross-platform release gates.'
  } else if (hasAi) {
    recommendedId = 'ai-agentic'
    reason =
      'Detected AI/LLM & tool-calling modules — AI / LLM & Agentic System Team activates @ARCH, @AI, @BE, @FE, @SEC, @QA with token compaction (/headroom, /caveman-compress), /unslop, and deterministic tool verification.'
  } else if (hasDbOrSaas && hasFrontend) {
    recommendedId = 'fullstack-saas'
    reason =
      'Detected full-stack UI + database/auth layer — Full-Stack SaaS & Security Team activates @ARCH, @FE, @BE, @DB, @SEC, @QA with /unslop, /design-taste-frontend, /postgres-patterns, and /security-audit.'
  } else if (!hasFrontend && paths.length > 0) {
    recommendedId = 'api-backend'
    reason =
      'Detected backend/service repository without web UI — API, Microservices & Database Team activates @ARCH, @BE, @DB, @SEC, @PERF, @QA with /api-design, /postgres-patterns, /security-audit, and /ponytail.'
  }

  const recommended =
    BUILTIN_PROJECT_TEAM_COMBOS.find((c) => c.id === recommendedId) ?? BUILTIN_PROJECT_TEAM_COMBOS[0]
  const alternatives = BUILTIN_PROJECT_TEAM_COMBOS.filter((c) => c.id !== recommended.id)

  return { recommended, reason, alternatives }
}

/**
 * Builds a concise prompt block injected into @PM so whenever @PM analyzes a project,
 * @PM proactively recommends the optimal Project Team Combo and explains its specialist & skill setup.
 */
export function buildPmComboRecommendationPrompt(files: WorkspaceFile[]): string {
  const { recommended, reason, alternatives } = recommendTeamComboForWorkspace(files)
  const allCombosSummary = [recommended, ...alternatives]
    .map(
      (c) =>
        `- **${c.name}** (\`${c.id}\`): @PM + ${c.roles.map((r) => `@${r.toUpperCase()}`).join(', ')} | Key Skills: ${c.comboSkills.slice(0, 6).map((s) => `/${s}`).join(', ')}`,
    )
    .join('\n')

  return [
    '=== PROJECT TEAM COMBO ADVISOR (@PM GUIDANCE) ===',
    `When the user asks you to analyze or evaluate this project/repository, ALWAYS include a **"Recommended Project Team Combo"** section in your analysis recommending the best team preset (or how to customize one via the **"New agent → Project Team"** button):`,
    `- **Top Recommended Combo for this Workspace:** **${recommended.name}** (\`${recommended.id}\`) — Roles: @PM (Captain), ${recommended.roles.map((r) => `@${r.toUpperCase()}`).join(', ')}.`,
    `- **Why:** ${reason}`,
    `- **Combo Skill Pack:** ${recommended.comboSkills.map((s) => `/${s}`).join(', ')}`,
    'Available Project Team Combos in VinceZone Studio:',
    allCombosSummary,
  ].join('\n')
}

/**
 * Materializes a full specialist team from a chosen ProjectTeamCombo (or custom role selection & team name),
 * configuring @PM Captain + each member with combo-specific Soul, Mission, Memory, elite skills, and Role Models.
 */
export function buildTeamFromCombo(input: {
  combo: ProjectTeamCombo
  teamName?: string
  projectName: string
  selectedRoles?: FixedSpecialistRoleId[]
  includeCustomAgent?: {
    name: string
    role: string
    model?: string
    providerId?: string
  } | null
  customPmInstruction?: string
  existingAgents: Agent[]
  roleModels?: Record<string, RoleModelAssignment>
  defaultProviderId: string
  defaultModel: string
}): {
  nextAgents: Agent[]
  recruitedCount: number
  communicationEvents: CommunicationEvent[]
  summaryText: string
} {
  const {
    combo,
    teamName,
    projectName,
    selectedRoles,
    includeCustomAgent,
    customPmInstruction,
    existingAgents,
    roleModels,
    defaultProviderId,
    defaultModel,
  } = input

  const activeRoles: FixedSpecialistRoleId[] = (
    selectedRoles && selectedRoles.length > 0 ? selectedRoles : combo.roles
  ).filter((r, i, arr) => arr.indexOf(r) === i)

  const effectiveTeamName = teamName?.trim() || `${projectName} · ${combo.name}`
  const pmMeta = ROLE_TERRITORIES.pm
  const pmModelCfg = resolveModelForRole('pm', roleModels, defaultProviderId, defaultModel)
  const existingPm = findPmAgent(existingAgents)

  const mergedComboSkills = Array.from(
    new Set([...combo.comboSkills, ...UNIVERSAL_ELITE_SKILLS]),
  )
  const skillTags = mergedComboSkills.map((s) => `/${s}`).join(', ')

  const rosterLine = [
    '@PM (Captain)',
    ...activeRoles.map((r) => `@${ROLE_TERRITORIES[r].code} (${ROLE_TERRITORIES[r].title})`),
    ...(includeCustomAgent?.name ? [`@CUSTOM (${includeCustomAgent.name})`] : []),
  ].join(', ')

  const specialists: Agent[] = activeRoles.map((roleId) => {
    const meta = ROLE_TERRITORIES[roleId]
    const override = combo.specialistLogic[roleId]
    const modelCfg = resolveModelForRole(roleId, roleModels, defaultProviderId, defaultModel)
    const roleSkills = Array.from(
      new Set([
        ...meta.defaultSkills,
        ...(override?.extraSkills ?? []),
        ...combo.comboSkills.filter((s) =>
          ['fe', 'uiux', 'mobile'].includes(roleId)
            ? true
            : !['unslop', 'design-taste-frontend', 'hallmark', 'impeccable', 'ui-styling'].includes(s),
        ),
        ...UNIVERSAL_ELITE_SKILLS,
      ]),
    )
    const responsibility = override?.responsibility || meta.summary

    const tailoredSoul = [
      `[PROJECT TEAM COMBO: ${effectiveTeamName} (${combo.name})]`,
      override?.soulAddon || '',
      `Active Specialist Skills: ${roleSkills.map((s) => `/${s}`).join(', ')}`,
      meta.defaultSoul,
    ]
      .filter(Boolean)
      .join('\n\n')

    const tailoredMission = [
      `[TEAM: ${effectiveTeamName} | PROJECT: ${projectName}]`,
      `Position: @${meta.code} — ${meta.title} (${meta.position})`,
      `Combo Responsibility: ${responsibility}`,
      override?.missionAddon ? `Combo Execution Rule: ${override.missionAddon}` : '',
      customPmInstruction?.trim() ? `Project Custom Directive: ${customPmInstruction.trim()}` : '',
      `Team Roster: ${rosterLine}`,
      `Power Skills Enabled: ${roleSkills.map((s) => `/${s}`).join(', ')}`,
      '',
      meta.defaultMission,
    ]
      .filter(Boolean)
      .join('\n')

    const tailoredMemory = [
      `Team Combo: ${effectiveTeamName} (${combo.id})`,
      override?.memoryAddon || '',
      `Token-Saving & Verification Discipline: Always apply /ponytail, /headroom, /caveman-compress, /cli-anything, and /verification-before-completion.`,
      meta.defaultMemory,
    ]
      .filter(Boolean)
      .join('\n')

    return {
      id: roleId,
      name: meta.title,
      role: responsibility,
      roleId,
      commandRank: 'member' as const,
      soul: tailoredSoul,
      mission: tailoredMission,
      memory: tailoredMemory,
      providerId: modelCfg.providerId,
      model: modelCfg.model,
      accent: meta.accent,
      status: 'idle' as const,
      messages: [
        {
          id: `combo-onboard-${roleId}-${Date.now().toString(36)}`,
          role: 'assistant' as const,
          text: [
            `**@${meta.code} — ${meta.title}** ready in **${effectiveTeamName}** (Model: \`${modelCfg.model}\`).`,
            `- **Responsibility:** ${responsibility}`,
            `- **Equipped Skills:** ${roleSkills.slice(0, 8).map((s) => `\`/${s}\``).join(', ')}`,
          ].join('\n'),
        },
      ],
    }
  })

  if (includeCustomAgent?.name?.trim()) {
    const customModel = includeCustomAgent.model?.trim() || defaultModel
    const customProv = includeCustomAgent.providerId?.trim() || defaultProviderId
    specialists.push({
      id: `custom-${Date.now().toString(36)}`,
      name: includeCustomAgent.name.trim(),
      role: includeCustomAgent.role.trim() || CUSTOM_ROLE_META.summary,
      roleId: 'custom',
      commandRank: 'member',
      soul: `${CUSTOM_ROLE_META.defaultSoul}\n\nEquipped Skills: ${UNIVERSAL_ELITE_SKILLS.map((s) => `/${s}`).join(', ')}`,
      mission: `[TEAM: ${effectiveTeamName}] ${includeCustomAgent.role.trim() || CUSTOM_ROLE_META.defaultMission}`,
      memory: CUSTOM_ROLE_META.defaultMemory,
      providerId: customProv,
      model: customModel,
      accent: CUSTOM_ROLE_META.accent,
      status: 'idle',
      messages: [
        {
          id: `combo-custom-${Date.now().toString(36)}`,
          role: 'assistant',
          text: `**@CUSTOM — ${includeCustomAgent.name.trim()}** joined **${effectiveTeamName}** (Freeform Model: \`${customModel}\`).`,
        },
      ],
    })
  }

  const summaryText = [
    `### Activated Project Team: **${effectiveTeamName}**`,
    `- **Preset:** ${combo.name} — *${combo.tagline}*`,
    `- **Topology:** \`1:6 PM\` (**@PM** Captain locked on left pane)`,
    `- **Active Roster (${specialists.length + 1}):** ${rosterLine}`,
    `- **Combo Skill Pack:** ${mergedComboSkills.map((s) => `\`/${s}\``).join(', ')}`,
    customPmInstruction?.trim() ? `- **Custom Directive:** ${customPmInstruction.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const updatedPm: Agent = {
    ...(existingPm ?? {
      id: 'pm',
      name: 'PM Orchestrator',
      role: pmMeta.summary,
      roleId: 'pm' as const,
      accent: pmMeta.accent,
      status: 'idle' as const,
      messages: [],
    }),
    roleId: 'pm',
    commandRank: 'captain',
    providerId: pmModelCfg.providerId,
    model: pmModelCfg.model,
    soul: [
      `[ACTIVE PROJECT TEAM COMBO: ${effectiveTeamName} (${combo.name})]`,
      combo.pmLogic.soulAddon,
      `Active Captain Skills: ${skillTags}`,
      pmMeta.defaultSoul,
    ].join('\n\n'),
    mission: [
      `[TEAM CAPTAIN OF: ${effectiveTeamName} | PROJECT: ${projectName}]`,
      combo.pmLogic.missionAddon,
      customPmInstruction?.trim() ? `Project Custom Directive: ${customPmInstruction.trim()}` : '',
      `Team Roster: ${rosterLine}`,
      `Combo Skills: ${skillTags}`,
      pmMeta.defaultMission,
    ]
      .filter(Boolean)
      .join('\n'),
    memory: [
      `Active Combo: ${effectiveTeamName} (${combo.id})`,
      combo.pmLogic.memoryAddon,
      pmMeta.defaultMemory,
    ].join('\n'),
    status: 'idle',
    messages: [
      ...(existingPm?.messages ?? []).slice(-6),
      {
        id: `pm-combo-${Date.now().toString(36)}`,
        role: 'assistant',
        text: summaryText,
      },
    ],
  }

  const nextAgents = assignCaptain([updatedPm, ...specialists], updatedPm.id)
  const nowIso = new Date().toISOString()
  const communicationEvents: CommunicationEvent[] = specialists.map((member, idx) => ({
    id: `ev-combo-${member.id}-${Date.now().toString(36)}-${idx}`,
    type: 'message.sent',
    kind: 'delegation',
    timestamp: nowIso,
    senderId: updatedPm.id,
    recipientId: member.id,
    label: `Team ${combo.name} → @${(member.roleId || 'custom').toUpperCase()}`,
    description: `${member.name} configured for ${effectiveTeamName}`,
  }))

  return {
    nextAgents,
    recruitedCount: specialists.length,
    communicationEvents,
    summaryText,
  }
}
