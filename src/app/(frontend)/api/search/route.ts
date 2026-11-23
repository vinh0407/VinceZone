import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'dist-desktop',
  'build',
  '.cache',
  '.vincezone',
  'desktop',
  'tools',
  '.playwright-cli',
  'coverage',
  '__pycache__',
  '.gradle',
  '.idea',
])

const BINARY_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp4',
  '.mp3',
  '.wav',
  '.apk',
  '.jar',
  '.class',
  '.lock',
])

function globToRegex(pattern: string): RegExp {
  const clean = pattern.trim().replace(/\\/g, '/')
  const escaped = clean
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/___DOUBLE_STAR___/g, '.*')
  if (!clean.includes('/')) {
    return new RegExp(`(^|/)${escaped}$`, 'i')
  }
  return new RegExp(`^${escaped}$`, 'i')
}

function parseGlobList(raw?: string): RegExp[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(globToRegex)
}

async function collectSearchableFiles(
  rootDir: string,
  includeRegexes: RegExp[],
  excludeRegexes: RegExp[],
  maxFiles = 5000,
): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    if (out.length >= maxFiles) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break
      if (IGNORED_DIRS.has(entry.name)) continue
      const full = path.join(/*turbopackIgnore: true*/ dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (BINARY_EXTS.has(ext)) continue
        const rel = path.relative(rootDir, full).replace(/\\/g, '/')
        if (includeRegexes.length > 0 && !includeRegexes.some((re) => re.test(rel))) continue
        if (excludeRegexes.length > 0 && excludeRegexes.some((re) => re.test(rel))) continue
        out.push(rel)
      }
    }
  }
  await walk(rootDir)
  return out
}

/**
 * High-speed Disk Search & Replace API spanning up to 5,000 workspace files
 * (including lazy-loaded files not loaded into browser RAM) with Include/Exclude glob support.
 */
export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local workspace access required.' }, { status: 403 })
  }

  let body: {
    action?: 'search' | 'replace'
    root?: string
    query?: string
    replacement?: string
    caseSensitive?: boolean
    regex?: boolean
    includeGlob?: string
    excludeGlob?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const query = String(body.query || '')
  if (!query.trim()) {
    return Response.json({ ok: true, matches: [], totalFilesScanned: 0 })
  }

  const root = path.resolve(
    /*turbopackIgnore: true*/ body.root?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )

  let matcher: RegExp
  try {
    const flags = body.caseSensitive ? 'g' : 'gi'
    matcher = body.regex
      ? new RegExp(query, flags)
      : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Invalid regex.' },
      { status: 400 },
    )
  }

  const includeRegexes = parseGlobList(body.includeGlob)
  const excludeRegexes = parseGlobList(body.excludeGlob)
  const relFiles = await collectSearchableFiles(root, includeRegexes, excludeRegexes, 5000)

  if (body.action === 'replace') {
    const replacement = String(body.replacement ?? '')
    let filesUpdated = 0
    let occurrences = 0
    const updatedPaths: string[] = []

    for (const rel of relFiles) {
      const full = path.join(/*turbopackIgnore: true*/ root, rel)
      try {
        const info = await stat(full)
        if (info.size > 400_000) continue
        const raw = await readFile(full, 'utf8')
        const hits = raw.match(matcher)
        if (!hits || hits.length === 0) continue
        const next = raw.replace(matcher, replacement)
        if (next === raw) continue
        await writeFile(full, next, 'utf8')
        filesUpdated += 1
        occurrences += hits.length
        updatedPaths.push(rel)
      } catch {
        // skip unreadable file
      }
    }

    return Response.json({
      ok: true,
      filesUpdated,
      occurrences,
      updatedPaths,
      totalFilesScanned: relFiles.length,
    })
  }

  // Search across all disk files (including lazy files)
  const matches: Array<{ path: string; line: number; preview: string }> = []
  const maxMatches = 250

  for (let i = 0; i < relFiles.length && matches.length < maxMatches; i += 32) {
    const batch = relFiles.slice(i, i + 32)
    const results = await Promise.all(
      batch.map(async (rel) => {
        const full = path.join(/*turbopackIgnore: true*/ root, rel)
        try {
          const info = await stat(full)
          if (info.size > 400_000) return []
          const raw = await readFile(full, 'utf8')
          matcher.lastIndex = 0
          if (!matcher.test(raw)) return []
          const lines = raw.split(/\r?\n/)
          const fileHits: Array<{ path: string; line: number; preview: string }> = []
          for (let idx = 0; idx < lines.length; idx++) {
            matcher.lastIndex = 0
            if (matcher.test(lines[idx])) {
              fileHits.push({
                path: rel,
                line: idx + 1,
                preview: lines[idx].trim().slice(0, 160),
              })
              if (fileHits.length >= 20) break
            }
          }
          return fileHits
        } catch {
          return []
        }
      }),
    )

    for (const group of results) {
      for (const hit of group) {
        matches.push(hit)
        if (matches.length >= maxMatches) break
      }
      if (matches.length >= maxMatches) break
    }
  }

  return Response.json({
    ok: true,
    matches,
    truncated: matches.length >= maxMatches,
    totalFilesScanned: relFiles.length,
  })
}
