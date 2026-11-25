import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { withFileLock } from '@/lib/file-lock'
import { resolvePathInsideWorkspace } from '@/lib/local-guard'

const TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
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
])

export function isTypeScriptFamilyFile(relPath: string): boolean {
  return TS_EXTS.has(path.extname(relPath).toLowerCase())
}

type CachedTsService = {
  root: string
  service: ts.LanguageService
  fileNames: string[]
  versions: Map<string, number>
  createdAt: number
}

const SERVICE_CACHE = new Map<string, CachedTsService>()
const CACHE_TTL_MS = 3 * 60_000

export function invalidateTsLanguageService(workspaceRoot?: string) {
  if (!workspaceRoot) {
    for (const entry of SERVICE_CACHE.values()) {
      try {
        entry.service.dispose()
      } catch {
        // ignore
      }
    }
    SERVICE_CACHE.clear()
    return
  }
  const key = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const existing = SERVICE_CACHE.get(key)
  if (existing) {
    try {
      existing.service.dispose()
    } catch {
      // ignore
    }
    SERVICE_CACHE.delete(key)
  }
}

function collectTsFilesSync(rootDir: string, maxFiles = 1200): string[] {
  const out: string[] = []
  function walk(dir: string) {
    if (out.length >= maxFiles) return
    let entries
    try {
      entries = readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break
      if (IGNORED_DIRS.has(entry.name)) continue
      const full = path.join(/*turbopackIgnore: true*/ dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (TS_EXTS.has(ext)) {
          out.push(full.replace(/\\/g, '/'))
        }
      }
    }
  }
  walk(rootDir)
  return out
}

function normalizeTsFileName(filePath: string): string {
  return path.resolve(/*turbopackIgnore: true*/ filePath).replace(/\\/g, '/')
}

function getOrCreateTsService(workspaceRoot: string): CachedTsService {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const existing = SERVICE_CACHE.get(root)
  if (existing && Date.now() - existing.createdAt < CACHE_TTL_MS) {
    return existing
  }
  if (existing) {
    try {
      existing.service.dispose()
    } catch {
      // ignore
    }
  }

  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    checkJs: false,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    noEmit: true,
  }

  let fileNames: string[] = []
  const tsconfigPath = path.join(/*turbopackIgnore: true*/ root, 'tsconfig.json')
  if (existsSync(/*turbopackIgnore: true*/ tsconfigPath)) {
    try {
      const readRes = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
      if (!readRes.error && readRes.config) {
        const parsed = ts.parseJsonConfigFileContent(readRes.config, ts.sys, root)
        compilerOptions = { ...compilerOptions, ...parsed.options, skipLibCheck: true }
        fileNames = parsed.fileNames.slice(0, 1500).map((f) => f.replace(/\\/g, '/'))
      }
    } catch {
      // fall back to manual scan
    }
  }

  if (fileNames.length === 0) {
    fileNames = collectTsFilesSync(root, 1200)
  }

  const versions = new Map<string, number>()
  for (const fn of fileNames) {
    try {
      const st = statSync(/*turbopackIgnore: true*/ fn)
      versions.set(fn, Math.trunc(st.mtimeMs))
    } catch {
      versions.set(fn, 1)
    }
  }

  const servicesHost: ts.LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: (fileName) => {
      const norm = fileName.replace(/\\/g, '/')
      try {
        const st = statSync(/*turbopackIgnore: true*/ fileName)
        const v = Math.trunc(st.mtimeMs)
        versions.set(norm, v)
        return String(v)
      } catch {
        return String(versions.get(norm) ?? 0)
      }
    },
    getScriptSnapshot: (fileName) => {
      if (!existsSync(/*turbopackIgnore: true*/ fileName)) return undefined
      try {
        return ts.ScriptSnapshot.fromString(
          readFileSync(/*turbopackIgnore: true*/ fileName, 'utf8'),
        )
      } catch {
        return undefined
      }
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (p) => existsSync(/*turbopackIgnore: true*/ p),
    readFile: (p) => {
      try {
        return readFileSync(/*turbopackIgnore: true*/ p, 'utf8')
      } catch {
        return undefined
      }
    },
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  }

  const service = ts.createLanguageService(servicesHost, ts.createDocumentRegistry())
  const entry: CachedTsService = {
    root,
    service,
    fileNames,
    versions,
    createdAt: Date.now(),
  }
  SERVICE_CACHE.set(root, entry)
  return entry
}

function positionToOffset(sourceFile: ts.SourceFile, line: number, column: number): number {
  const safeLine = Math.max(0, Math.min(line - 1, sourceFile.getLineStarts().length - 1))
  const lineStart = sourceFile.getLineStarts()[safeLine] ?? 0
  const maxPos = sourceFile.getEnd()
  return Math.max(0, Math.min(lineStart + Math.max(0, column - 1), maxPos))
}

function getLinePreview(fileName: string, lineOneBased: number): string {
  try {
    const content = readFileSync(/*turbopackIgnore: true*/ fileName, 'utf8')
    const lines = content.split(/\r?\n/)
    return (lines[lineOneBased - 1] ?? '').trim().slice(0, 140)
  } catch {
    return ''
  }
}

function toRelPosix(root: string, absFile: string): string {
  return path.relative(root, path.resolve(/*turbopackIgnore: true*/ absFile)).replace(/\\/g, '/')
}

function ensureFileInService(ctx: CachedTsService, absNorm: string) {
  if (!ctx.fileNames.includes(absNorm) && existsSync(/*turbopackIgnore: true*/ absNorm)) {
    ctx.fileNames.push(absNorm)
  }
}

export function getTsDefinitionAtPosition(
  workspaceRoot: string,
  relPath: string,
  line: number,
  column: number,
): Array<{
  name: string
  kind: string
  path: string
  line: number
  column: number
  signature: string
  exported: boolean
}> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const absTarget = resolvePathInsideWorkspace(root, relPath)
  const absNorm = normalizeTsFileName(absTarget)
  const ctx = getOrCreateTsService(root)
  ensureFileInService(ctx, absNorm)

  const program = ctx.service.getProgram()
  const sf = program?.getSourceFile(absNorm)
  if (!sf) return []

  const offset = positionToOffset(sf, line, column)
  const defs = ctx.service.getDefinitionAtPosition(absNorm, offset)
  if (!defs || defs.length === 0) return []

  return defs
    .map((d) => {
      const targetSf = program?.getSourceFile(d.fileName)
      const loc = targetSf
        ? targetSf.getLineAndCharacterOfPosition(d.textSpan.start)
        : { line: 0, character: 0 }
      const rel = toRelPosix(root, d.fileName)
      if (rel.startsWith('..')) return null
      return {
        name: d.name,
        kind: d.kind,
        path: rel,
        line: loc.line + 1,
        column: loc.character + 1,
        signature: getLinePreview(d.fileName, loc.line + 1),
        exported: true,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

export function getTsReferencesAtPosition(
  workspaceRoot: string,
  relPath: string,
  line: number,
  column: number,
  limit = 80,
): Array<{
  path: string
  line: number
  column: number
  preview: string
  isDefinition: boolean
}> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const absTarget = resolvePathInsideWorkspace(root, relPath)
  const absNorm = normalizeTsFileName(absTarget)
  const ctx = getOrCreateTsService(root)
  ensureFileInService(ctx, absNorm)

  const program = ctx.service.getProgram()
  const sf = program?.getSourceFile(absNorm)
  if (!sf) return []

  const offset = positionToOffset(sf, line, column)
  const refs = ctx.service.findReferences(absNorm, offset)
  if (!refs) return []

  const out: Array<{
    path: string
    line: number
    column: number
    preview: string
    isDefinition: boolean
  }> = []
  const seen = new Set<string>()

  for (const group of refs) {
    for (const ref of group.references) {
      if (out.length >= limit) break
      const rel = toRelPosix(root, ref.fileName)
      if (rel.startsWith('..') || rel.includes('node_modules/')) continue
      const refSf = program?.getSourceFile(ref.fileName)
      if (!refSf) continue
      const loc = refSf.getLineAndCharacterOfPosition(ref.textSpan.start)
      const key = `${rel}:${loc.line + 1}:${loc.character + 1}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        path: rel,
        line: loc.line + 1,
        column: loc.character + 1,
        preview: getLinePreview(ref.fileName, loc.line + 1),
        isDefinition: Boolean(ref.isDefinition),
      })
    }
  }
  return out
}

export function getTsHoverInfoAtPosition(
  workspaceRoot: string,
  relPath: string,
  line: number,
  column: number,
): { display: string; documentation: string; kind: string } | null {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const absTarget = resolvePathInsideWorkspace(root, relPath)
  const absNorm = normalizeTsFileName(absTarget)
  const ctx = getOrCreateTsService(root)
  ensureFileInService(ctx, absNorm)

  const program = ctx.service.getProgram()
  const sf = program?.getSourceFile(absNorm)
  if (!sf) return null

  const offset = positionToOffset(sf, line, column)
  const info = ctx.service.getQuickInfoAtPosition(absNorm, offset)
  if (!info) return null

  return {
    display: ts.displayPartsToString(info.displayParts),
    documentation: ts.displayPartsToString(info.documentation),
    kind: info.kind,
  }
}

/**
 * AST-accurate cross-file rename powered by TypeScript Language Service.
 * Never touches comments, string literals, or unrelated same-named variables in other scopes!
 */
export async function renameTsSymbolAtPosition(
  workspaceRoot: string,
  relPath: string,
  line: number,
  column: number,
  newName: string,
): Promise<{
  filesUpdated: number
  occurrences: number
  updatedFiles: Array<{ path: string; content: string }>
  engine: 'typescript-ast'
}> {
  const cleanNew = newName.trim()
  if (!/^[A-Za-z_$][\w$]*$/.test(cleanNew)) {
    throw new Error('New symbol name must be a valid identifier.')
  }

  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const absTarget = resolvePathInsideWorkspace(root, relPath)
  const absNorm = normalizeTsFileName(absTarget)
  const ctx = getOrCreateTsService(root)
  ensureFileInService(ctx, absNorm)

  const program = ctx.service.getProgram()
  const sf = program?.getSourceFile(absNorm)
  if (!sf) {
    throw new Error(`TypeScript source file not found: ${relPath}`)
  }

  const offset = positionToOffset(sf, line, column)
  const renameInfo = ctx.service.getRenameInfo(absNorm, offset, { allowRenameOfImportPath: false })
  if (!renameInfo.canRename) {
    throw new Error(renameInfo.localizedErrorMessage || 'Symbol at cursor cannot be renamed.')
  }

  const locations = ctx.service.findRenameLocations(absNorm, offset, false, false)
  if (!locations || locations.length === 0) {
    return { filesUpdated: 0, occurrences: 0, updatedFiles: [], engine: 'typescript-ast' }
  }

  // Group text spans by file, skipping anything outside workspace or inside node_modules
  const byFile = new Map<string, Array<{ start: number; length: number }>>()
  for (const loc of locations) {
    const rel = toRelPosix(root, loc.fileName)
    if (rel.startsWith('..') || rel.includes('node_modules/')) continue
    const list = byFile.get(loc.fileName) ?? []
    list.push({ start: loc.textSpan.start, length: loc.textSpan.length })
    byFile.set(loc.fileName, list)
  }

  let occurrences = 0
  const updatedFiles: Array<{ path: string; content: string }> = []

  for (const [fileName, spans] of byFile.entries()) {
    const abs = path.resolve(/*turbopackIgnore: true*/ fileName)
    const rel = toRelPosix(root, abs)
    const current = readFileSync(/*turbopackIgnore: true*/ abs, 'utf8')
    // Apply spans from end to start so offsets stay exact
    const sorted = [...spans].sort((a, b) => b.start - a.start)
    let next = current
    for (const sp of sorted) {
      next = `${next.slice(0, sp.start)}${cleanNew}${next.slice(sp.start + sp.length)}`
      occurrences += 1
    }
    if (next !== current) {
      await withFileLock(abs, async () => {
        await writeFile(abs, next, 'utf8')
      })
      updatedFiles.push({ path: rel, content: next })
    }
  }

  invalidateTsLanguageService(root)
  return {
    filesUpdated: updatedFiles.length,
    occurrences,
    updatedFiles,
    engine: 'typescript-ast',
  }
}
