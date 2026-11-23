import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applySearchReplace, executeAgentTool } from '../agent-tools'
import { extractProposedPatches } from '../orchestrator'

const tempDirs: string[] = []

async function makeTempWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vincezone-tools-'))
  tempDirs.push(dir)
  await fs.mkdir(path.join(dir, 'src'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'src', 'hello.ts'),
    'export function greet(name: string) {\n  return `Hello, ${name}!`\n}\n',
    'utf8',
  )
  return dir
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }
})

describe('applySearchReplace', () => {
  it('replaces an exact snippet in place', () => {
    const result = applySearchReplace('const x = 1\nconst y = 2\n', 'const x = 1', 'const x = 42')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.nextContent).toBe('const x = 42\nconst y = 2\n')
    }
  })

  it('creates full file content when search is empty', () => {
    const result = applySearchReplace('', '', 'export const created = true\n')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.nextContent).toBe('export const created = true\n')
    }
  })

  it('fails clearly when search snippet does not exist', () => {
    const result = applySearchReplace('const a = 1', 'const missing = 9', 'const b = 2')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not found')
    }
  })
})

describe('executeAgentTool', () => {
  it('lists files, reads line ranges, greps, and patches files on disk', async () => {
    const root = await makeTempWorkspace()

    const listRes = await executeAgentTool('list_files', {}, root)
    expect(listRes.ok).toBe(true)
    expect(listRes.output).toContain('src/hello.ts')

    const readRes = await executeAgentTool(
      'read_file',
      { path: 'src/hello.ts', start_line: 1, end_line: 3 },
      root,
    )
    expect(readRes.ok).toBe(true)
    expect(readRes.output).toContain('1: export function greet')

    const grepRes = await executeAgentTool('grep_search', { query: 'greet' }, root)
    expect(grepRes.ok).toBe(true)
    expect(grepRes.output).toContain('src/hello.ts:1:')

    const patchRes = await executeAgentTool(
      'patch_file',
      {
        path: 'src/hello.ts',
        search: 'Hello, ${name}!',
        replace: 'Welcome, ${name}!',
      },
      root,
    )
    expect(patchRes.ok).toBe(true)
    expect(patchRes.fileUpdated?.path).toBe('src/hello.ts')
    expect(patchRes.fileUpdated?.nextContent).toContain('Welcome, ${name}!')

    const onDisk = await fs.readFile(path.join(root, 'src', 'hello.ts'), 'utf8')
    expect(onDisk).toContain('Welcome, ${name}!')
  })

  it('handles line-number prefixes copied from read_file and indentation shifts', () => {
    const orig = 'export function greet(name: string) {\n  return `Hello, ${name}!`\n}\n'
    const res = applySearchReplace(
      orig,
      '1: export function greet(name: string) {\n2:   return `Hello, ${name}!`',
      'export function greet(name: string) {\n  return `Hi, ${name}!`',
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.nextContent).toContain('Hi, ${name}!')
  })

  it('supports write_file tool and saves directly to disk', async () => {
    const root = await makeTempWorkspace()
    const writeRes = await executeAgentTool(
      'write_file',
      { path: 'src/new-feature.ts', content: 'export const ready = true\n', summary: 'Create feature' },
      root,
    )
    expect(writeRes.ok).toBe(true)
    expect(writeRes.fileUpdated?.path).toBe('src/new-feature.ts')
    const saved = await fs.readFile(path.join(root, 'src', 'new-feature.ts'), 'utf8')
    expect(saved).toBe('export const ready = true\n')
  })

  it('extracts code edits from edit:, lang:path, lang path, and first-line comment headers', () => {
    const reply = [
      '```tsx:src/app/demo.tsx\nexport const A = 1\n```',
      '```typescript src/lib/util.ts\nexport const B = 2\n```',
      '```ts\n// src/lib/header.ts\nexport const C = 3\n```',
    ].join('\n\n')
    const patches = extractProposedPatches(reply)
    expect(patches.map((p) => p.path)).toEqual([
      'src/app/demo.tsx',
      'src/lib/util.ts',
      'src/lib/header.ts',
    ])
  })

  it('blocks path traversal and unsafe shell commands', async () => {
    const root = await makeTempWorkspace()

    const escapeRes = await executeAgentTool('read_file', { path: '../outside.txt' }, root)
    expect(escapeRes.ok).toBe(false)
    expect(escapeRes.output).toContain('escapes workspace')

    const unsafeCmd = await executeAgentTool('run_verify', { command: 'rm -rf /' }, root)
    expect(unsafeCmd.ok).toBe(false)
    expect(unsafeCmd.output).toContain('Blocked: only verification commands')
  })
})
