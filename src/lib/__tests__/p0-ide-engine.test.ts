import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  controlDebugSession,
  evaluateDebugExpression,
  startDebugSession,
  stopDebugSession,
} from '@/lib/debugger-runtime'
import {
  createTerminalSession,
  killTerminalSession,
  listTerminalSessions,
  writeToTerminalSession,
} from '@/lib/terminal-sessions'

const tempDirs: string[] = []

afterEach(async () => {
  stopDebugSession()
  for (const s of listTerminalSessions()) killTerminalSession(s.id)
  while (tempDirs.length > 0) {
    const d = tempDirs.pop()
    if (d) await fs.rm(d, { recursive: true, force: true }).catch(() => {})
  }
})

describe('P0-1: Interactive Terminal Session Manager', () => {
  it('spawns persistent shell, executes live input, and cleans up on kill', async () => {
    const session = createTerminalSession({ cwd: process.cwd(), title: 'Test Shell' })
    expect(session.alive).toBe(true)
    expect(listTerminalSessions().some((s) => s.id === session.id)).toBe(true)

    let output = ''
    session.listeners.add((ev) => {
      if (ev.type === 'output' && ev.data) output += ev.data
    })
    writeToTerminalSession(session.id, 'Write-Output "VZ_PTY_OK_123"\r\n')

    for (let i = 0; i < 20 && !output.includes('VZ_PTY_OK_123'); i += 1) {
      await new Promise((r) => setTimeout(r, 150))
    }
    expect(output).toContain('VZ_PTY_OK_123')

    expect(killTerminalSession(session.id)).toBe(true)
    expect(listTerminalSessions().some((s) => s.id === session.id)).toBe(false)
  })
})

describe('P0-3: Real Node V8 Inspector CDP Debugger', () => {
  it('pauses on script, steps over, reads real local variables & evaluates expressions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vz-debug-'))
    tempDirs.push(dir)
    const script = [
      'const alpha = 10;',
      'const beta = 32;',
      'const sum = alpha + beta;',
      'console.log("SUM=" + sum);',
    ].join('\n')
    await fs.writeFile(path.join(dir, 'sample.mjs'), script, 'utf8')

    const started = await startDebugSession({
      cwd: dir,
      targetFile: 'sample.mjs',
      breakpoints: [{ path: 'sample.mjs', line: 3 }],
    })
    expect(started.status).toBe('paused')
    expect(started.callFrames.length).toBeGreaterThan(0)

    // Resume to breakpoint at line 3 (after alpha=10 and beta=32 executed)
    const atBp = await controlDebugSession('resume')
    expect(atBp.status).toBe('paused')
    expect(atBp.activeLocation?.line).toBe(3)
    expect(atBp.variables.some((v) => v.name === 'alpha' && v.value === '10')).toBe(true)
    expect(atBp.variables.some((v) => v.name === 'beta' && v.value === '32')).toBe(true)

    // Step over line 3 -> sum is now 42, evaluate expression live on paused frame
    const afterStep = await controlDebugSession('stepOver')
    expect(afterStep.status).toBe('paused')
    const evalRes = await evaluateDebugExpression('alpha + beta')
    expect(evalRes.ok).toBe(true)
    expect(evalRes.result).toBe('42')

    stopDebugSession()
  })
})
