import path from 'node:path'

const globalLocks = globalThis as typeof globalThis & {
  __vincezoneFileLocks?: Map<string, Promise<unknown>>
}

function getLockMap(): Map<string, Promise<unknown>> {
  if (!globalLocks.__vincezoneFileLocks) {
    globalLocks.__vincezoneFileLocks = new Map()
  }
  return globalLocks.__vincezoneFileLocks
}

function normalizeLockKey(filePath: string): string {
  const resolved = path.resolve(/*turbopackIgnore: true*/ filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Per-file asynchronous mutex queue ensuring concurrent Multi-Agent edits
 * targeting the same file execute sequentially instead of clobbering each other.
 */
export async function withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const map = getLockMap()
  const key = normalizeLockKey(filePath)
  const previous = map.get(key) ?? Promise.resolve()

  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => current)
  map.set(key, tail)

  await previous
  try {
    return await task()
  } finally {
    release()
    if (map.get(key) === tail) {
      map.delete(key)
    }
  }
}
