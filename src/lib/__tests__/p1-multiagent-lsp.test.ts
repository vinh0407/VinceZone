import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDynamicAgentTools,
  classifyShellCommand,
  executeAgentTool,
} from '../agent-tools'
import {
  findSymbolDefinitions,
  findSymbolReferences,
  invalidateCodeIndex,
} from '../code-index'
import { applyHunkDecisions, computeDiffHunks } from '../hunk-diff'

describe('P1-1: Live MCP Server Tools in AI Agent Loop', () => {
  it('discovers tools from an enabled stdio MCP server and calls them through executeAgentTool', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-p1-mcp-'))
    const serverFile = path.join(tmp, 'mock-mcp.mjs')
    await writeFile(
      serverFile,
      [
        `import readline from 'node:readline'`,
        `const rl = readline.createInterface({ input: process.stdin })`,
        `rl.on('line', (line) => {`,
        `  if (!line.trim()) return`,
        `  const msg = JSON.parse(line)`,
        `  if (msg.method === 'initialize') {`,
        `    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} } } }) + '\\n')`,
        `  } else if (msg.method === 'tools/list') {`,
        `    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'add_numbers', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } }] } }) + '\\n')`,
        `  } else if (msg.method === 'tools/call') {`,
        `    const sum = Number(msg.params.arguments.a) + Number(msg.params.arguments.b)`,
        `    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: String(sum) }] } }) + '\\n')`,
        `  }`,
        `})`,
      ].join('\n'),
      'utf8',
    )

    try {
      const { tools, mcpBindings } = await buildDynamicAgentTools(
        [
          {
            id: 'calc',
            name: 'Calc MCP',
            transport: 'stdio',
            endpoint: `"${process.execPath}" "${serverFile}"`,
            enabled: true,
          },
        ],
        tmp,
      )

      expect(tools.some((t) => t.function.name === 'mcp__calc_mcp__add_numbers')).toBe(true)
      expect(mcpBindings.has('mcp__calc_mcp__add_numbers')).toBe(true)

      const res = await executeAgentTool(
        'mcp__calc_mcp__add_numbers',
        { a: 19, b: 23 },
        tmp,
        { mcpBindings },
      )
      expect(res.ok).toBe(true)
      expect(res.output).toContain('42')
    } finally {
      await new Promise((r) => setTimeout(r, 120))
      await rm(tmp, { recursive: true, force: true, maxRetries: 6, retryDelay: 80 }).catch(() => {})
    }
  }, 15_000)
})

describe('P1-2: Safe Allow/Deny Shell Command Approval', () => {
  it('classifies safe, approval-required, and catastrophic blocked commands accurately', async () => {
    expect(classifyShellCommand('pnpm test').status).toBe('safe')
    expect(classifyShellCommand('git status').status).toBe('safe')

    const addVerdict = classifyShellCommand('pnpm add zod')
    expect(addVerdict.status).toBe('approval-required')
    expect(addVerdict.riskLevel).toBe('medium')

    const gradleVerdict = classifyShellCommand('./gradlew assembleDebug')
    expect(gradleVerdict.status).toBe('approval-required')

    const highRisk = classifyShellCommand('npx prisma migrate reset')
    expect(highRisk.status).toBe('approval-required')
    expect(highRisk.riskLevel).toBe('high')

    expect(classifyShellCommand('rm -rf /').status).toBe('blocked')

    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-p1-shell-'))
    try {
      const outcome = await executeAgentTool(
        'run_shell',
        { command: 'pnpm add zod', reason: 'Install schema validation' },
        tmp,
      )
      expect(outcome.ok).toBe(true)
      expect(outcome.commandApproval).toBeDefined()
      expect(outcome.commandApproval?.command).toBe('pnpm add zod')
      expect(outcome.commandApproval?.reason).toBe('Install schema validation')
    } finally {
      await new Promise((r) => setTimeout(r, 120))
      await rm(tmp, { recursive: true, force: true, maxRetries: 6, retryDelay: 80 }).catch(() => {})
    }
  })
})

describe('P1-3: Cross-File Codebase Index & LSP', () => {
  it('resolves definitions and cross-file references across TS, Python & Kotlin', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-p1-idx-'))
    try {
      await writeFile(
        path.join(tmp, 'math.ts'),
        `export function computeTotal(price: number, qty: number) {\n  return price * qty\n}\n`,
        'utf8',
      )
      await writeFile(
        path.join(tmp, 'checkout.ts'),
        `import { computeTotal } from './math'\nexport const total = computeTotal(15, 3)\n`,
        'utf8',
      )
      await writeFile(
        path.join(tmp, 'worker.py'),
        `class OrderProcessor:\n    def process_order(self, item):\n        return item\n`,
        'utf8',
      )
      await writeFile(
        path.join(tmp, 'Main.kt'),
        `class PaymentGateway {\n    fun chargeCard(amount: Int): Boolean = amount > 0\n}\n`,
        'utf8',
      )

      invalidateCodeIndex(tmp)
      const tsDefs = await findSymbolDefinitions(tmp, 'computeTotal', 'checkout.ts')
      expect(tsDefs[0]?.path).toBe('math.ts')
      expect(tsDefs[0]?.line).toBe(1)

      const tsRefs = await findSymbolReferences(tmp, 'computeTotal')
      expect(tsRefs.some((r) => r.path === 'math.ts' && r.isDefinition)).toBe(true)
      expect(tsRefs.some((r) => r.path === 'checkout.ts' && !r.isDefinition)).toBe(true)

      const pyDefs = await findSymbolDefinitions(tmp, 'OrderProcessor')
      expect(pyDefs[0]?.path).toBe('worker.py')
      expect(pyDefs[0]?.kind).toBe('class')

      const ktDefs = await findSymbolDefinitions(tmp, 'chargeCard')
      expect(ktDefs[0]?.path).toBe('Main.kt')
      expect(ktDefs[0]?.line).toBe(2)

      const toolRes = await executeAgentTool(
        'find_symbol',
        { query: 'computeTotal', mode: 'references' },
        tmp,
      )
      expect(toolRes.ok).toBe(true)
      expect(toolRes.output).toContain('checkout.ts:2')
    } finally {
      invalidateCodeIndex(tmp)
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('P1-4: Per-Hunk Inline Diff Accept / Reject', () => {
  it('computes independent hunks and selectively rejects one hunk while preserving others', () => {
    const original = [
      'const a = 1',
      'const b = 2',
      'const c = 3',
      'const d = 4',
      'const e = 5',
      'const f = 6',
    ].join('\n')

    const proposed = [
      'const a = 100',
      'const b = 2',
      'const c = 3',
      'const d = 4',
      'const e = 500',
      'const extra = 999',
      'const f = 6',
    ].join('\n')

    const hunks = computeDiffHunks(original, proposed)
    expect(hunks).toHaveLength(2)
    expect(hunks[0].id).toBe('hunk-1')
    expect(hunks[0].removedLines).toEqual(['const a = 1'])
    expect(hunks[0].addedLines).toEqual(['const a = 100'])
    expect(hunks[1].id).toBe('hunk-2')
    expect(hunks[1].addedLines).toEqual(['const e = 500', 'const extra = 999'])

    // Reject hunk-1, accept hunk-2
    const merged = applyHunkDecisions(original, proposed, {
      'hunk-1': 'rejected',
      'hunk-2': 'accepted',
    })
    expect(merged).toBe(
      [
        'const a = 1',
        'const b = 2',
        'const c = 3',
        'const d = 4',
        'const e = 500',
        'const extra = 999',
        'const f = 6',
      ].join('\n'),
    )
  })
})
