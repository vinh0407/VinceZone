import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GET as workspaceGet } from '@/app/(frontend)/api/workspace/route'
import { searchSettingsEntries } from '@/components/ide/modals/settings-search'
import { KEYBOARD_SHORTCUTS } from '@/components/ide/modals/shortcuts-modal'

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 }).catch(() => {})
    }
  }
})

async function collectTsxFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await collectTsxFiles(full)))
    else if (e.isFile() && e.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('UI/UX Polish & Architecture Upgrades', () => {
  it('eliminates all native window.prompt / window.confirm / window.alert calls in IDE components', async () => {
    const files = await collectTsxFiles(path.join(process.cwd(), 'src', 'components', 'ide'))
    const offenders: string[] = []
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      if (/\bwindow\.(prompt|confirm|alert)\s*\(/.test(content)) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps styles.css 100% offline-first with no remote Google Fonts @import and includes Light/HC themes', async () => {
    const css = await readFile(path.join(process.cwd(), 'src', 'app', '(frontend)', 'styles.css'), 'utf8')
    expect(css).not.toContain('fonts.googleapis.com')
    expect(css).toContain("[data-theme='light']")
    expect(css).toContain("[data-theme='high-contrast']")
  })

  it('indexes settings search queries accurately across all 11 tabs', () => {
    expect(searchSettingsEntries('theme').some((m) => m.tab === 'general')).toBe(true)
    expect(searchSettingsEntries('mcp').some((m) => m.tab === 'mcp')).toBe(true)
    expect(searchSettingsEntries('omniroute').some((m) => m.tab === 'providers')).toBe(true)
    expect(searchSettingsEntries('shell').some((m) => m.tab === 'permissions')).toBe(true)
    expect(searchSettingsEntries('')).toEqual([])
  })

  it('exposes complete Keyboard Shortcuts Cheatsheet entries including Ctrl+K Ctrl+S and F12', () => {
    const keys = KEYBOARD_SHORTCUTS.map((s) => s.keys)
    expect(keys).toContain('Ctrl+K Ctrl+S')
    expect(keys).toContain('F12')
    expect(keys).toContain('Ctrl+P')
    expect(keys).toContain('Ctrl+Shift+A')
  })

  it('serves raw image bytes via /api/workspace?action=raw and lists images as lazy media files', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'vz-media-'))
    tempDirs.push(tmp)
    // Minimal valid 1x1 PNG header bytes
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await writeFile(path.join(tmp, 'preview.png'), pngBytes)

    const listRes = await workspaceGet(
      new Request(`http://127.0.0.1/api/workspace?root=${encodeURIComponent(tmp)}`, {
        headers: { host: '127.0.0.1' },
      }),
    )
    expect(listRes.status).toBe(200)
    const listJson = (await listRes.json()) as {
      files: Array<{ path: string; language: string; lazy?: boolean }>
    }
    const imgEntry = listJson.files.find((f) => f.path === 'preview.png')
    expect(imgEntry).toBeDefined()
    expect(imgEntry?.language).toBe('image')
    expect(imgEntry?.lazy).toBe(true)

    const rawRes = await workspaceGet(
      new Request(
        `http://127.0.0.1/api/workspace?action=raw&root=${encodeURIComponent(tmp)}&path=preview.png`,
        { headers: { host: '127.0.0.1' } },
      ),
    )
    expect(rawRes.status).toBe(200)
    expect(rawRes.headers.get('content-type')).toBe('image/png')
    const returned = Buffer.from(await rawRes.arrayBuffer())
    expect(returned.equals(pngBytes)).toBe(true)

    // Path traversal blocked
    const escapeRes = await workspaceGet(
      new Request(
        `http://127.0.0.1/api/workspace?action=raw&root=${encodeURIComponent(tmp)}&path=../../etc/passwd`,
        { headers: { host: '127.0.0.1' } },
      ),
    )
    expect(escapeRes.status).toBe(404)
  })
})
