import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { extractSymbolsFromSource } from '@/lib/symbol-outline'

export type SemanticCodeHit = {
  path: string
  startLine: number
  endLine: number
  symbol?: string
  score: number
  preview: string
}

type CodeChunk = {
  path: string
  startLine: number
  endLine: number
  symbol?: string
  preview: string
  tf: Map<string, number>
  norm: number
}

type CachedSemanticIndex = {
  builtAt: number
  fileCount: number
  chunks: CodeChunk[]
  idf: Map<string, number>
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
  'coverage',
  '__pycache__',
])

const CODE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.kt',
  '.java',
  '.go',
  '.rs',
  '.css',
  '.md',
])

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'return',
  'const',
  'let',
  'var',
  'import',
  'export',
  'default',
  'async',
  'await',
  'function',
  'true',
  'false',
  'null',
  'undefined',
  'void',
  'string',
  'number',
  'boolean',
])

const SEMANTIC_CACHE = new Map<string, CachedSemanticIndex>()
const CACHE_TTL_MS = 4 * 60_000

export function invalidateSemanticIndex(workspaceRoot?: string) {
  if (!workspaceRoot) {
    SEMANTIC_CACHE.clear()
    return
  }
  SEMANTIC_CACHE.delete(path.resolve(/*turbopackIgnore: true*/ workspaceRoot))
}

/**
 * CamelCase, snake_case, and path-aware tokenizer for code semantic matching.
 */
export function tokenizeCodeText(text: string): string[] {
  const splitCamel = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  const raw = splitCamel.toLowerCase().match(/[a-z][a-z0-9]{1,28}/g) ?? []
  const tokens: string[] = []
  for (const tok of raw) {
    if (STOP_WORDS.has(tok)) continue
    tokens.push(tok)
    // Light stemming for common code plurals/suffixes (e.g., authenticating -> authenticat)
    if (tok.length > 5 && tok.endsWith('ing')) tokens.push(tok.slice(0, -3))
    else if (tok.length > 4 && tok.endsWith('ed')) tokens.push(tok.slice(0, -2))
    else if (tok.length > 4 && tok.endsWith('s') && !tok.endsWith('ss')) {
      tokens.push(tok.slice(0, -1))
    }
  }
  return tokens
}

function buildTermFreq(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of tokens) {
    map.set(t, (map.get(t) ?? 0) + 1)
  }
  return map
}

async function collectFiles(rootDir: string, maxFiles = 2000): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    if (out.length >= maxFiles) return
    let entries
    try {
      entries = await readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
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
        if (CODE_EXTS.has(ext)) {
          out.push(path.relative(rootDir, full).replace(/\\/g, '/'))
        }
      }
    }
  }
  await walk(rootDir)
  return out
}

function chunkSourceFile(relPath: string, content: string): Array<{
  path: string
  startLine: number
  endLine: number
  symbol?: string
  text: string
  preview: string
}> {
  const lines = content.split(/\r?\n/)
  if (lines.length === 0) return []
  const symbols = extractSymbolsFromSource(relPath, content)
  const chunks: Array<{
    path: string
    startLine: number
    endLine: number
    symbol?: string
    text: string
    preview: string
  }> = []

  if (symbols.length > 0) {
    for (let i = 0; i < symbols.length; i += 1) {
      const sym = symbols[i]
      const start = Math.max(1, sym.line - 2)
      const nextLine = symbols[i + 1]?.line ?? lines.length + 1
      const end = Math.min(lines.length, Math.min(nextLine - 1, start + 48))
      const slice = lines.slice(start - 1, end).join('\n')
      chunks.push({
        path: relPath,
        startLine: sym.line,
        endLine: end,
        symbol: sym.name,
        text: `${relPath} ${sym.name} ${sym.name} ${slice}`,
        preview: lines
          .slice(sym.line - 1, Math.min(lines.length, sym.line + 3))
          .join('\n')
          .slice(0, 260),
      })
    }
    return chunks
  }

  // Fallback sliding 40-line windows for markdown/css/script files without extracted symbols
  const step = 36
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(lines.length, start + 42)
    const slice = lines.slice(start, end).join('\n')
    if (!slice.trim()) continue
    chunks.push({
      path: relPath,
      startLine: start + 1,
      endLine: end,
      text: `${relPath} ${slice}`,
      preview: slice.trim().slice(0, 260),
    })
  }
  return chunks
}

async function buildSemanticIndex(workspaceRoot: string, maxFiles = 2000): Promise<CachedSemanticIndex> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const cached = SEMANTIC_CACHE.get(root)
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached
  }

  const files = await collectFiles(root, maxFiles)
  const rawChunks: Array<{
    path: string
    startLine: number
    endLine: number
    symbol?: string
    preview: string
    tf: Map<string, number>
  }> = []
  const df = new Map<string, number>()

  for (let i = 0; i < files.length; i += 24) {
    const batch = files.slice(i, i + 24)
    const perFile = await Promise.all(
      batch.map(async (rel) => {
        try {
          const text = await readFile(path.join(/*turbopackIgnore: true*/ root, rel), 'utf8')
          if (text.length > 220_000) return []
          return chunkSourceFile(rel, text)
        } catch {
          return []
        }
      }),
    )
    for (const fileChunks of perFile) {
      for (const ch of fileChunks) {
        const tf = buildTermFreq(tokenizeCodeText(ch.text))
        if (tf.size === 0) continue
        for (const term of tf.keys()) {
          df.set(term, (df.get(term) ?? 0) + 1)
        }
        rawChunks.push({
          path: ch.path,
          startLine: ch.startLine,
          endLine: ch.endLine,
          symbol: ch.symbol,
          preview: ch.preview,
          tf,
        })
      }
    }
  }

  const totalDocs = Math.max(1, rawChunks.length)
  const idf = new Map<string, number>()
  for (const [term, count] of df.entries()) {
    idf.set(term, Math.log((totalDocs + 1) / (count + 1)) + 1)
  }

  const chunks: CodeChunk[] = rawChunks.map((ch) => {
    let normSq = 0
    for (const [term, freq] of ch.tf.entries()) {
      const w = (1 + Math.log(freq)) * (idf.get(term) ?? 1)
      normSq += w * w
    }
    return {
      ...ch,
      norm: Math.sqrt(normSq) || 1,
    }
  })

  const built: CachedSemanticIndex = {
    builtAt: Date.now(),
    fileCount: files.length,
    chunks,
    idf,
  }
  SEMANTIC_CACHE.set(root, built)
  return built
}

export async function semanticSearchWorkspace(
  workspaceRoot: string,
  query: string,
  topK = 10,
): Promise<{ fileCount: number; chunkCount: number; hits: SemanticCodeHit[] }> {
  const tokens = tokenizeCodeText(query)
  if (tokens.length === 0) {
    return { fileCount: 0, chunkCount: 0, hits: [] }
  }

  const index = await buildSemanticIndex(workspaceRoot)
  const queryTf = buildTermFreq(tokens)
  const queryWeights = new Map<string, number>()
  let queryNormSq = 0

  for (const [term, freq] of queryTf.entries()) {
    const idfVal = index.idf.get(term) ?? 1
    const w = (1 + Math.log(freq)) * idfVal
    queryWeights.set(term, w)
    queryNormSq += w * w
  }
  const queryNorm = Math.sqrt(queryNormSq) || 1

  const scored: SemanticCodeHit[] = []
  for (const ch of index.chunks) {
    let dot = 0
    let matchedTerms = 0
    for (const [term, qWeight] of queryWeights.entries()) {
      const freq = ch.tf.get(term)
      if (!freq) continue
      matchedTerms += 1
      const docWeight = (1 + Math.log(freq)) * (index.idf.get(term) ?? 1)
      dot += qWeight * docWeight
    }
    if (dot <= 0) continue
    const cosine = dot / (queryNorm * ch.norm)
    const coverageBoost = 1 + (matchedTerms / queryWeights.size) * 0.35
    const score = Number((cosine * coverageBoost).toFixed(4))
    scored.push({
      path: ch.path,
      startLine: ch.startLine,
      endLine: ch.endLine,
      symbol: ch.symbol,
      score,
      preview: ch.preview,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return {
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
    hits: scored.slice(0, Math.max(1, Math.min(30, topK))),
  }
}
