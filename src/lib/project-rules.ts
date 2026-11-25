import type { Message, TerminalHistoryEntry, WorkspaceFile } from '@/components/ide/agent-types'
import type { EditorDiagnostic } from '@/components/ide/status-bar'

const RULE_FILE_CANDIDATES = [
  '.vincezonerules',
  'vincezone.rules.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
]

/**
 * Automatically loads repository-level AI conventions (`.vincezonerules`, `AGENTS.md`,
 * `CLAUDE.md`, `.cursorrules`, etc.) from the active workspace so every Agent follows
 * the project's exact coding standards without manual repetition.
 */
export function extractProjectRules(files: WorkspaceFile[]): {
  sources: string[]
  promptBlock: string
} {
  const matched: Array<{ path: string; content: string }> = []
  for (const candidate of RULE_FILE_CANDIDATES) {
    const found = files.find(
      (f) => f.path.replace(/\\/g, '/').toLowerCase() === candidate.toLowerCase() && f.content?.trim(),
    )
    if (found) {
      matched.push({ path: found.path, content: found.content.trim() })
    }
  }
  if (matched.length === 0) return { sources: [], promptBlock: '' }

  const combined = matched
    .map((m) => `### Project Rule File: ${m.path}\n${m.content.slice(0, 1_800)}`)
    .join('\n\n')
    .slice(0, 4_200)

  return {
    sources: matched.map((m) => m.path),
    promptBlock: `REPOSITORY CONVENTIONS & RULES (auto-loaded — follow strictly):\n${combined}`,
  }
}

/**
 * Resolves smart `@errors`, `@terminal`, `@git`, and `@url:https://...` mentions
 * inside a user chat message into structured context blocks for the AI Agent.
 */
export async function resolveDynamicContextMentions(input: {
  text: string
  diagnostics?: EditorDiagnostic[]
  terminalEntries?: TerminalHistoryEntry[]
  rootPath?: string
}): Promise<{ badges: string[]; promptBlock: string }> {
  const { text, diagnostics = [], terminalEntries = [], rootPath } = input
  const badges: string[] = []
  const sections: string[] = []

  if (/(?:^|\s)@errors\b/i.test(text)) {
    badges.push(`@errors (${diagnostics.length})`)
    if (diagnostics.length === 0) {
      sections.push('### @errors (IDE Problems)\nNo active editor diagnostics/errors.')
    } else {
      const list = diagnostics
        .slice(0, 25)
        .map((d) => `- [${d.severity.toUpperCase()}] ${d.path}:${d.line}:${d.column} — ${d.message}`)
        .join('\n')
      sections.push(`### @errors (IDE Problems)\n${list}`)
    }
  }

  if (/(?:^|\s)@terminal\b/i.test(text)) {
    const recent = terminalEntries.slice(-3)
    badges.push(`@terminal (${recent.length})`)
    if (recent.length === 0) {
      sections.push('### @terminal\nNo recent terminal command output recorded.')
    } else {
      const log = recent
        .map(
          (e) =>
            `$ ${e.command} (exit ${e.exitCode})\n${e.stdout ? e.stdout.slice(-900) : ''}${e.stderr ? `\n[stderr] ${e.stderr.slice(-900)}` : ''}`.trim(),
        )
        .join('\n---\n')
      sections.push(`### @terminal (Recent Output)\n\`\`\`\n${log.slice(0, 2_400)}\n\`\`\``)
    }
  }

  if (/(?:^|\s)@git\b/i.test(text) && rootPath && typeof fetch === 'function') {
    try {
      const res = await fetch(`/api/git?root=${encodeURIComponent(rootPath)}`, { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as {
          isRepo?: boolean
          branch?: string
          ahead?: number
          behind?: number
          changes?: Array<{ path: string; indexStatus: string; worktreeStatus: string }>
          commits?: Array<{ hash: string; subject: string }>
        }
        if (data.isRepo) {
          badges.push(`@git (${data.branch || 'main'})`)
          const changed = (data.changes ?? [])
            .slice(0, 25)
            .map((c) => `  ${c.indexStatus}${c.worktreeStatus} ${c.path}`)
            .join('\n')
          const recentCommits = (data.commits ?? [])
            .slice(0, 5)
            .map((c) => `  ${c.hash} ${c.subject}`)
            .join('\n')
          sections.push(
            `### @git (Branch: ${data.branch}, ↑${data.ahead ?? 0} ↓${data.behind ?? 0})\nChanged files:\n${changed || '  (clean)'}\nRecent commits:\n${recentCommits || '  (none)'}`,
          )
        }
      }
    } catch {
      // ignore
    }
  }

  const urlMatch = text.match(/(?:^|\s)@url:(https?:\/\/[^\s]+)/i)
  if (urlMatch && typeof fetch === 'function') {
    const targetUrl = urlMatch[1]
    try {
      const res = await fetch('/api/context-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      })
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; title?: string; text?: string }
        if (data.ok && data.text) {
          badges.push(`@url (${new URL(targetUrl).hostname})`)
          sections.push(
            `### @url (${data.title || targetUrl})\nSource: ${targetUrl}\n${data.text.slice(0, 3_500)}`,
          )
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    badges,
    promptBlock: sections.join('\n\n'),
  }
}

/**
 * Estimates current chat context window saturation for the live Context Meter UI.
 */
export function estimateContextMeter(
  messages: Message[],
  maxTokens = 128_000,
): {
  usedTokens: number
  maxTokens: number
  percent: number
  level: 'low' | 'medium' | 'high'
} {
  let chars = 2_400 // baseline system prompt + project snapshot
  for (const m of messages) {
    chars += (m.text?.length ?? 0) + (m.codeSnippet?.length ?? 0) + (m.images?.length ?? 0) * 3_200
  }
  const usedTokens = Math.max(0, Math.round(chars / 3.8))
  const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 100))
  const level = percent >= 75 ? 'high' : percent >= 45 ? 'medium' : 'low'
  return { usedTokens, maxTokens, percent, level }
}
