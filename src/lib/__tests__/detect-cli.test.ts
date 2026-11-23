import { describe, expect, it } from 'vitest'
import { candidateExecutableNames, detectSupportedCliTools } from '@/lib/cli/detect-cli'

describe('detect-cli', () => {
  it('generates PATHEXT candidates on Windows and bare name on POSIX', () => {
    expect(candidateExecutableNames('claude', 'linux')).toEqual(['claude'])
    const win = candidateExecutableNames('claude', 'win32', '.EXE;.CMD;.PS1')
    expect(win).toEqual(['claude', 'claude.exe', 'claude.cmd', 'claude.ps1'])
  })

  it('detects Windows .cmd executables via PATHEXT', async () => {
    const existing = new Set(['C:\\Tools\\claude.cmd', 'C:\\Tools\\gemini.exe'])
    const tools = await detectSupportedCliTools({
      platform: 'win32',
      pathValue: 'C:\\Windows\\System32;"C:\\Tools"',
      pathExt: '.EXE;.CMD',
      accessFn: async (filePath) => {
        if (!existing.has(filePath)) throw new Error('ENOENT')
      },
    })

    expect(tools.find((t) => t.id === 'claude')?.installed).toBe(true)
    expect(tools.find((t) => t.id === 'codex')?.installed).toBe(false)
    expect(tools.find((t) => t.id === 'gemini')?.installed).toBe(true)
  })

  it('detects POSIX executables without exposing paths', async () => {
    const tools = await detectSupportedCliTools({
      platform: 'linux',
      pathValue: '/usr/local/bin:/usr/bin',
      accessFn: async (filePath) => {
        if (!filePath.endsWith('codex')) throw new Error('ENOENT')
      },
    })

    expect(tools.find((t) => t.id === 'codex')?.installed).toBe(true)
    expect(tools.find((t) => t.id === 'claude')?.installed).toBe(false)
  })
})
