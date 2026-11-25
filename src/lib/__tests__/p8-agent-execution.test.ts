import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { executeAgentTool } from '@/lib/agent-tools'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

describe('P8 Agent Full Execution (Run Code, Git Commit/Push, Skills & Auto-Run)', () => {
  it('executes workspace .ts/.js files and inline snippets via run_code', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-runcode-'))
    tempDirs.push(tmp)

    await writeFile(
      path.join(tmp, 'hello.ts'),
      'const add = (a: number, b: number): number => a + b;\nconsole.log("SUM=" + add(19, 23));\n',
      'utf8',
    )

    const tsRes = await executeAgentTool('run_code', { path: 'hello.ts' }, tmp)
    expect(tsRes.ok).toBe(true)
    expect(tsRes.output).toContain('SUM=42')

    const inlineRes = await executeAgentTool(
      'run_code',
      { language: 'node', code: 'console.log(6 * 7)' },
      tmp,
    )
    expect(inlineRes.ok).toBe(true)
    expect(inlineRes.output).toContain('42')
  })

  it('commits changes via git_action and enforces approval gate on push unless Auto-Run is enabled', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-gitact-'))
    tempDirs.push(tmp)

    await execFileAsync('git', ['init'], { cwd: tmp, windowsHide: true })
    await execFileAsync('git', ['config', 'user.email', 'test@vincezone.local'], {
      cwd: tmp,
      windowsHide: true,
    })
    await execFileAsync('git', ['config', 'user.name', 'VinceZone Test'], {
      cwd: tmp,
      windowsHide: true,
    })
    await writeFile(path.join(tmp, 'index.ts'), 'export const ok = true\n', 'utf8')

    const commitRes = await executeAgentTool(
      'git_action',
      { action: 'commit', message: 'feat: initial test commit', stageAll: true },
      tmp,
    )
    expect(commitRes.ok).toBe(true)
    expect(commitRes.output).toContain('initial test commit')

    const statusRes = await executeAgentTool('git_action', { action: 'status' }, tmp)
    expect(statusRes.ok).toBe(true)
    expect(statusRes.output).not.toContain('index.ts')

    // Without Auto-Run, push requests explicit Allow/Deny confirmation
    const gatedPush = await executeAgentTool('git_action', { action: 'push' }, tmp, {
      autoApproveCommands: false,
    })
    expect(gatedPush.ok).toBe(true)
    expect(gatedPush.commandApproval?.command).toBe('git push')
  })

  it('discovers and loads workspace skills via list_skills and use_skill', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-skills-'))
    tempDirs.push(tmp)

    const skillDir = path.join(tmp, '.agent', 'skills', 'vincezone-demo-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: VinceZone Demo Skill\ndescription: Runs custom verification checklist\n---\n# Steps\n1. Verify build.\n',
      'utf8',
    )

    const listed = await executeAgentTool('list_skills', { query: 'vincezone-demo-skill' }, tmp)
    expect(listed.ok).toBe(true)
    expect(listed.output).toContain('/vincezone-demo-skill')

    const loaded = await executeAgentTool('use_skill', { skill: 'vincezone-demo-skill' }, tmp)
    expect(loaded.ok).toBe(true)
    expect(loaded.output).toContain('1. Verify build.')
  })

  it('respects Auto-Run for run_shell while permanently blocking catastrophic commands', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-autorun-'))
    tempDirs.push(tmp)

    const autoRes = await executeAgentTool(
      'run_shell',
      { command: 'node -e "console.log(12345)"', reason: 'Run quick node check' },
      tmp,
      { autoApproveCommands: true },
    )
    expect(autoRes.ok).toBe(true)
    expect(autoRes.output).toContain('12345')

    const blockedRes = await executeAgentTool(
      'run_shell',
      { command: 'rm -rf /', reason: 'Bad command' },
      tmp,
      { autoApproveCommands: true },
    )
    expect(blockedRes.ok).toBe(false)
    expect(blockedRes.output).toContain('Blocked:')
  })
})
