'use client'

import {
  Braces,
  FileCode2,
  FileImage,
  FileJson,
  FileText,
  Terminal,
} from 'lucide-react'
import { ROLE_TERRITORIES } from '@/lib/vincezone-protocol'
import type {
  Agent,
  AppSettings,
  MemoryNote,
  ProviderConfig,
  WorkspaceFile,
} from './agent-types'

export const WORKSPACE_STORAGE_KEY = 'vincezone-studio-workspace'
export const LEGACY_STORAGE_KEYS = ['baton-workspace', 'nova-workspace'] as const

export const uid = () => Math.random().toString(36).slice(2, 10)

/**
 * Distinct, refined file-type colors inside Explorer folders while preserving
 * the monochrome black/gray chrome across the IDE shell.
 */
export function fileIcon(file: WorkspaceFile) {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.tsx')) return <FileCode2 size={14} className="shrink-0 text-[#61dafb]" />
  if (lower.endsWith('.ts')) return <FileCode2 size={14} className="shrink-0 text-[#3b82f6]" />
  if (lower.endsWith('.jsx') || lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return <FileCode2 size={14} className="shrink-0 text-[#facc15]" />
  }
  if (file.language === 'json' || lower.endsWith('.json')) {
    return <FileJson size={14} className="shrink-0 text-[#f59e0b]" />
  }
  if (file.language === 'css' || lower.endsWith('.css') || lower.endsWith('.scss')) {
    return <Braces size={14} className="shrink-0 text-[#c084fc]" />
  }
  if (file.language === 'html' || lower.endsWith('.html')) {
    return <FileCode2 size={14} className="shrink-0 text-[#fb923c]" />
  }
  if (file.language === 'markdown' || lower.endsWith('.md')) {
    return <FileText size={14} className="shrink-0 text-[#93c5fd]" />
  }
  if (file.language === 'python' || lower.endsWith('.py')) {
    return <FileCode2 size={14} className="shrink-0 text-[#4ade80]" />
  }
  if (lower.endsWith('.sh') || lower.endsWith('.bat') || lower.endsWith('.vbs') || lower.endsWith('.ps1')) {
    return <Terminal size={14} className="shrink-0 text-[#2dd4bf]" />
  }
  if (lower.endsWith('.svg') || lower.endsWith('.png') || lower.endsWith('.ico')) {
    return <FileImage size={14} className="shrink-0 text-[#f472b6]" />
  }
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return <FileText size={14} className="shrink-0 text-[#fb7185]" />
  }
  return <FileCode2 size={14} className="shrink-0 text-[#a3a3a3]" />
}

export const starterFiles: WorkspaceFile[] = [
  {
    name: 'page.tsx',
    path: 'src/app/page.tsx',
    language: 'typescript',
    content: `import { Dashboard } from "@/components/dashboard"\n\nexport default function Home() {\n  return (\n    <main className="min-h-screen bg-[#141414] text-[#d4d4d4]">\n      <Dashboard />\n    </main>\n  )\n}\n`,
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

export const defaultMemoryNotes: MemoryNote[] = [
  {
    id: 'mem-1',
    scope: 'project',
    title: 'Territory & API Contract Rule',
    content:
      '@FE owns UI/components and never edits Backend API routes. @BE is the Primary Owner of API Contracts.',
    updatedAt: new Date().toISOString(),
  },
]

export function createSeedAgents(): Agent[] {
  const seeds: Array<{ id: 'pm' | 'arch' | 'fe' | 'be' | 'qa'; name: string }> = [
    { id: 'pm', name: 'PM Orchestrator' },
    { id: 'arch', name: 'Software Architect' },
    { id: 'fe', name: 'Frontend Engineer' },
    { id: 'be', name: 'Backend Engineer' },
    { id: 'qa', name: 'QA Verification Engineer' },
  ]
  return seeds.map(({ id, name }) => {
    const meta = ROLE_TERRITORIES[id]
    return {
      id,
      name,
      role: meta.summary,
      roleId: id,
      soul: meta.defaultSoul,
      mission: meta.defaultMission,
      memory: meta.defaultMemory,
      providerId: 'omnirouter',
      model: meta.recommendedModel,
      accent: meta.accent,
      status: 'idle',
      messages: [
        {
          id: `${id}-1`,
          role: 'assistant',
          text: `@${meta.code} (${meta.title}) ready · Combo: ${meta.recommendedModel} · Skills: ${meta.defaultSkills.map((s) => `/${s}`).join(' ')}`,
        },
      ],
    }
  })
}

export const seedAgents: Agent[] = createSeedAgents()

export const defaultAppSettings: AppSettings = {
  autoSave: true,
  autoSaveDelayMs: 1000,
  confirmDangerousTools: true,
  restoreWorkspace: true,
  compactMode: true,
  editorFontSize: 13,
  editorWordWrap: false,
  editorMinimap: true,
  maxConcurrentAgents: 6,
  autoApplyTrusted: true,
  allowTerminal: true,
  autoCaptureMemory: true,
  defaultCliTool: 'claude',
  enabledSkillIds: [],
  mcpServers: [
    {
      id: 'mcp-filesystem',
      name: 'Local Workspace FS',
      transport: 'stdio',
      endpoint: 'npx @modelcontextprotocol/server-filesystem',
      enabled: true,
    },
    {
      id: 'mcp-playwright',
      name: 'Playwright Browser MCP',
      transport: 'stdio',
      endpoint: 'npx @playwright/mcp',
      enabled: true,
    },
    {
      id: 'mcp-craft-anything',
      name: 'Craft Anything (323 Tools MCP)',
      transport: 'stdio',
      endpoint: 'tools/craft-anything/craft-anything-0.6.1-windows-x64-portable/craft-anything-cli.exe mcp',
      enabled: true,
    },
  ],
  plugins: [
    {
      id: 'plugin-vincezone-territory',
      name: 'Territory & API Contract Guard',
      description: 'Prevents cross-role overwrites between @FE, @BE, @DB, and @QA.',
      enabled: true,
    },
    {
      id: 'plugin-edit-memory',
      name: 'Edit Memory (REV-xxx)',
      description: 'Automatically records file revisions before every save or applied patch.',
      enabled: true,
    },
    {
      id: 'plugin-cli-anything',
      name: 'CLI-Anything Harness Bridge',
      description: 'Exposes JSON-native CLI commands for autonomous verification.',
      enabled: true,
    },
    {
      id: 'plugin-craft-anything',
      name: 'Craft Anything Engine (v0.6.1)',
      description: '323 reverse-engineering, inspection, Clean-room/Deep study & rebuild tools.',
      enabled: true,
    },
  ],
  delegation: {
    maxDepth: 2,
    maxActiveAgents: 12,
    maxConcurrentTasks: 6,
    maxIterations: 3,
    requireApproval: false,
    assignmentMode: 'automatic',
  },
}

export const defaultProvider: ProviderConfig = {
  id: 'omnirouter',
  name: 'OmniRoute AI Gateway',
  baseUrl: 'http://localhost:20128/v1',
  apiKey: '',
  model: 'super-coder',
  models:
    'super-coder, lead-architect, backend-core, frontend-ui-ux, qa-test-debugger, secops-reviewer, ultimate-free-stack, free-forever, always-on, free-stack, live-audio-transcription, fast-whisper-live, free-transcription',
}
