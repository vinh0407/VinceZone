import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]'])

function isAllowedOrigin(origin: string): boolean {
  const clean = origin.trim().toLowerCase()
  if (!clean || clean === 'null') return false
  if (clean === 'vincezone://studio') return true
  try {
    const parsed = new URL(clean)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Ensures local desktop APIs (disk FS read/write, local shell execution)
 * are only ever reachable from the developer's own loopback interface or
 * Electron's in-process `vincezone://studio` protocol, blocking cross-site CSRF.
 */
export function isLoopbackRequest(request: Request): boolean {
  const hostHeader = (request.headers.get('host') || '').trim().toLowerCase()
  const hostWithoutPort = hostHeader.startsWith('[')
    ? hostHeader.slice(0, hostHeader.indexOf(']') + 1)
    : hostHeader.split(':')[0]

  if (!LOOPBACK_HOSTS.has(hostWithoutPort)) {
    return false
  }

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim().toLowerCase()
    if (first && !LOOPBACK_HOSTS.has(first) && first !== '::ffff:127.0.0.1') {
      return false
    }
  }

  // Block cross-site browser requests against local dev server (CSRF / DNS rebinding defense)
  const fetchSite = (request.headers.get('sec-fetch-site') || '').trim().toLowerCase()
  if (fetchSite === 'cross-site') {
    return false
  }

  const origin = request.headers.get('origin')
  if (origin && !isAllowedOrigin(origin)) {
    return false
  }

  return true
}

function normalizeCompare(filePath: string): string {
  const resolved = path.resolve(/*turbopackIgnore: true*/ filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isInsideDir(rootDir: string, candidate: string): boolean {
  const normRoot = normalizeCompare(rootDir)
  const normTarget = normalizeCompare(candidate)
  const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : `${normRoot}${path.sep}`
  return normTarget === normRoot || normTarget.startsWith(rootWithSep)
}

function resolveNearestRealPath(targetPath: string): string | null {
  let cursor = path.resolve(/*turbopackIgnore: true*/ targetPath)
  for (let depth = 0; depth < 32; depth++) {
    if (existsSync(/*turbopackIgnore: true*/ cursor)) {
      try {
        return realpathSync(/*turbopackIgnore: true*/ cursor)
      } catch {
        return null
      }
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  return null
}

/**
 * Resolves a relative file path safely inside `workspaceRoot`, blocking directory traversal,
 * Windows case-mismatch bypasses, and symlink escapes pointing outside the workspace.
 */
export function resolvePathInsideWorkspace(workspaceRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const cleanRel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleanRel || cleanRel.includes('\0')) {
    throw new Error('Invalid relative path.')
  }

  const resolvedTarget = path.resolve(/*turbopackIgnore: true*/ resolvedRoot, cleanRel)
  if (!isInsideDir(resolvedRoot, resolvedTarget)) {
    throw new Error('Path escapes workspace root.')
  }

  // Verify realpath on disk to prevent symlink escapes outside workspaceRoot
  let realRoot = resolvedRoot
  if (existsSync(/*turbopackIgnore: true*/ resolvedRoot)) {
    try {
      realRoot = realpathSync(/*turbopackIgnore: true*/ resolvedRoot)
    } catch {
      realRoot = resolvedRoot
    }
  }
  const nearestReal = resolveNearestRealPath(resolvedTarget)
  if (nearestReal && !isInsideDir(realRoot, nearestReal)) {
    throw new Error('Path escapes workspace root via symlink.')
  }

  return resolvedTarget
}
