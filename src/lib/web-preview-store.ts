import type { WorkspaceFile } from '@/components/ide/agent-types'

const STORAGE_KEY = 'vincezone-web-preview-urls-v1'
const DEFAULT_FALLBACK_URL = 'http://localhost:3000'

type StoredPreviewState = {
  byProject: Record<string, string>
  recentUrls: string[]
  lastUrl?: string
}

export function normalizePreviewUrl(raw: string, fallback = DEFAULT_FALLBACK_URL): string {
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^:\d+/.test(trimmed)) return `http://localhost${trimmed}`
  if (/^\d{2,5}(\/.*)?$/.test(trimmed)) return `http://localhost:${trimmed}`
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

export function makePreviewProjectKey(projectName: string, rootPath?: string): string {
  const raw = (rootPath?.trim() || projectName.trim() || 'default').replace(/\\/g, '/')
  return raw.replace(/\/+$/, '').toLowerCase()
}

/**
 * Infers a project's likely local dev server URL from package.json scripts/dependencies
 * when no URL has been saved yet for that project.
 */
export function detectDefaultPreviewUrl(files?: WorkspaceFile[]): string {
  if (!files || files.length === 0) return DEFAULT_FALLBACK_URL

  const pkgFile = files.find((f) => f.path.replace(/\\/g, '/').toLowerCase() === 'package.json')
  if (pkgFile?.content) {
    try {
      const pkg = JSON.parse(pkgFile.content) as {
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const devScript = pkg.scripts?.dev || pkg.scripts?.start || ''
      const explicitPort =
        devScript.match(/(?:--port|-p)\s*[=\s]\s*(\d{2,5})/i)?.[1] ||
        devScript.match(/\bPORT=(\d{2,5})\b/i)?.[1]
      if (explicitPort) {
        return `http://localhost:${explicitPort}`
      }

      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      if ('vite' in deps || '@sveltejs/kit' in deps) return 'http://localhost:5173'
      if ('astro' in deps) return 'http://localhost:4321'
      if ('@angular/core' in deps) return 'http://localhost:4200'
      if ('gatsby' in deps) return 'http://localhost:8000'
      if ('expo' in deps) return 'http://localhost:8081'
    } catch {
      // ignore malformed package.json
    }
  }

  if (files.some((f) => /manage\.py$/i.test(f.path))) return 'http://localhost:8000'
  if (files.some((f) => /app\.py$|main\.py$/i.test(f.path))) return 'http://localhost:8000'
  return DEFAULT_FALLBACK_URL
}

function readStore(storage?: Pick<Storage, 'getItem'>): StoredPreviewState {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!target) return { byProject: {}, recentUrls: [] }
  try {
    const raw = target.getItem(STORAGE_KEY)
    if (!raw) return { byProject: {}, recentUrls: [] }
    const parsed = JSON.parse(raw) as Partial<StoredPreviewState>
    return {
      byProject: parsed.byProject && typeof parsed.byProject === 'object' ? parsed.byProject : {},
      recentUrls: Array.isArray(parsed.recentUrls)
        ? parsed.recentUrls.filter((u): u is string => typeof u === 'string' && Boolean(u.trim()))
        : [],
      lastUrl: typeof parsed.lastUrl === 'string' ? parsed.lastUrl : undefined,
    }
  } catch {
    return { byProject: {}, recentUrls: [] }
  }
}

function writeStore(state: StoredPreviewState, storage?: Pick<Storage, 'setItem'>): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (!target) return
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore storage quota errors
  }
}

export function resolveInitialPreviewUrl(input: {
  projectName: string
  rootPath?: string
  files?: WorkspaceFile[]
  storage?: Pick<Storage, 'getItem'>
}): { url: string; hasSavedForProject: boolean; recentUrls: string[] } {
  const store = readStore(input.storage)
  const key = makePreviewProjectKey(input.projectName, input.rootPath)
  const savedForProject = store.byProject[key]
  if (savedForProject?.trim()) {
    return {
      url: normalizePreviewUrl(savedForProject),
      hasSavedForProject: true,
      recentUrls: store.recentUrls,
    }
  }
  return {
    url: detectDefaultPreviewUrl(input.files),
    hasSavedForProject: false,
    recentUrls: store.recentUrls,
  }
}

export function saveProjectPreviewUrl(input: {
  projectName: string
  rootPath?: string
  url: string
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}): string[] {
  const clean = input.url.trim()
  if (!clean || clean === 'about:blank') {
    return readStore(input.storage).recentUrls
  }
  const normalized = normalizePreviewUrl(clean)
  const store = readStore(input.storage)
  const key = makePreviewProjectKey(input.projectName, input.rootPath)
  const nextRecent = [normalized, ...store.recentUrls.filter((item) => item !== normalized)].slice(0, 8)
  writeStore(
    {
      byProject: { ...store.byProject, [key]: normalized },
      recentUrls: nextRecent,
      lastUrl: normalized,
    },
    input.storage,
  )
  return nextRecent
}
