import { describe, expect, it } from 'vitest'
import {
  detectDefaultPreviewUrl,
  makePreviewProjectKey,
  normalizePreviewUrl,
  resolveInitialPreviewUrl,
  saveProjectPreviewUrl,
} from '@/lib/web-preview-store'

function createMemoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

describe('Web Preview per-project URL persistence & smart port detection', () => {
  it('normalizes bare ports, localhost URLs, and domains cleanly', () => {
    expect(normalizePreviewUrl(':5173')).toBe('http://localhost:5173')
    expect(normalizePreviewUrl('40704')).toBe('http://localhost:40704')
    expect(normalizePreviewUrl('8080/dashboard')).toBe('http://localhost:8080/dashboard')
    expect(normalizePreviewUrl('localhost:4200/login')).toBe('http://localhost:4200/login')
    expect(normalizePreviewUrl('http://127.0.0.1:9000')).toBe('http://127.0.0.1:9000')
  })

  it('detects project dev port from package.json scripts and framework dependencies', () => {
    expect(
      detectDefaultPreviewUrl([
        {
          path: 'package.json',
          name: 'package.json',
          language: 'json',
          content: JSON.stringify({ scripts: { dev: 'next dev --port 40704 --hostname 127.0.0.1' } }),
        },
      ]),
    ).toBe('http://localhost:40704')

    expect(
      detectDefaultPreviewUrl([
        {
          path: 'package.json',
          name: 'package.json',
          language: 'json',
          content: JSON.stringify({ devDependencies: { vite: '^6.0.0' } }),
        },
      ]),
    ).toBe('http://localhost:5173')

    expect(
      detectDefaultPreviewUrl([
        {
          path: 'package.json',
          name: 'package.json',
          language: 'json',
          content: JSON.stringify({ dependencies: { astro: '^5.0.0' } }),
        },
      ]),
    ).toBe('http://localhost:4321')
  })

  it('persists and restores distinct Web Preview URLs per project without resetting to localhost:3000', () => {
    const storage = createMemoryStorage()

    // Project A saves custom Vite URL
    saveProjectPreviewUrl({
      projectName: 'AdminDashboard',
      rootPath: 'C:\\Work\\AdminDashboard',
      url: 'http://localhost:5173/analytics',
      storage,
    })

    // Project B saves custom API docs URL
    saveProjectPreviewUrl({
      projectName: 'BillingAPI',
      rootPath: 'C:\\Work\\BillingAPI',
      url: 'http://localhost:8080/docs',
      storage,
    })

    // Reopening Project A restores its exact URL (case/slash insensitive key)
    const projA = resolveInitialPreviewUrl({
      projectName: 'AdminDashboard',
      rootPath: 'c:/work/admindashboard/',
      storage,
    })
    expect(projA.hasSavedForProject).toBe(true)
    expect(projA.url).toBe('http://localhost:5173/analytics')
    expect(projA.recentUrls).toContain('http://localhost:8080/docs')

    // Reopening Project B restores its exact URL
    const projB = resolveInitialPreviewUrl({
      projectName: 'BillingAPI',
      rootPath: 'C:\\Work\\BillingAPI',
      storage,
    })
    expect(projB.hasSavedForProject).toBe(true)
    expect(projB.url).toBe('http://localhost:8080/docs')

    // Key normalization matches Windows and POSIX separators
    expect(makePreviewProjectKey('App', 'C:\\Repo\\App\\')).toBe(
      makePreviewProjectKey('App', 'c:/repo/app'),
    )
  })
})
