import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { withFileLock } from '@/lib/file-lock'
import {
  extractSymbolsFromSource,
  type SymbolDefinition,
  type SymbolKind,
} from '@/lib/symbol-outline'

export { extractSymbolsFromSource, type SymbolDefinition, type SymbolKind }

export type SymbolReference = {
  path: string
  line: number
  column: number
  preview: string
  isDefinition: boolean
}

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

const SOURCE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.kt',
  '.kts',
  '.java',
  '.go',
  '.rs',
])

type CachedIndex = {
  builtAt: number
  fileCount: number
  symbols: SymbolDefinition[]
  files: string[]
}

const INDEX_CACHE = new Map<string, CachedIndex>()
const CACHE_TTL_MS = 5 * 60_000

export function invalidateCodeIndex(workspaceRoot?: string) {
  if (!workspaceRoot) {
    INDEX_CACHE.clear()
    return
  }
  INDEX_CACHE.delete(path.resolve(/*turbopackIgnore: true*/ workspaceRoot))
}

/**
 * Incremental single-file index update triggered by `fs.watch` or AI file edits.
 * Re-extracts symbols ONLY for `relPath` in <1ms instead of rescanning the entire repository.
 */
export function updateIndexedFile(workspaceRoot: string, relPath: string, content: string): boolean {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const cached = INDEX_CACHE.get(root)
  if (!cached) return false
  const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const ext = path.extname(cleanRel).toLowerCase()
  if (!SOURCE_EXTS.has(ext)) return false

  const kept = cached.symbols.filter((s) => s.path !== cleanRel)
  const fresh = content.length <= 350_000 ? extractSymbolsFromSource(cleanRel, content) : []
  cached.symbols = [...kept, ...fresh]
  if (!cached.files.includes(cleanRel)) {
    cached.files = [...cached.files, cleanRel]
    cached.fileCount = cached.files.length
  }
  cached.builtAt = Date.now()
  return true
}

export function removeIndexedFile(workspaceRoot: string, relPath: string): boolean {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const cached = INDEX_CACHE.get(root)
  if (!cached) return false
  const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  cached.symbols = cached.symbols.filter((s) => s.path !== cleanRel)
  cached.files = cached.files.filter((f) => f !== cleanRel)
  cached.fileCount = cached.files.length
  cached.builtAt = Date.now()
  return true
}

async function collectSourceFiles(rootDir: string, maxFiles = 1500): Promise<string[]> {
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
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SOURCE_EXTS.has(ext)) {
          out.push(path.relative(rootDir, full).replace(/\\/g, '/'))
        }
      }
    }
  }
  await walk(rootDir)
  return out
}

export async function indexWorkspaceSymbols(
  workspaceRoot: string,
  maxFiles = 3000,
): Promise<CachedIndex> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const cached = INDEX_CACHE.get(root)
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached
  }

  const files = await collectSourceFiles(root, maxFiles)
  const symbols: SymbolDefinition[] = []

  // Process files in parallel batches of 24 for speed
  for (let i = 0; i < files.length; i += 24) {
    const batch = files.slice(i, i + 24)
    const results = await Promise.all(
      batch.map(async (rel) => {
        try {
          const text = await readFile(path.join(root, rel), 'utf8')
          if (text.length > 350_000) return []
          return extractSymbolsFromSource(rel, text)
        } catch {
          return []
        }
      }),
    )
    for (const chunk of results) {
      for (const sym of chunk) symbols.push(sym)
    }
  }

  const entry: CachedIndex = {
    builtAt: Date.now(),
    fileCount: files.length,
    symbols,
    files,
  }
  INDEX_CACHE.set(root, entry)
  return entry
}

export async function findSymbolDefinitions(
  workspaceRoot: string,
  symbolName: string,
  currentFile?: string,
): Promise<SymbolDefinition[]> {
  const clean = symbolName.trim()
  if (!clean) return []
  const idx = await indexWorkspaceSymbols(workspaceRoot)
  const normCurrent = currentFile?.replace(/\\/g, '/') ?? ''
  const currentDir = normCurrent ? path.posix.dirname(normCurrent) : ''

  const exact = idx.symbols.filter((s) => s.name === clean)
  const matches =
    exact.length > 0
      ? exact
      : idx.symbols.filter((s) => s.name.toLowerCase() === clean.toLowerCase())

  return matches.sort((a, b) => {
    const score = (s: SymbolDefinition) => {
      let pts = 0
      if (s.exported) pts += 10
      if (normCurrent && s.path === normCurrent) pts += 6
      if (currentDir && path.posix.dirname(s.path) === currentDir) pts += 4
      if (s.kind === 'function' || s.kind === 'class' || s.kind === 'interface') pts += 2
      return pts
    }
    return score(b) - score(a)
  })
}

export async function findSymbolReferences(
  workspaceRoot: string,
  symbolName: string,
  limit = 60,
): Promise<SymbolReference[]> {
  const clean = symbolName.trim()
  if (!clean || clean.length < 2) return []

  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const idx = await indexWorkspaceSymbols(root)
  const defKeySet = new Set(
    idx.symbols.filter((s) => s.name === clean).map((s) => `${s.path}:${s.line}`),
  )

  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'g')
  const refs: SymbolReference[] = []

  for (const rel of idx.files) {
    if (refs.length >= limit) break
    try {
      const content = await readFile(path.join(root, rel), 'utf8')
      if (!content.includes(clean)) continue
      const lines = content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.includes(clean)) continue
        regex.lastIndex = 0
        const m = regex.exec(line)
        if (!m) continue
        refs.push({
          path: rel,
          line: i + 1,
          column: m.index + 1,
          preview: line.trim().slice(0, 140),
          isDefinition: defKeySet.has(`${rel}:${i + 1}`),
        })
        if (refs.length >= limit) break
      }
    } catch {
      // skip unreadable
    }
  }

  return refs
}

export async function searchWorkspaceSymbols(
  workspaceRoot: string,
  query: string,
  limit = 30,
): Promise<SymbolDefinition[]> {
  const clean = query.trim().toLowerCase()
  const idx = await indexWorkspaceSymbols(workspaceRoot)
  if (!clean) {
    return idx.symbols.filter((s) => s.exported).slice(0, limit)
  }
  const scored = idx.symbols
    .filter((s) => s.name.toLowerCase().includes(clean))
    .map((s) => {
      const lower = s.name.toLowerCase()
      let score = 0
      if (lower === clean) score += 100
      else if (lower.startsWith(clean)) score += 50
      if (s.exported) score += 15
      return { s, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((item) => item.s)
}

/**
 * Safe cross-file identifier rename (`F2`) across indexed source files.
 * Uses strict word-boundary matching (`\\boldName\\b`) and per-file async locks
 * so partial substrings and concurrent agent writes are never corrupted.
 */
export async function renameSymbolAcrossWorkspace(
  workspaceRoot: string,
  oldName: string,
  newName: string,
  maxFiles = 3000,
): Promise<{
  filesUpdated: number
  occurrences: number
  updatedFiles: Array<{ path: string; content: string }>
}> {
  const from = oldName.trim()
  const to = newName.trim()
  if (!/^[A-Za-z_$][\w$]*$/.test(from) || !/^[A-Za-z_$][\w$]*$/.test(to)) {
    throw new Error('Symbol names must be valid identifiers (letters, digits, _, $).')
  }
  if (from === to) {
    return { filesUpdated: 0, occurrences: 0, updatedFiles: [] }
  }

  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const idx = await indexWorkspaceSymbols(root, maxFiles)
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'g')

  let filesUpdated = 0
  let occurrences = 0
  const updatedFiles: Array<{ path: string; content: string }> = []

  for (const rel of idx.files) {
    const abs = path.join(/*turbopackIgnore: true*/ root, rel)
    try {
      const current = await readFile(abs, 'utf8')
      if (!current.includes(from)) continue
      const matches = current.match(regex)
      if (!matches || matches.length === 0) continue

      const next = current.replace(regex, to)
      if (next === current) continue

      await withFileLock(abs, async () => {
        await writeFile(abs, next, 'utf8')
      })
      updateIndexedFile(root, rel, next)
      filesUpdated += 1
      occurrences += matches.length
      updatedFiles.push({ path: rel, content: next })
    } catch {
      // skip unreadable/locked files
    }
  }

  return { filesUpdated, occurrences, updatedFiles }
}
