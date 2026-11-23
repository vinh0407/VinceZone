import path from 'node:path'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]'])

/**
 * Ensures local desktop APIs (disk FS read/write, local shell execution)
 * are only ever reachable from the developer's own loopback interface.
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

  return true
}

/**
 * Resolves a relative file path safely inside `workspaceRoot`, blocking directory traversal.
 */
export function resolvePathInsideWorkspace(workspaceRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot)
  const cleanRel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleanRel || cleanRel.includes('\0')) {
    throw new Error('Invalid relative path.')
  }

  const resolvedTarget = path.resolve(resolvedRoot, cleanRel)
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw new Error('Path escapes workspace root.')
  }

  return resolvedTarget
}
