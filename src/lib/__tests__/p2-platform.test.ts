import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GET as getSessionStore, POST as postSessionStore } from '@/app/(frontend)/api/session-store/route'
import { AGENT_TOOL_DEFINITIONS } from '../agent-tools'

describe('P2-1 / P2-2 / P2-3: Android Logcat, Durable Disk Store, DPAPI & Cleanup', () => {
  it('registers read_android_logcat tool for AI crash diagnosis', () => {
    expect(AGENT_TOOL_DEFINITIONS.some((t) => t.function.name === 'read_android_logcat')).toBe(true)
  })

  it('persists and reloads project sessions atomically in .vincezone/session-store.json', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-p2-store-'))
    try {
      const saveReq = new Request('http://127.0.0.1/api/session-store', {
        method: 'POST',
        headers: { host: '127.0.0.1', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: tmp,
          session: {
            projectName: 'Test Workspace',
            memoryNotes: [{ id: 'm1', title: 'Architecture', content: 'Clean' }],
            revisions: [{ id: 'REV-001', path: 'src/a.ts' }],
          },
        }),
      })
      const saveRes = await postSessionStore(saveReq)
      expect(saveRes.status).toBe(200)
      const saveData = (await saveRes.json()) as { ok: boolean; sizeBytes: number }
      expect(saveData.ok).toBe(true)
      expect(saveData.sizeBytes).toBeGreaterThan(20)

      const loadReq = new Request(
        `http://127.0.0.1/api/session-store?root=${encodeURIComponent(tmp)}`,
        { headers: { host: '127.0.0.1' } },
      )
      const loadRes = await getSessionStore(loadReq)
      expect(loadRes.status).toBe(200)
      const loadData = (await loadRes.json()) as {
        ok: boolean
        exists: boolean
        session: { projectName: string; revisions: Array<{ id: string }> }
      }
      expect(loadData.exists).toBe(true)
      expect(loadData.session.projectName).toBe('Test Workspace')
      expect(loadData.session.revisions[0]?.id).toBe('REV-001')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('removes dead CraftStudio files and wires Electron DPAPI + NSIS installer', async () => {
    const repo = process.cwd()
    expect(existsSync(path.join(repo, 'src/components/ide/craft-studio.tsx'))).toBe(false)
    expect(existsSync(path.join(repo, 'src/app/(frontend)/api/craft/route.ts'))).toBe(false)
    expect(existsSync(path.join(repo, 'electron/installer.nsi'))).toBe(true)
    expect(existsSync(path.join(repo, 'electron/build-installer.cjs'))).toBe(true)

    const mainJs = await readFile(path.join(repo, 'electron/main.cjs'), 'utf8')
    const preloadJs = await readFile(path.join(repo, 'electron/preload.cjs'), 'utf8')
    expect(mainJs).toContain('safeStorage.encryptString')
    expect(mainJs).toContain('vincezone:secrets:load')
    expect(preloadJs).toContain('saveApiKeys')
  })
})
