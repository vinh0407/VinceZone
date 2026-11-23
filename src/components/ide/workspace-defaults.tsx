'use client'

import { FileCode2, FileJson, FileText } from 'lucide-react'
import type { Agent, AppSettings, ProviderConfig, WorkspaceFile } from './agent-types'

export const WORKSPACE_STORAGE_KEY = 'vincezone-studio-workspace'
export const LEGACY_STORAGE_KEYS = ['baton-workspace', 'nova-workspace'] as const

export const uid = () => Math.random().toString(36).slice(2, 10)

export function fileIcon(file: WorkspaceFile) {
  if (file.language === 'json') return <FileJson size={14} className="shrink-0 text-[#a3a3a3]" />
  if (file.language === 'markdown') return <FileText size={14} className="shrink-0 text-[#b5b5b5]" />
  if (file.language === 'css') return <FileCode2 size={14} className="shrink-0 text-[#8f8f8f]" />
  return <FileCode2 size={14} className="shrink-0 text-[#c4c4c4]" />
}

export const starterFiles: WorkspaceFile[] = [
  {
    name: 'page.tsx',
    path: 'src/app/page.tsx',
    language: 'typescript',
    content: `import { Dashboard } from "@/components/dashboard"\n\nexport default function Home() {\n  return (\n    <main className="min-h-screen bg-[#1e1e1e] text-[#cccccc]">\n      <Dashboard />\n    </main>\n  )\n}\n`,
  },
  {
    name: 'dashboard.tsx',
    path: 'src/components/dashboard.tsx',
    language: 'typescript',
    content: `"use client"\n\nimport { useState } from "react"\n\nexport function Dashboard() {\n  const [ready, setReady] = useState(false)\n\n  return (\n    <section className="p-8">\n      <h1>VinceZone Studio Workspace</h1>\n      <button onClick={() => setReady(true)}>\n        {ready ? "Active" : "Initialize"}\n      </button>\n    </section>\n  )\n}\n`,
  },
  {
    name: 'route.ts',
    path: 'src/app/api/health/route.ts',
    language: 'typescript',
    content: `export async function GET() {\n  return Response.json({ app: "vincezone", status: "ok", port: 40704 })\n}\n`,
  },
  {
    name: 'package.json',
    path: 'package.json',
    language: 'json',
    content: `{\n  "name": "vincezone-studio",\n  "private": true,\n  "scripts": {\n    "dev": "next dev --port 40704",\n    "desktop": "electron electron/main.cjs",\n    "test": "vitest run"\n  }\n}\n`,
  },
]

export const seedAgents: Agent[] = [
  {
    id: 'pm',
    name: 'PM Orchestrator',
    role: 'Central Task Registry, decomposition & QA coordination',
    roleId: 'pm',
    model: 'openai/gpt-4.1',
    accent: '#f5f5f5',
    status: 'idle',
    messages: [
      {
        id: 'pm-1',
        role: 'assistant',
        text: 'VinceZone PM ready. Give one objective and I will decompose tasks with Single Primary Ownership, enforce FE↔BE API Contracts, and coordinate specialists. You can also type "rollback REV-001" to restore code.',
      },
    ],
  },
  {
    id: 'arch',
    name: 'Software Architect',
    role: 'System architecture, API contracts & docs',
    roleId: 'arch',
    model: 'anthropic/claude-sonnet-4',
    accent: '#d4d4d4',
    status: 'idle',
    messages: [
      {
        id: 'arch-1',
        role: 'assistant',
        text: '@ARCH territory: docs/, AGENTS.md, architecture specifications & module boundaries.',
      },
    ],
  },
  {
    id: 'fe',
    name: 'Frontend Engineer',
    role: 'VS Code UI, React components & styles',
    roleId: 'fe',
    model: 'anthropic/claude-sonnet-4',
    accent: '#b8b8b8',
    status: 'idle',
    messages: [
      {
        id: 'fe-1',
        role: 'assistant',
        text: '@FE territory: src/components/, hooks/, styles. Consumes @BE API Contracts without modifying server routes.',
      },
    ],
  },
  {
    id: 'be',
    name: 'Backend Engineer',
    role: 'API endpoints, security & server runtime',
    roleId: 'be',
    model: 'google/gemini-2.5-pro',
    accent: '#a3a3a3',
    status: 'idle',
    messages: [
      {
        id: 'be-1',
        role: 'assistant',
        text: '@BE territory: src/app/**/api/, src/lib/, electron/. Primary Owner of API Contracts.',
      },
    ],
  },
  {
    id: 'qa',
    name: 'QA Engineer',
    role: 'Vitest suites, Playwright verification & acceptance',
    roleId: 'qa',
    model: 'openai/gpt-4.1',
    accent: '#8a8a8a',
    status: 'idle',
    messages: [
      {
        id: 'qa-1',
        role: 'assistant',
        text: '@QA territory: __tests__/, tests/. Verifies deliverables before marking tasks COMPLETED.',
      },
    ],
  },
]

export const defaultAppSettings: AppSettings = {
  autoSave: false,
  confirmDangerousTools: true,
  restoreWorkspace: true,
  compactMode: true,
  maxConcurrentAgents: 4,
  autoApplyTrusted: false,
  allowTerminal: true,
  delegation: {
    maxDepth: 1,
    maxActiveAgents: 7,
    maxConcurrentTasks: 4,
    maxIterations: 2,
    requireApproval: false,
    assignmentMode: 'automatic',
  },
}

export const defaultProvider: ProviderConfig = {
  id: 'omnirouter',
  name: 'OmniRouter',
  baseUrl: 'https://api.omnirouter.ai/v1',
  apiKey: '',
  model: 'openai/gpt-4.1',
  models: 'openai/gpt-4.1, anthropic/claude-sonnet-4, google/gemini-2.5-pro',
}
