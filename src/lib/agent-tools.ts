import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolvePathInsideWorkspace } from './local-guard'

const execFileAsync = promisify(execFile)

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
      name: 'patch_file',
      description:
        'Surgically edit an existing file using exact search/replace, or create a new file when search is empty.',
      parameters: {
        type: 'object',
        required: ['path', 'replace'],
        properties: {
          path: { type: 'string', description: 'Relative file path to modify or create.' },
          search: {
            type: 'string',
            description:
              'Exact existing text block to replace. Omit or leave empty ONLY when creating a new file or replacing entire content.',
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
        'Run a safe verification command (pnpm typecheck, pnpm test, git status, git diff) inside the workspace.',
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

export function applySearchReplace(
  original: string,
  search: string | undefined,
  replace: string,
): { ok: true; nextContent: string } | { ok: false; error: string } {
  if (!search || !search.trim()) {
    return { ok: true, nextContent: replace }
  }
  const normalizedOrig = original.replace(/\r\n/g, '\n')
  const normalizedSearch = search.replace(/\r\n/g, '\n')
  const normalizedReplace = replace.replace(/\r\n/g, '\n')

  const idx = normalizedOrig.indexOf(normalizedSearch)
  if (idx === -1) {
    return {
      ok: false,
      error: 'Search block not found verbatim in file. Read the exact lines first before patching.',
    }
  }
  const nextContent =
    normalizedOrig.slice(0, idx) +
    normalizedReplace +
    normalizedOrig.slice(idx + normalizedSearch.length)
  return { ok: true, nextContent }
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
}

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  workspaceRoot: string,
): Promise<ToolExecutionOutcome> {
  try {
    return await executeAgentToolInner(name, args, workspaceRoot)
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : 'Tool execution failed.' }
  }
}

async function executeAgentToolInner(
  name: string,
  args: Record<string, unknown>,
  workspaceRoot: string,
): Promise<ToolExecutionOutcome> {
  const root = path.resolve(workspaceRoot)

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

  if (name === 'patch_file') {
    const rel = String(args.path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
    const replace = typeof args.replace === 'string' ? args.replace : ''
    const search = typeof args.search === 'string' ? args.search : undefined
    const summary = String(args.summary || `Updated ${rel}`).slice(0, 180)
    if (!rel) return { ok: false, output: 'Missing required "path".' }

    const target = resolvePathInsideWorkspace(root, rel)
    let previousContent: string | null = null
    try {
      previousContent = await readFile(target, 'utf8')
    } catch {
      previousContent = null
    }

    const patched = applySearchReplace(previousContent ?? '', search, replace)
    if (!patched.ok) {
      return { ok: false, output: patched.error }
    }

    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, patched.nextContent, 'utf8')

    return {
      ok: true,
      output: `Successfully patched ${rel} (${patched.nextContent.length} bytes).`,
      fileUpdated: {
        path: rel,
        summary,
        previousContent,
        nextContent: patched.nextContent,
      },
    }
  }

  if (name === 'run_verify') {
    const command = String(args.command || '').trim()
    const allowed = SAFE_VERIFY_PREFIXES.some((prefix) => command.toLowerCase().startsWith(prefix))
    if (!allowed) {
      return {
        ok: false,
        output: `Blocked: only verification commands (${SAFE_VERIFY_PREFIXES.join(', ')}) are permitted in autonomous tool loop.`,
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
