import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  findSymbolDefinitions,
  findSymbolReferences,
  invalidateCodeIndex,
  searchWorkspaceSymbols,
  updateIndexedFile,
} from './code-index'
import { registerPendingApproval } from './command-approvals'
import { withFileLock } from './file-lock'
import { resolvePathInsideWorkspace } from './local-guard'
import { callMcpServerTool, listMcpServerTools, type McpToolInfo } from './mcp-client'
import { semanticSearchWorkspace } from './semantic-index'

const execFileAsync = promisify(execFile)

export type McpServerRuntimeConfig = {
  id: string
  name: string
  transport: 'stdio' | 'http'
  endpoint: string
  enabled?: boolean
}

export type DynamicMcpBinding = {
  functionName: string
  server: McpServerRuntimeConfig
  toolName: string
}

export type AgentToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const MCP_DISCOVERY_CACHE = new Map<string, { fetchedAt: number; tools: McpToolInfo[] }>()
const MCP_CACHE_TTL_MS = 30_000

const BLOCKED_SHELL_PATTERNS = [
  /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/|~|\$home|c:\\|\/\*)/i,
  /\bdel\s+\/[sfq\s]+c:\\/i,
  /\brd\s+\/s\s+\/q\s+c:\\/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
  /\breg\s+delete\b/i,
  /\bRemove-Item\b.*-Recurse.*([A-Z]:\\|\/)\s*$/i,
]

const HIGH_RISK_SHELL_PATTERNS = [
  /\b(rm|del|rmdir|Remove-Item)\b/i,
  /\bgit\s+(push|reset\s+--hard|clean\s+-f)/i,
  /\b(prisma|drizzle|alembic|flyway)\b.*\b(migrate|push|drop|reset)\b/i,
  /\b(drop|truncate)\s+table\b/i,
  /\bcurl\b.*\|\s*(sh|bash|powershell)/i,
  /-(?:enc|encodedcommand)\b/i,
  /\b(?:iex|invoke-expression)\b/i,
]

export function classifyShellCommand(command: string): {
  status: 'safe' | 'approval-required' | 'blocked'
  riskLevel: 'low' | 'medium' | 'high'
  reason: string
} {
  const trimmed = command.trim()
  if (!trimmed) {
    return { status: 'blocked', riskLevel: 'high', reason: 'Empty command.' }
  }
  if (BLOCKED_SHELL_PATTERNS.some((re) => re.test(trimmed))) {
    return {
      status: 'blocked',
      riskLevel: 'high',
      reason: 'Catastrophic system-level command is permanently blocked for safety.',
    }
  }
  // Safe read-only verification commands (strictly single-line, zero shell chaining/redirection/subshells)
  const hasChaining = /[\r\n;&|`]|>\s*[^&]|\$\(/.test(trimmed)
  if (
    !hasChaining &&
    SAFE_VERIFY_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix))
  ) {
    return {
      status: 'safe',
      riskLevel: 'low',
      reason: 'Read-only verification command.',
    }
  }
  const isHighRisk = HIGH_RISK_SHELL_PATTERNS.some((re) => re.test(trimmed))
  return {
    status: 'approval-required',
    riskLevel: isHighRisk ? 'high' : 'medium',
    reason: isHighRisk
      ? 'Potentially destructive or remote-mutating command requires explicit user approval.'
      : 'Command modifies dependencies, build artifacts, or workspace state — requires Allow/Deny approval.',
  }
}

function sanitizeToolPart(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
}

export async function buildDynamicAgentTools(
  mcpServers: McpServerRuntimeConfig[] | undefined,
  workspaceRoot: string,
): Promise<{
  tools: AgentToolDefinition[]
  mcpBindings: Map<string, DynamicMcpBinding>
}> {
  const tools: AgentToolDefinition[] = [...(AGENT_TOOL_DEFINITIONS as unknown as AgentToolDefinition[])]
  const mcpBindings = new Map<string, DynamicMcpBinding>()

  const enabledServers = (mcpServers ?? [])
    .filter((s) => s.enabled !== false && s.endpoint?.trim())
    .slice(0, 6)

  if (enabledServers.length === 0) {
    return { tools, mcpBindings }
  }

  const root = path.resolve(workspaceRoot)

  await Promise.all(
    enabledServers.map(async (server) => {
      const cacheKey = `${server.transport}:${server.endpoint.trim()}`
      const cached = MCP_DISCOVERY_CACHE.get(cacheKey)
      let discovered: McpToolInfo[] = []

      if (cached && Date.now() - cached.fetchedAt < MCP_CACHE_TTL_MS) {
        discovered = cached.tools
      } else {
        try {
          discovered = await Promise.race([
            listMcpServerTools(server.transport, server.endpoint.trim(), root),
            new Promise<McpToolInfo[]>((resolve) => setTimeout(() => resolve([]), 4_000)),
          ])
          MCP_DISCOVERY_CACHE.set(cacheKey, { fetchedAt: Date.now(), tools: discovered })
        } catch {
          discovered = []
        }
      }

      const serverSlug = sanitizeToolPart(server.name || server.id || 'mcp') || 'mcp'
      for (const tool of discovered.slice(0, 12)) {
        const toolSlug = sanitizeToolPart(tool.name)
        if (!toolSlug) continue
        const fnName = `mcp__${serverSlug}__${toolSlug}`.slice(0, 64)
        if (mcpBindings.has(fnName)) continue
        mcpBindings.set(fnName, {
          functionName: fnName,
          server,
          toolName: tool.name,
        })
        tools.push({
          type: 'function',
          function: {
            name: fnName,
            description: `[MCP ${server.name}] ${tool.description || tool.name}`.slice(0, 260),
            parameters:
              tool.inputSchema && typeof tool.inputSchema === 'object'
                ? tool.inputSchema
                : { type: 'object', properties: {} },
          },
        })
      }
    }),
  )

  return { tools, mcpBindings }
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'dist-desktop',
  'build',
  '.cache',
  'tools',
  '.playwright-cli',
  '.vincezone',
  'VinceZone Studio',
  'desktop',
])

const SAFE_VERIFY_PREFIXES = [
  'pnpm typecheck',
  'pnpm test',
  'pnpm exec tsc',
  'pnpm exec vitest',
  'npx tsc',
  'npx vitest',
  'npm test',
  'git status',
  'git diff',
  'git log',
  'node -v',
  'python --version',
]

export const AGENT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files inside a workspace directory (relative path, or empty for root).',
      parameters: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Relative directory path (default: root).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read lines from a file inside the active workspace.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Relative file path (e.g. src/app/page.tsx).' },
          startLine: { type: 'number', description: '1-based start line (default 1).' },
          endLine: { type: 'number', description: '1-based end line (default 200).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Search text across workspace source files and return matching file paths and line numbers.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Case-insensitive text to search for.' },
          dir: { type: 'string', description: 'Optional relative subfolder (e.g. src).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'semantic_search',
      description:
        'Find code blocks across the repository by natural-language intent/concept (local TF-IDF vector index over symbol chunks). Ideal when you do not know exact symbol or file names.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'Natural language concept or functionality to locate (e.g. "payment webhook verification").',
          },
          topK: { type: 'number', description: 'Number of top matching chunks to return (default 8).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create a new file or overwrite an existing workspace file with complete updated content and save it directly to disk.',
      parameters: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string', description: 'Relative file path (e.g. src/app/page.tsx).' },
          content: { type: 'string', description: 'Complete file content to write and save.' },
          summary: { type: 'string', description: 'Short 1-line summary of the edit.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_file',
      description:
        'Surgically edit an existing file using search/replace, or create/overwrite a file when search is omitted. Saves directly to disk.',
      parameters: {
        type: 'object',
        required: ['path', 'replace'],
        properties: {
          path: { type: 'string', description: 'Relative file path to modify or create.' },
          search: {
            type: 'string',
            description:
              'Existing text block to replace. Omit or leave empty when creating a new file or replacing entire content.',
          },
          replace: { type: 'string', description: 'Replacement text (or full content for new file).' },
          summary: { type: 'string', description: 'Short 1-line description of the change.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_verify',
      description:
        'Run a safe read-only verification command (pnpm typecheck, pnpm test, git status, git diff) inside the workspace.',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', description: 'Verification command to execute.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description:
        'Propose and execute a workspace shell command (e.g. pnpm add, npm install, gradlew assembleDebug, prisma migrate). Safe read-only commands run immediately; mutating commands pause and prompt the user with an Allow / Deny approval dialog.',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', description: 'Shell command to execute inside workspace root.' },
          reason: {
            type: 'string',
            description: 'Short explanation of why this command is needed for the user approval card.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_symbol',
      description:
        'Cross-file Codebase Symbol Index (LSP): jump to definitions, find all references across TS/JS/Python/Kotlin/Go/Rust files, or search exported symbols without reading entire files.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Exact symbol name or search keyword.' },
          mode: {
            type: 'string',
            enum: ['definition', 'references', 'search'],
            description: 'Lookup mode (default: definition).',
          },
          currentFile: {
            type: 'string',
            description: 'Optional relative path of current file for ranking nearby definitions.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'message_agent',
      description:
        'Send a direct message or task handoff across the Multi-Agent Communication Bridge to another specialist agent (e.g. FE, BE, QA, ARCH, SEC, PM, UIUX, DB, DEVOPS, ALL). The target agent will be woken up automatically to respond and report back.',
      parameters: {
        type: 'object',
        required: ['to_role', 'message'],
        properties: {
          to_role: {
            type: 'string',
            description: 'Target agent role code or name (e.g. FE, BE, QA, ARCH, SEC, PM, ALL).',
          },
          message: {
            type: 'string',
            description: 'Clear task, question, API contract, or review request for the teammate.',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of relevant relative file paths.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_android_logcat',
      description:
        'Read live Android ADB Logcat output and crash stacktraces (FATAL EXCEPTION / AndroidRuntime) from the running emulator or device to diagnose and fix Android bugs.',
      parameters: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['V', 'D', 'I', 'W', 'E'],
            description: 'Minimum logcat priority level (default: E for errors/crashes).',
          },
          filter: {
            type: 'string',
            description: 'Optional substring filter (e.g. package name or tag).',
          },
          lines: {
            type: 'number',
            description: 'Max recent lines to return (default: 100).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_team_bus',
      description:
        'Read recent inter-agent messages from the shared Multi-Agent Communication Bridge to see what teammates decided or changed.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max number of recent messages to read (default 10).' },
        },
      },
    },
  },
] as const

function stripReadFileLineNumbers(block: string): string {
  const lines = block.split('\n')
  const numbered = lines.filter((line) => /^\s*\d+:\s/.test(line))
  if (numbered.length >= Math.max(1, Math.ceil(lines.length * 0.6))) {
    return lines.map((line) => line.replace(/^\s*\d+:\s/, '')).join('\n')
  }
  return block
}

export function applySearchReplace(
  original: string,
  search: string | undefined,
  replace: string,
): { ok: true; nextContent: string } | { ok: false; error: string } {
  if (!search || !search.trim()) {
    return { ok: true, nextContent: replace }
  }
  const normalizedOrig = original.replace(/\r\n/g, '\n')
  const rawSearch = search.replace(/\r\n/g, '\n')
  const normalizedReplace = stripReadFileLineNumbers(replace.replace(/\r\n/g, '\n'))

  // 1) Exact match
  const exactIdx = normalizedOrig.indexOf(rawSearch)
  if (exactIdx !== -1) {
    return {
      ok: true,
      nextContent:
        normalizedOrig.slice(0, exactIdx) +
        normalizedReplace +
        normalizedOrig.slice(exactIdx + rawSearch.length),
    }
  }

  // 2) Match after stripping accidental `123: ` prefixes copied from read_file
  const cleanedSearch = stripReadFileLineNumbers(rawSearch)
  const cleanedIdx = normalizedOrig.indexOf(cleanedSearch)
  if (cleanedIdx !== -1) {
    return {
      ok: true,
      nextContent:
        normalizedOrig.slice(0, cleanedIdx) +
        normalizedReplace +
        normalizedOrig.slice(cleanedIdx + cleanedSearch.length),
    }
  }

  // 3) Trimmed line-sequence match (tolerates minor leading/trailing whitespace drift)
  const origLines = normalizedOrig.split('\n')
  const searchLines = cleanedSearch.split('\n').map((line) => line.trim())
  while (searchLines.length > 0 && searchLines[0] === '') searchLines.shift()
  while (searchLines.length > 0 && searchLines[searchLines.length - 1] === '') searchLines.pop()

  if (searchLines.length > 0) {
    for (let i = 0; i <= origLines.length - searchLines.length; i += 1) {
      let matched = true
      for (let j = 0; j < searchLines.length; j += 1) {
        if (origLines[i + j].trim() !== searchLines[j]) {
          matched = false
          break
        }
      }
      if (matched) {
        const nextLines = [
          ...origLines.slice(0, i),
          ...normalizedReplace.split('\n'),
          ...origLines.slice(i + searchLines.length),
        ]
        return { ok: true, nextContent: nextLines.join('\n') }
      }
    }
  }

  return {
    ok: false,
    error:
      'Search block not found in file. Call read_file to inspect exact lines or use write_file with complete updated content.',
  }
}

async function collectFiles(rootDir: string, dirPath: string, limit = 180): Promise<string[]> {
  const out: string[] = []
  async function walk(current: string) {
    if (out.length >= limit) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= limit) break
      if (IGNORED_DIRS.has(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        out.push(path.relative(rootDir, full).replace(/\\/g, '/'))
      }
    }
  }
  await walk(dirPath)
  return out
}

export type PendingCommandApproval = {
  id: string
  command: string
  reason: string
  cwd: string
  riskLevel: 'medium' | 'high'
}

export type ToolExecutionOutcome = {
  ok: boolean
  output: string
  fileUpdated?: {
    path: string
    summary: string
    previousContent: string | null
    nextContent: string
  }
  agentHandoff?: {
    toRole: string
    message: string
    files?: string[]
  }
  commandApproval?: PendingCommandApproval
}

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  workspaceRoot: string,
  options?: { mcpBindings?: Map<string, DynamicMcpBinding> },
): Promise<ToolExecutionOutcome> {
  try {
    return await executeAgentToolInner(name, args, workspaceRoot, options)
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : 'Tool execution failed.' }
  }
}

async function executeAgentToolInner(
  name: string,
  args: Record<string, unknown>,
  workspaceRoot: string,
  options?: { mcpBindings?: Map<string, DynamicMcpBinding> },
): Promise<ToolExecutionOutcome> {
  const root = path.resolve(workspaceRoot)

  // P1-1: Direct live MCP Server tool call
  const mcpBinding = options?.mcpBindings?.get(name)
  if (mcpBinding) {
    try {
      const result = await callMcpServerTool(
        mcpBinding.server.transport,
        mcpBinding.server.endpoint.trim(),
        mcpBinding.toolName,
        args,
        root,
      )
      const rendered =
        typeof result === 'string' ? result : JSON.stringify(result ?? {}, null, 2)
      return {
        ok: true,
        output: `[MCP ${mcpBinding.server.name} -> ${mcpBinding.toolName}]\n${rendered.slice(0, 9_000)}`,
      }
    } catch (err) {
      return {
        ok: false,
        output: `[MCP ${mcpBinding.server.name} -> ${mcpBinding.toolName} ERROR]: ${
          err instanceof Error ? err.message : 'MCP call failed.'
        }`,
      }
    }
  }

  if (name === 'list_files') {
    const rel = String(args.dir || '').trim()
    const targetDir = rel ? resolvePathInsideWorkspace(root, rel) : root
    const list = await collectFiles(root, targetDir, 150)
    return { ok: true, output: list.join('\n') || '(empty directory)' }
  }

  if (name === 'read_file') {
    const rel = String(args.path || '').trim()
    if (!rel) return { ok: false, output: 'Missing required "path".' }
    const target = resolvePathInsideWorkspace(root, rel)
    try {
      const text = await readFile(target, 'utf8')
      const lines = text.replace(/\r\n/g, '\n').split('\n')
      const start = Math.max(1, Number(args.startLine) || 1)
      const end = Math.min(lines.length, Math.max(start, Number(args.endLine) || start + 199))
      const slice = lines
        .slice(start - 1, end)
        .map((line, idx) => `${start + idx}: ${line}`)
        .join('\n')
      return {
        ok: true,
        output: `File ${rel} (lines ${start}-${end} of ${lines.length}):\n${slice.slice(0, 12_000)}`,
      }
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : 'Unable to read file.' }
    }
  }

  if (name === 'grep_search') {
    const query = String(args.query || '').trim()
    if (!query) return { ok: false, output: 'Missing required "query".' }
    const relDir = String(args.dir || '').trim()
    const searchRoot = relDir ? resolvePathInsideWorkspace(root, relDir) : root
    const allFiles = await collectFiles(root, searchRoot, 220)
    const lower = query.toLowerCase()
    const hits: string[] = []

    for (const relPath of allFiles) {
      if (hits.length >= 40) break
      if (/\.(png|jpe?g|ico|gif|webp|zip|exe|dll|lock|woff2?)$/i.test(relPath)) continue
      try {
        const content = await readFile(path.join(root, relPath), 'utf8')
        const lines = content.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lower)) {
            hits.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 140)}`)
            if (hits.length >= 40) break
          }
        }
      } catch {
        // skip unreadable
      }
    }

    return { ok: true, output: hits.join('\n') || `No matches found for "${query}".` }
  }

  if (
    name === 'patch_file' ||
    name === 'write_file' ||
    name === 'edit_file' ||
    name === 'create_file' ||
    name === 'save_file'
  ) {
    const rel = String(args.path || args.file || args.filePath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .trim()
    const replaceValue =
      typeof args.replace === 'string'
        ? args.replace
        : typeof args.content === 'string'
          ? args.content
          : typeof args.new_content === 'string'
            ? args.new_content
            : typeof args.new_string === 'string'
              ? args.new_string
              : typeof args.replacement === 'string'
                ? args.replacement
                : undefined
    const searchValue =
      name === 'write_file' || name === 'create_file' || name === 'save_file'
        ? undefined
        : typeof args.search === 'string'
          ? args.search
          : typeof args.old_string === 'string'
            ? args.old_string
            : typeof args.target === 'string'
              ? args.target
              : undefined
    const summary = String(args.summary || `Updated ${rel}`).slice(0, 180)
    if (!rel) return { ok: false, output: 'Missing required "path".' }
    if (typeof replaceValue !== 'string') {
      return { ok: false, output: 'Missing required "content" or "replace" string.' }
    }

    const target = resolvePathInsideWorkspace(root, rel)
    return withFileLock(target, async () => {
      let previousContent: string | null = null
      try {
        previousContent = await readFile(target, 'utf8')
      } catch {
        previousContent = null
      }

      const patched = applySearchReplace(previousContent ?? '', searchValue, replaceValue)
      if (!patched.ok) {
        return { ok: false, output: patched.error }
      }

      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, patched.nextContent, 'utf8')
      updateIndexedFile(root, rel, patched.nextContent)

      return {
        ok: true,
        output: `Successfully saved ${rel} to disk (${patched.nextContent.length} bytes).`,
        fileUpdated: {
          path: rel,
          summary,
          previousContent,
          nextContent: patched.nextContent,
        },
      }
    })
  }

  if (name === 'find_symbol') {
    const query = String(args.query || '').trim()
    const mode = String(args.mode || 'definition').trim()
    const currentFile = args.currentFile ? String(args.currentFile) : undefined
    if (!query) return { ok: false, output: 'Missing required "query".' }

    if (mode === 'references') {
      const refs = await findSymbolReferences(root, query, 50)
      if (!refs.length) {
        return { ok: true, output: `No cross-file references found for "${query}".` }
      }
      return {
        ok: true,
        output: refs
          .map(
            (r) =>
              `${r.path}:${r.line}:${r.column}${r.isDefinition ? ' [DEF]' : ''}: ${r.preview}`,
          )
          .join('\n'),
      }
    }

    if (mode === 'search') {
      const syms = await searchWorkspaceSymbols(root, query, 30)
      if (!syms.length) {
        return { ok: true, output: `No symbols matched "${query}".` }
      }
      return {
        ok: true,
        output: syms
          .map((s) => `${s.kind} ${s.name} — ${s.path}:${s.line} | ${s.signature}`)
          .join('\n'),
      }
    }

    // default: definition
    const defs = await findSymbolDefinitions(root, query, currentFile)
    if (!defs.length) {
      const fuzzy = await searchWorkspaceSymbols(root, query, 12)
      if (!fuzzy.length) {
        return { ok: true, output: `No definition found for symbol "${query}".` }
      }
      return {
        ok: true,
        output: `Exact definition not found; closest symbols:\n${fuzzy
          .map((s) => `${s.kind} ${s.name} — ${s.path}:${s.line} | ${s.signature}`)
          .join('\n')}`,
      }
    }
    return {
      ok: true,
      output: defs
        .slice(0, 12)
        .map((s) => `${s.kind} ${s.name} — ${s.path}:${s.line}:${s.column} | ${s.signature}`)
        .join('\n'),
    }
  }

  if (name === 'semantic_search') {
    const query = String(args.query || '').trim()
    if (!query) return { ok: false, output: 'Missing query parameter.' }
    const topK = Math.min(20, Math.max(1, Number(args.topK) || 8))
    const result = await semanticSearchWorkspace(root, query, topK)
    if (result.hits.length === 0) {
      return { ok: true, output: `No semantic matches for "${query}".` }
    }
    return {
      ok: true,
      output: result.hits
        .map(
          (h) =>
            `[${h.score}] ${h.path}:${h.startLine}-${h.endLine}${h.symbol ? ` (${h.symbol})` : ''}\n${h.preview}`,
        )
        .join('\n---\n'),
    }
  }

  if (name === 'run_shell') {
    const command = String(args.command || '').trim()
    const userReason = String(args.reason || '').trim()
    const verdict = classifyShellCommand(command)
    if (verdict.status === 'blocked') {
      return { ok: false, output: `Blocked: ${verdict.reason}` }
    }
    if (verdict.status === 'approval-required') {
      const approval: PendingCommandApproval = {
        id: `cmd-${randomUUID().slice(0, 8)}`,
        command,
        reason: userReason || verdict.reason,
        cwd: root,
        riskLevel: verdict.riskLevel === 'high' ? 'high' : 'medium',
      }
      registerPendingApproval({ id: approval.id, command: approval.command, cwd: approval.cwd })
      return {
        ok: true,
        output: `AWAITING_USER_APPROVAL [${approval.id}]: Command "${command}" requires user confirmation (Allow / Deny) in the IDE chat before execution. Do not retry automatically; wait for the user to approve or reject.`,
        commandApproval: approval,
      }
    }
    // Safe read-only command executes immediately
    const isWin = process.platform === 'win32'
    const shellBin = isWin ? 'powershell.exe' : '/bin/sh'
    const shellArgs = isWin
      ? ['-NoProfile', '-NonInteractive', '-Command', command]
      : ['-lc', command]
    try {
      const { stdout, stderr } = await execFileAsync(shellBin, shellArgs, {
        cwd: root,
        timeout: 35_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      return {
        ok: true,
        output: `Exit 0:\n${(stdout + '\n' + stderr).trim().slice(0, 6_000)}`,
      }
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
      return {
        ok: false,
        output: `Exit ${err.code ?? 1}:\n${(`${err.stdout || ''}\n${err.stderr || err.message || ''}`).trim().slice(0, 6_000)}`,
      }
    }
  }

  if (name === 'run_verify') {
    const command = String(args.command || '').trim()
    const verdict = classifyShellCommand(command)
    if (verdict.status !== 'safe') {
      return {
        ok: false,
        output: `Blocked: only verification commands (single-line read-only: ${SAFE_VERIFY_PREFIXES.join(', ')}) are permitted in autonomous tool loop.`,
      }
    }

    const isWin = process.platform === 'win32'
    const shellBin = isWin ? 'powershell.exe' : '/bin/sh'
    const shellArgs = isWin
      ? ['-NoProfile', '-NonInteractive', '-Command', command]
      : ['-lc', command]
    try {
      const { stdout, stderr } = await execFileAsync(shellBin, shellArgs, {
        cwd: root,
        timeout: 35_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      return {
        ok: true,
        output: `Exit 0:\n${(stdout + '\n' + stderr).trim().slice(0, 6_000)}`,
      }
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
      return {
        ok: false,
        output: `Exit ${err.code ?? 1}:\n${(`${err.stdout || ''}\n${err.stderr || err.message || ''}`).trim().slice(0, 6_000)}`,
      }
    }
  }

  if (name === 'message_agent') {
    const toRole = String(args.to_role || '').trim()
    const message = String(args.message || '').trim()
    const relatedFiles = Array.isArray(args.files)
      ? args.files.map((item) => String(item)).slice(0, 8)
      : undefined
    if (!toRole || !message) {
      return { ok: false, output: 'Both "to_role" and "message" are required.' }
    }
    return {
      ok: true,
      output: `Bridge queued delivery to @${toRole.replace(/^@/, '')}: "${message.slice(0, 160)}". The teammate will execute and report back on the shared Agent Bridge.`,
      agentHandoff: {
        toRole: toRole.replace(/^@/, ''),
        message,
        files: relatedFiles,
      },
    }
  }

  if (name === 'read_android_logcat') {
    const rawLevel = String(args.level || 'E').toUpperCase()
    const level = ['V', 'D', 'I', 'W', 'E', 'F'].includes(rawLevel) ? rawLevel : 'E'
    const filter = String(args.filter || '').trim().toLowerCase()
    const linesCount = Math.min(200, Math.max(20, Number(args.lines) || 100))

    const osHome = process.env.USERPROFILE || process.env.HOME || ''
    const ext = process.platform === 'win32' ? '.exe' : ''
    const adbCandidates = [
      process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', `adb${ext}`),
      process.env.ANDROID_SDK_ROOT &&
        path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', `adb${ext}`),
      osHome && path.join(osHome, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', `adb${ext}`),
      osHome && path.join(osHome, 'Library', 'Android', 'sdk', 'platform-tools', `adb${ext}`),
      `adb${ext}`,
    ].filter(Boolean) as string[]

    let lastErr = 'ADB binary not found.'
    for (const adbBin of adbCandidates) {
      try {
        const { stdout } = await execFileAsync(
          adbBin,
          ['logcat', '-d', '-v', 'time', '-t', String(linesCount), `*:${level}`],
          { timeout: 6000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
        )
        let lines = stdout.split(/\r?\n/).filter(Boolean)
        if (filter) lines = lines.filter((l) => l.toLowerCase().includes(filter))
        return {
          ok: true,
          output:
            lines.slice(-linesCount).join('\n').slice(0, 8_000) ||
            `No Android logcat entries found at level *:${level}.`,
        }
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'ADB logcat failed.'
      }
    }
    return { ok: false, output: `Could not read Android logcat: ${lastErr}` }
  }

  if (name === 'read_team_bus') {
    const limit = Math.min(25, Math.max(1, Number(args.limit) || 10))
    const busFile = path.join(root, '.vincezone', 'agent-bridge.json')
    try {
      const raw = await readFile(busFile, 'utf8')
      const parsed = JSON.parse(raw) as {
        messages?: Array<{
          timestamp?: string
          fromAgentName?: string
          fromRole?: string
          toAgentName?: string
          toRole?: string
          kind?: string
          content?: string
        }>
      }
      const list = (parsed.messages ?? []).slice(-limit)
      if (list.length === 0) {
        return { ok: true, output: 'Team Bridge Bus is currently empty.' }
      }
      return {
        ok: true,
        output: list
          .map(
            (m) =>
              `[${(m.timestamp || '').slice(11, 19)}] ${m.fromAgentName} (@${m.fromRole}) -> ${m.toAgentName} (@${m.toRole}) (${m.kind}): ${m.content}`,
          )
          .join('\n'),
      }
    } catch {
      return { ok: true, output: 'Team Bridge Bus has no recorded messages yet.' }
    }
  }

  return { ok: false, output: `Unknown tool "${name}".` }
}
