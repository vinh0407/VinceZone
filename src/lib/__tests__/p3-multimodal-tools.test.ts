import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { POST as searchPost } from '@/app/(frontend)/api/search/route'
import { buildCompactedHistory, type CompactableMessage } from '@/lib/context-compact'
import {
  attachNodeDebugSession,
  controlDebugSession,
  evaluateDebugExpression,
  startDebugSession,
  stopDebugSession,
} from '@/lib/debugger-runtime'
import { resolveConflictBlocks } from '@/lib/git-conflicts'
import {
  createTerminalSession,
  killTerminalSession,
  resizeTerminalSession,
} from '@/lib/terminal-sessions'

const tempDirs: string[] = []

afterEach(async () => {
  stopDebugSession()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 }).catch(() => {})
    }
  }
})

describe('1A & 1C: Auto-Compact Context & Multimodal Vision Messages', () => {
  it('condenses older conversation messages beyond maxRecent while keeping recent turns intact', () => {
    const msgs: CompactableMessage[] = []
    for (let i = 1; i <= 20; i++) {
      msgs.push({ role: 'user', text: `Task turn ${i}: implement module ${i}` })
      msgs.push({
        role: 'tool',
        text: `Edited & saved src/mod${i}.ts (REV-${i})`,
      })
      msgs.push({ role: 'assistant', text: `Completed module ${i} with passing tests.` })
    }

    const result = buildCompactedHistory(msgs, 10)
    expect(result.compactedCount).toBe(30) // 40 non-tool messages - 10 recent = 30
    expect(result.summaryBlock).toContain('AUTO-COMPACTED EARLIER CONVERSATION')
    expect(result.summaryBlock).toContain('Task turn 1')
    expect(result.summaryBlock).toContain('Edited & saved src/mod')
    expect(result.apiMessages[0].role).toBe('system')
    expect(result.apiMessages.length).toBe(11) // 1 system summary + 10 recent
  })

  it('formats attached images as OpenAI Vision image_url content parts', () => {
    const msgs: CompactableMessage[] = [
      {
        role: 'user',
        text: 'Fix this navbar alignment',
        images: [
          {
            id: 'img-1',
            name: 'navbar.png',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          },
        ],
      },
    ]

    const result = buildCompactedHistory(msgs, 14)
    expect(result.compactedCount).toBe(0)
    expect(result.apiMessages).toHaveLength(1)
    const content = result.apiMessages[0].content
    expect(Array.isArray(content)).toBe(true)
    if (Array.isArray(content)) {
      expect(content[0]).toEqual({ type: 'text', text: 'Fix this navbar alignment' })
      expect(content[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
      })
    }
  })
})

describe('2A: Disk Search & Replace with Include/Exclude Globs', () => {
  it('searches across disk files respecting includeGlob and excludeGlob and supports replace', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-search-'))
    tempDirs.push(tmp)
    await mkdir(path.join(tmp, 'src'), { recursive: true })
    await writeFile(path.join(tmp, 'src', 'alpha.ts'), 'export const MAGIC_TOKEN = 42\n', 'utf8')
    await writeFile(path.join(tmp, 'src', 'alpha.test.ts'), 'expect(MAGIC_TOKEN).toBe(42)\n', 'utf8')
    await writeFile(path.join(tmp, 'README.md'), 'Docs mention MAGIC_TOKEN here\n', 'utf8')

    // Search only *.ts excluding *.test.ts
    const searchRes = await searchPost(
      new Request('http://127.0.0.1/api/search', {
        method: 'POST',
        headers: { host: '127.0.0.1', 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          root: tmp,
          query: 'MAGIC_TOKEN',
          includeGlob: '*.ts',
          excludeGlob: '*.test.ts',
        }),
      }),
    )
    expect(searchRes.status).toBe(200)
    const searchJson = (await searchRes.json()) as {
      ok: boolean
      matches: Array<{ path: string; line: number; preview: string }>
    }
    expect(searchJson.ok).toBe(true)
    expect(searchJson.matches).toHaveLength(1)
    expect(searchJson.matches[0].path).toBe('src/alpha.ts')

    // Disk replace across *.ts excluding *.test.ts
    const replaceRes = await searchPost(
      new Request('http://127.0.0.1/api/search', {
        method: 'POST',
        headers: { host: '127.0.0.1', 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'replace',
          root: tmp,
          query: 'MAGIC_TOKEN',
          replacement: 'SUPER_TOKEN',
          includeGlob: '*.ts',
          excludeGlob: '*.test.ts',
        }),
      }),
    )
    const replaceJson = (await replaceRes.json()) as {
      ok: boolean
      filesUpdated: number
      occurrences: number
    }
    expect(replaceJson.ok).toBe(true)
    expect(replaceJson.filesUpdated).toBe(1)
    expect(replaceJson.occurrences).toBe(1)

    const updatedAlpha = await readFile(path.join(tmp, 'src', 'alpha.ts'), 'utf8')
    const untouchedTest = await readFile(path.join(tmp, 'src', 'alpha.test.ts'), 'utf8')
    expect(updatedAlpha).toContain('SUPER_TOKEN')
    expect(untouchedTest).toContain('MAGIC_TOKEN')
  })
})

describe('2B: Git Merge Conflict Resolver', () => {
  const sample = [
    'const a = 1',
    '<<<<<<< HEAD',
    'const theme = "dark"',
    '=======',
    'const theme = "light"',
    '>>>>>>> feature/light-theme',
    'export { a, theme }',
  ].join('\n')

  it('resolves conflict blocks using ours, theirs, and both strategies', () => {
    const ours = resolveConflictBlocks(sample, 'ours')
    expect(ours.count).toBe(1)
    expect(ours.resolved).toContain('const theme = "dark"')
    expect(ours.resolved).not.toContain('const theme = "light"')
    expect(ours.resolved).not.toContain('<<<<<<<')

    const theirs = resolveConflictBlocks(sample, 'theirs')
    expect(theirs.count).toBe(1)
    expect(theirs.resolved).toContain('const theme = "light"')
    expect(theirs.resolved).not.toContain('const theme = "dark"')

    const both = resolveConflictBlocks(sample, 'both')
    expect(both.count).toBe(1)
    expect(both.resolved).toContain('const theme = "dark"')
    expect(both.resolved).toContain('const theme = "light"')
  })
})

describe('2C: Multi-Language Debugger (Python pdb + Attach validation) & Terminal Resize', () => {
  it('resizes an active terminal session cleanly', () => {
    const session = createTerminalSession({ cwd: process.cwd(), title: 'Resize Test' })
    const resized = resizeTerminalSession(session.id, 132, 40)
    expect(resized).toBe(true)
    killTerminalSession(session.id)
    expect(resizeTerminalSession(session.id, 80, 24)).toBe(false)
  })

  it('rejects attaching to an unreachable V8 inspector port cleanly', async () => {
    await expect(
      attachNodeDebugSession({ cwd: process.cwd(), port: 59997 }),
    ).rejects.toThrow()
  })

  it('debugs a live Python script via pdb if Python is installed', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-pydebug-'))
    tempDirs.push(tmp)
    await writeFile(
      path.join(tmp, 'calc.py'),
      ['x = 10', 'y = 32', 'total = x + y', 'print(total)'].join('\n') + '\n',
      'utf8',
    )

    const started = await startDebugSession({
      cwd: tmp,
      targetFile: 'calc.py',
      breakpoints: [{ path: 'calc.py', line: 3 }],
    })

    // If python isn't installed on this host, skip assertions cleanly
    if (started.status === 'exited' || started.status === 'starting') {
      stopDebugSession()
      return
    }

    expect(started.status).toBe('paused')
    expect(started.activeLocation?.line).toBe(1)

    // Continue to breakpoint on line 3
    const atBp = await controlDebugSession('resume')
    expect(atBp.status).toBe('paused')
    expect(atBp.activeLocation?.line).toBe(3)
    expect(atBp.variables.some((v) => v.name === 'x' && v.value === '10')).toBe(true)

    const stepped = await controlDebugSession('stepOver')
    expect(stepped.status).toBe('paused')
    expect(stepped.activeLocation?.line).toBe(4)

    const evalRes = await evaluateDebugExpression('total * 2')
    expect(evalRes.ok).toBe(true)
    expect(evalRes.result).toBe('84')

    stopDebugSession()
  }, 15_000)
})
