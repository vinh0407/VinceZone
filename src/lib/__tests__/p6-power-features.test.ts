import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { POST as contextFetchPost } from '@/app/(frontend)/api/context-fetch/route'
import { defaultAppSettings } from '@/components/ide/workspace-defaults'
import { invalidateCodeIndex, renameSymbolAcrossWorkspace } from '@/lib/code-index'
import { buildDiagnosticsReport } from '@/lib/diagnostics-export'
import {
  estimateContextMeter,
  extractProjectRules,
  resolveDynamicContextMentions,
} from '@/lib/project-rules'
import { extractSymbolsFromSource } from '@/lib/symbol-outline'

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    invalidateCodeIndex(dir)
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

describe('P6 Power Features', () => {
  it('auto-loads repository rule files (.vincezonerules & AGENTS.md)', () => {
    const res = extractProjectRules([
      { path: 'src/index.ts', name: 'index.ts', language: 'typescript', content: 'export const x = 1' },
      { path: '.vincezonerules', name: '.vincezonerules', language: 'plaintext', content: 'Always use strict TS.' },
      { path: 'AGENTS.md', name: 'AGENTS.md', language: 'markdown', content: 'Run vitest before commit.' },
    ])
    expect(res.sources).toEqual(['.vincezonerules', 'AGENTS.md'])
    expect(res.promptBlock).toContain('Always use strict TS.')
    expect(res.promptBlock).toContain('Run vitest before commit.')
  })

  it('resolves @errors and @terminal dynamic context mentions', async () => {
    const resolved = await resolveDynamicContextMentions({
      text: 'Fix @errors using @terminal logs',
      diagnostics: [
        {
          path: 'src/app.ts',
          line: 12,
          column: 4,
          severity: 'error',
          message: 'Cannot find name foo',
        },
      ],
      terminalEntries: [
        {
          id: 't1',
          command: 'pnpm test',
          cwd: '/repo',
          stdout: 'FAIL src/app.test.ts',
          stderr: 'ReferenceError: foo is not defined',
          exitCode: 1,
          durationMs: 220,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    expect(resolved.badges).toContain('@errors (1)')
    expect(resolved.badges).toContain('@terminal (1)')
    expect(resolved.promptBlock).toContain('Cannot find name foo')
    expect(resolved.promptBlock).toContain('ReferenceError: foo is not defined')
  })

  it('estimates context window meter saturation levels accurately', () => {
    const low = estimateContextMeter([{ id: '1', role: 'user', text: 'hello' }], 10_000)
    expect(low.level).toBe('low')
    expect(low.percent).toBeLessThan(45)

    const high = estimateContextMeter(
      [{ id: '2', role: 'assistant', text: 'x'.repeat(35_000) }],
      10_000,
    )
    expect(high.level).toBe('high')
    expect(high.percent).toBeGreaterThanOrEqual(75)
  })

  it('blocks SSRF targets (loopback / private IP / non-http) in /api/context-fetch', async () => {
    for (const badUrl of [
      'http://127.0.0.1:8080/secret',
      'http://localhost:3000/api/workspace',
      'http://192.168.1.1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
    ]) {
      const req = new Request('http://127.0.0.1:40704/api/context-fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: '127.0.0.1:40704',
        },
        body: JSON.stringify({ url: badUrl }),
      })
      const res = await contextFetchPost(req)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
    }
  })

  it('extracts file outline symbols & performs safe word-boundary cross-file rename (F2)', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-rename-'))
    tempDirs.push(tmp)

    const fileA = path.join(tmp, 'math.ts')
    const fileB = path.join(tmp, 'app.ts')
    await writeFile(
      fileA,
      'export function computeTotal(n: number) {\n  return n * 2\n}\nexport const computeTotalPlus = 10\n',
      'utf8',
    )
    await writeFile(
      fileB,
      'import { computeTotal } from "./math"\nexport const out = computeTotal(5)\n',
      'utf8',
    )

    const outline = extractSymbolsFromSource('math.ts', await readFile(fileA, 'utf8'))
    expect(outline.map((s) => s.name)).toEqual(['computeTotal', 'computeTotalPlus'])

    const result = await renameSymbolAcrossWorkspace(tmp, 'computeTotal', 'calculateSum')
    expect(result.filesUpdated).toBe(2)
    expect(result.occurrences).toBe(3)

    const nextA = await readFile(fileA, 'utf8')
    const nextB = await readFile(fileB, 'utf8')
    expect(nextA).toContain('export function calculateSum(n: number)')
    // Must NOT corrupt partial substring match!
    expect(nextA).toContain('export const computeTotalPlus = 10')
    expect(nextB).toContain('import { calculateSum } from "./math"')
    expect(nextB).toContain('export const out = calculateSum(5)')
  })

  it('redacts all API keys and bearer tokens in buildDiagnosticsReport', () => {
    const report = buildDiagnosticsReport({
      projectName: 'Demo',
      rootPath: '/repo',
      files: [],
      agents: [],
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-super-secret-12345',
          model: 'gpt-5',
          models: 'gpt-5',
        },
      ],
      appSettings: defaultAppSettings,
      diagnostics: [],
      terminalEntries: [
        {
          id: 't1',
          command: 'echo ok',
          cwd: '/repo',
          stdout: 'ok',
          stderr: 'Bearer super-secret-token',
          exitCode: 0,
          durationMs: 10,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
      gitBranch: 'main',
    })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('sk-super-secret-12345')
    expect(serialized).not.toContain('super-secret-token')
    expect(report.providers[0].hasApiKey).toBe(true)
    expect(report.workspace.gitBranch).toBe('main')
  })
})
