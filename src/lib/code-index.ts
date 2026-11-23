import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'method'

export type SymbolDefinition = {
  name: string
  kind: SymbolKind
  path: string
  line: number
  column: number
  signature: string
  exported: boolean
}

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

export function extractSymbolsFromSource(relPath: string, content: string): SymbolDefinition[] {
  const ext = path.extname(relPath).toLowerCase()
  const lines = content.split(/\r?\n/)
  const out: SymbolDefinition[] = []
  const seen = new Set<string>()

  const push = (
    name: string,
    kind: SymbolKind,
    lineIdx: number,
    rawLine: string,
    exported: boolean,
  ) => {
    if (!name || name.length < 2) return
    const key = `${name}:${lineIdx}`
    if (seen.has(key)) return
    seen.add(key)
    const col = Math.max(1, rawLine.indexOf(name) + 1)
    out.push({
      name,
      kind,
      path: relPath,
      line: lineIdx + 1,
      column: col,
      signature: rawLine.trim().slice(0, 140),
      exported,
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      continue
    }

    // TypeScript / JavaScript
    if (
      ext === '.ts' ||
      ext === '.tsx' ||
      ext === '.mts' ||
      ext === '.cts' ||
      ext === '.js' ||
      ext === '.jsx' ||
      ext === '.mjs' ||
      ext === '.cjs'
    ) {
      const exported = /^export\s+/.test(trimmed)
      let m = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'function', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'class', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'interface', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*=/)
      if (m) {
        push(m[1], 'type', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'enum', i, line, exported)
        continue
      }
      m = trimmed.match(
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\(|[A-Za-z_$][\w$]*\s*=>|function\b)/,
      )
      if (m) {
        push(m[1], 'function', i, line, exported)
        continue
      }
      if (exported) {
        m = trimmed.match(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/)
        if (m) {
          push(m[1], 'const', i, line, true)
          continue
        }
      }
      continue
    }

    // Python
    if (ext === '.py') {
      let m = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/)
      if (m) {
        const isMethod = /^\s+/.test(line)
        push(m[1], isMethod ? 'method' : 'function', i, line, !m[1].startsWith('_'))
        continue
      }
      m = trimmed.match(/^class\s+([A-Za-z_]\w*)/)
      if (m) {
        push(m[1], 'class', i, line, !m[1].startsWith('_'))
        continue
      }
      continue
    }

    // Kotlin / Java
    if (ext === '.kt' || ext === '.kts' || ext === '.java') {
      let m = trimmed.match(
        /^(?:(?:public|private|protected|internal|override|suspend|inline|static|final)\s+)*fun\s+(?:<[^>]+>\s+)?([A-Za-z_]\w*)\s*\(/,
      )
      if (m) {
        push(m[1], 'function', i, line, !trimmed.includes('private '))
        continue
      }
      m = trimmed.match(
        /^(?:(?:public|private|protected|internal|data|sealed|abstract|open|final)\s+)*(class|interface|object|enum)\s+([A-Za-z_]\w*)/,
      )
      if (m) {
        const kind: SymbolKind =
          m[1] === 'interface' ? 'interface' : m[1] === 'enum' ? 'enum' : 'class'
        push(m[2], kind, i, line, !trimmed.includes('private '))
        continue
      }
      continue
    }

    // Go
    if (ext === '.go') {
      let m = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z_]\w*)\s*\(/)
      if (m) {
        push(m[1], 'function', i, line, /^[A-Z]/.test(m[1]))
        continue
      }
      m = trimmed.match(/^type\s+([A-Za-z_]\w*)\s+(struct|interface)\b/)
      if (m) {
        push(m[1], m[2] === 'interface' ? 'interface' : 'class', i, line, /^[A-Z]/.test(m[1]))
        continue
      }
      continue
    }

    // Rust
    if (ext === '.rs') {
      const exported = /^pub\b/.test(trimmed)
      let m = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/)
      if (m) {
        push(m[1], 'function', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait|type)\s+([A-Za-z_]\w*)/)
      if (m) {
        const kind: SymbolKind =
          m[1] === 'trait'
            ? 'interface'
            : m[1] === 'enum'
              ? 'enum'
              : m[1] === 'type'
                ? 'type'
                : 'class'
        push(m[2], kind, i, line, exported)
      }
    }
  }

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

  const root = path.resolve(workspaceRoot)
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
