import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GET as worktreeGet } from '@/app/(frontend)/api/worktree/route'
import { sanitizeWorktreeSlug } from '@/lib/agent-worktree'
import { exportAgentChatToMarkdown } from '@/lib/chat-export'
import { formatCodeWithProjectTool } from '@/lib/code-formatter'
import { parseMergeConflicts, resolveMergeConflict } from '@/lib/merge-conflicts'
import { invalidateSemanticIndex, semanticSearchWorkspace } from '@/lib/semantic-index'
import {
  getTsDefinitionAtPosition,
  getTsHoverInfoAtPosition,
  getTsReferencesAtPosition,
  invalidateTsLanguageService,
  renameTsSymbolAtPosition,
} from '@/lib/ts-language-service'

const require = createRequire(import.meta.url)
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    invalidateTsLanguageService(dir)
    invalidateSemanticIndex(dir)
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

describe('P7 Advanced IDE Engine & Production Hardening', () => {
  it('runs real TypeScript AST Go-to-Definition, References, Hover, and scope-safe Rename', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-ts-ast-'))
    tempDirs.push(tmp)

    const pricingFile = path.join(tmp, 'pricing.ts')
    const checkoutFile = path.join(tmp, 'checkout.ts')

    await writeFile(
      pricingFile,
      [
        '/** Computes final order price with tax */',
        'export function computePrice(base: number): number {',
        '  return base * 1.1',
        '}',
        '',
        'export const note = "computePrice should stay untouched inside strings"',
        '// computePrice should stay untouched inside comments',
      ].join('\n'),
      'utf8',
    )
    await writeFile(
      checkoutFile,
      [
        'import { computePrice } from "./pricing"',
        'export function runCheckout(amount: number) {',
        '  return computePrice(amount)',
        '}',
        'export function shadowedExample() {',
        '  const computePrice = 42',
        '  return computePrice',
        '}',
      ].join('\n'),
      'utf8',
    )

    // 1. Go to Definition from checkout.ts line 3 ("return computePrice(amount)")
    const defs = getTsDefinitionAtPosition(tmp, 'checkout.ts', 3, 12)
    expect(defs.length).toBeGreaterThanOrEqual(1)
    expect(defs[0].path).toBe('pricing.ts')
    expect(defs[0].line).toBe(2)

    // 2. Hover QuickInfo returns true TS signature + JSDoc
    const hover = getTsHoverInfoAtPosition(tmp, 'checkout.ts', 3, 12)
    expect(hover?.display).toContain('computePrice')
    expect(hover?.display).toContain('number')
    expect(hover?.documentation).toContain('Computes final order price with tax')

    // 3. Semantic references skip comments, strings, and shadowed local variables
    const refs = getTsReferencesAtPosition(tmp, 'pricing.ts', 2, 19)
    expect(refs.some((r) => r.path === 'pricing.ts' && r.line === 2)).toBe(true)
    expect(refs.some((r) => r.path === 'checkout.ts' && r.line === 3)).toBe(true)
    expect(refs.some((r) => r.path === 'checkout.ts' && r.line === 6)).toBe(false)

    // 4. AST-accurate cross-file rename preserves strings, comments, and shadowed local variable!
    const renamed = await renameTsSymbolAtPosition(tmp, 'pricing.ts', 2, 19, 'calculateTotalPrice')
    expect(renamed.engine).toBe('typescript-ast')
    expect(renamed.filesUpdated).toBe(2)

    const nextPricing = await readFile(pricingFile, 'utf8')
    const nextCheckout = await readFile(checkoutFile, 'utf8')
    expect(nextPricing).toContain('export function calculateTotalPrice(base: number): number')
    expect(nextPricing).toContain('"computePrice should stay untouched inside strings"')
    expect(nextPricing).toContain('// computePrice should stay untouched inside comments')
    expect(nextCheckout).toContain('import { calculateTotalPrice } from "./pricing"')
    expect(nextCheckout).toContain('return calculateTotalPrice(amount)')
    expect(nextCheckout).toContain('const computePrice = 42')
  })

  it('parses and resolves 3-way Git merge conflicts cleanly (current / incoming / both)', () => {
    const raw = [
      'const a = 1',
      '<<<<<<< HEAD',
      'const mode = "dark"',
      '=======',
      'const mode = "gold"',
      '>>>>>>> feat/gold-theme',
      'export { a, mode }',
    ].join('\n')

    const conflicts = parseMergeConflicts(raw)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].currentLabel).toBe('HEAD')
    expect(conflicts[0].incomingLabel).toBe('feat/gold-theme')

    expect(resolveMergeConflict(raw, conflicts[0].id, 'current')).toBe(
      'const a = 1\nconst mode = "dark"\nexport { a, mode }',
    )
    expect(resolveMergeConflict(raw, conflicts[0].id, 'incoming')).toBe(
      'const a = 1\nconst mode = "gold"\nexport { a, mode }',
    )
    expect(resolveMergeConflict(raw, conflicts[0].id, 'both')).toBe(
      'const a = 1\nconst mode = "dark"\nconst mode = "gold"\nexport { a, mode }',
    )
  })

  it('ranks relevant code chunks via local semantic code search', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-semantic-'))
    tempDirs.push(tmp)

    await writeFile(
      path.join(tmp, 'stripe-webhook.ts'),
      'export function verifyPaymentWebhookSignature(payload: string, headerSig: string) {\n  return payload.length > 0 && headerSig.startsWith("t=")\n}\n',
      'utf8',
    )
    await writeFile(
      path.join(tmp, 'theme.ts'),
      'export function getPrimaryGoldColor() {\n  return "#c9a24d"\n}\n',
      'utf8',
    )

    const result = await semanticSearchWorkspace(tmp, 'payment webhook signature verification', 5)
    expect(result.hits.length).toBeGreaterThanOrEqual(1)
    expect(result.hits[0].path).toBe('stripe-webhook.ts')
    expect(result.hits[0].symbol).toBe('verifyPaymentWebhookSignature')
  })

  it('formats JSON buffers cleanly and exports agent chat to Markdown', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-fmt-'))
    tempDirs.push(tmp)

    const formatted = await formatCodeWithProjectTool({
      workspaceRoot: tmp,
      filePath: 'config.json',
      content: '{"b":2,"a":1}',
    })
    expect(formatted.formatted).toBe(true)
    expect(formatted.content).toBe('{\n  "b": 2,\n  "a": 1\n}\n')

    const md = exportAgentChatToMarkdown(
      {
        id: 'pm',
        name: 'PM Orchestrator',
        role: 'Project Manager',
        roleId: 'pm',
        model: 'gpt-5',
        accent: '#c9a24d',
        status: 'idle',
        messages: [
          { id: '1', role: 'user', text: 'Audit auth flow' },
          { id: '2', role: 'assistant', text: 'All checks passed.' },
        ],
      },
      'VinceZone',
    )
    expect(md).toContain('# VinceZone Studio Transcript — PM Orchestrator')
    expect(md).toContain('## User')
    expect(md).toContain('Audit auth flow')
    expect(md).toContain('All checks passed.')
  })

  it('sanitizes worktree slugs, guards /api/worktree, and rotates desktop crash logs', async () => {
    expect(sanitizeWorktreeSlug('FE / Login Page!!')).toBe('fe-login-page')
    expect(() => sanitizeWorktreeSlug('!!!')).toThrow()

    const badReq = new Request('http://evil.example/api/worktree', {
      headers: { host: 'evil.example' },
    })
    const res = await worktreeGet(badReq)
    expect(res.status).toBe(403)

    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-logs-'))
    tempDirs.push(tmp)
    const { createRotatingLogger } = require(path.resolve('electron', 'rotating-logger.cjs')) as {
      createRotatingLogger: (
        p: string,
        opts?: { maxBytes?: number; maxBackups?: number },
      ) => { info: (m: string, d?: string) => void; error: (m: string, d?: string) => void }
    }
    const logPath = path.join(tmp, 'vincezone-main.log')
    const logger = createRotatingLogger(logPath, { maxBytes: 120, maxBackups: 2 })
    logger.info('line-1', 'x'.repeat(80))
    logger.error('line-2', 'y'.repeat(80))
    logger.info('line-3', 'z'.repeat(80))

    expect(existsSync(logPath)).toBe(true)
    expect(existsSync(`${logPath}.1`)).toBe(true)
  })
})
