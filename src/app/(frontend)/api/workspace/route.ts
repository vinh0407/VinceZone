import { execFile } from 'node:child_process'
import { watch as fsWatch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { removeIndexedFile, updateIndexedFile } from '@/lib/code-index'
import { inferLanguage } from '@/lib/file-tree'
import { isLoopbackRequest, resolvePathInsideWorkspace } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'dist-desktop',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  '.tmp',
  '.playwright-cli',
  '.vincezone',
  'tools',
  'desktop',
  'VinceZone Studio',
])

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|ico)$/i

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}

const BINARY_EXT =
  /\.(woff2?|ttf|eot|zip|tar|gz|pdf|exe|dll|so|dylib|mp4|mp3|wav|sqlite|db|lock)$/i

const MAX_FILES = 5000
const EAGER_CONTENT_LIMIT = 100
const MAX_EAGER_BYTES = 120_000
const MAX_READ_BYTES = 600_000

type DiskFile = {
  name: string
  path: string
  content: string
  language: string
  dirty?: boolean
  lazy?: boolean
  size?: number
}

function isIgnoredRelPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((segment) => IGNORED_DIRS.has(segment))) return true
  const base = parts[parts.length - 1] || ''
  return BINARY_EXT.test(base)
}

async function scanWorkspaceDir(
  rootDir: string,
  currentDir: string,
  results: DiskFile[],
  eagerCounter: { count: number },
  depth = 0,
) {
  if (results.length >= MAX_FILES || depth > 10) return
  let entries
  try {
    entries = await readdir(currentDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= MAX_FILES) break
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      await scanWorkspaceDir(
        rootDir,
        path.join(currentDir, entry.name),
        results,
        eagerCounter,
        depth + 1,
      )
    } else if (entry.isFile()) {
      if (BINARY_EXT.test(entry.name)) continue
      const absPath = path.join(/*turbopackIgnore: true*/ currentDir, entry.name)
      try {
        const info = await stat(absPath)
        const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/')
        if (IMAGE_EXT.test(entry.name)) {
          if (info.size <= 10_000_000) {
            results.push({
              name: entry.name,
              path: relPath,
              content: '',
              language: 'image',
              dirty: false,
              lazy: true,
              size: info.size,
            })
          }
          continue
        }
        const shouldLoadEagerly =
          eagerCounter.count < EAGER_CONTENT_LIMIT && info.size <= MAX_EAGER_BYTES

        if (shouldLoadEagerly) {
          const content = await readFile(absPath, 'utf8')
          if (content.includes('\0')) continue
          eagerCounter.count += 1
          results.push({
            name: entry.name,
            path: relPath,
            content,
            language: inferLanguage(entry.name),
            dirty: false,
            lazy: false,
            size: info.size,
          })
        } else if (info.size <= MAX_READ_BYTES) {
          results.push({
            name: entry.name,
            path: relPath,
            content: '',
            language: inferLanguage(entry.name),
            dirty: false,
            lazy: true,
            size: info.size,
          })
        }
      } catch {
        // Skip unreadable files quietly.
      }
    }
  }
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json(
      { error: 'Local workspace access is restricted to desktop localhost.' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')?.trim() || 'list'
  const requestedRoot =
    searchParams.get('root')?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()
  const resolvedRoot = path.resolve(/*turbopackIgnore: true*/ requestedRoot)

  try {
    const info = await stat(/*turbopackIgnore: true*/ resolvedRoot)
    if (!info.isDirectory()) {
      return Response.json({ error: 'Workspace path is not a directory.' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Workspace directory does not exist.' }, { status: 404 })
  }

  // Action: serve raw image / SVG bytes for inline Editor media preview
  if (action === 'raw') {
    const relPath = searchParams.get('path')?.trim() || ''
    if (!relPath) {
      return Response.json({ error: 'File path is required.' }, { status: 400 })
    }
    try {
      const target = resolvePathInsideWorkspace(resolvedRoot, relPath)
      const info = await stat(target)
      if (!info.isFile() || info.size > 10_000_000) {
        return Response.json({ error: 'Preview file unavailable or >10MB.' }, { status: 413 })
      }
      const ext = path.extname(target).toLowerCase()
      const mime = IMAGE_MIME[ext] || 'application/octet-stream'
      const bytes = await readFile(target)
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unable to read raw file.' },
        { status: 404 },
      )
    }
  }

  // Action: lazy-read a single file on demand
  if (action === 'read') {
    const relPath = searchParams.get('path')?.trim() || ''
    if (!relPath) {
      return Response.json({ error: 'File path is required.' }, { status: 400 })
    }
    try {
      const target = resolvePathInsideWorkspace(resolvedRoot, relPath)
      const info = await stat(target)
      if (!info.isFile()) {
        return Response.json({ error: 'Target is not a file.' }, { status: 400 })
      }
      if (info.size > MAX_READ_BYTES) {
        return Response.json({ error: 'File exceeds preview size limit (600 KB).' }, { status: 413 })
      }
      const content = await readFile(target, 'utf8')
      if (content.includes('\0')) {
        return Response.json({ error: 'Binary files cannot be opened in text editor.' }, { status: 415 })
      }
      const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
      return Response.json(
        {
          ok: true,
          path: cleanRel,
          name: path.basename(cleanRel),
          language: inferLanguage(path.basename(cleanRel)),
          content,
          size: info.size,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unable to read file.' },
        { status: 404 },
      )
    }
  }

  // Action: real-time SSE file watcher for external edits (git pull, CLI tools, external editors)
  if (action === 'watch') {
    const encoder = new TextEncoder()
    let watcher: FSWatcher | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null
    const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

    const cleanup = () => {
      if (watcher) {
        try {
          watcher.close()
        } catch {
          // ignore
        }
        watcher = null
      }
      if (pingTimer) {
        clearInterval(pingTimer)
        pingTimer = null
      }
      for (const timer of pendingTimers.values()) clearTimeout(timer)
      pendingTimers.clear()
    }

    const stream = new ReadableStream({
      start(controller) {
        const send = (payload: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
          } catch {
            cleanup()
          }
        }

        send({ type: 'watch.ready', root: resolvedRoot })

        try {
          watcher = fsWatch(resolvedRoot, { recursive: true }, (_eventType, filename) => {
            if (!filename) return
            const rel = String(filename).replace(/\\/g, '/').replace(/^\/+/, '')
            if (!rel || isIgnoredRelPath(rel)) return

            const existing = pendingTimers.get(rel)
            if (existing) clearTimeout(existing)
            pendingTimers.set(
              rel,
              setTimeout(async () => {
                pendingTimers.delete(rel)
                try {
                  const full = resolvePathInsideWorkspace(resolvedRoot, rel)
                  const info = await stat(full)
                  if (!info.isFile() || info.size > MAX_EAGER_BYTES) return
                  const content = await readFile(full, 'utf8')
                  if (content.includes('\0')) return
                  updateIndexedFile(resolvedRoot, rel, content)
                  send({
                    type: 'file.changed',
                    path: rel,
                    name: path.basename(rel),
                    language: inferLanguage(path.basename(rel)),
                    content,
                    size: info.size,
                  })
                } catch {
                  removeIndexedFile(resolvedRoot, rel)
                  send({ type: 'file.removed', path: rel })
                }
              }, 240),
            )
          })
          watcher.on('error', () => {
            cleanup()
          })
        } catch {
          send({ type: 'watch.unavailable' })
        }

        pingTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`))
          } catch {
            cleanup()
          }
        }, 20_000)

        request.signal.addEventListener('abort', cleanup, { once: true })
      },
      cancel() {
        cleanup()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      },
    })
  }

  // Default action: list all files up to MAX_FILES (5,000), eager-loading first 100 & lazy-marking rest
  const files: DiskFile[] = []
  await scanWorkspaceDir(resolvedRoot, resolvedRoot, files, { count: 0 })

  return Response.json(
    {
      root: resolvedRoot,
      name: path.basename(resolvedRoot) || 'workspace',
      files,
      totalCount: files.length,
      lazyCount: files.filter((f) => f.lazy).length,
      truncated: files.length >= MAX_FILES,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json(
      { error: 'Local workspace writes are restricted to desktop localhost.' },
      { status: 403 },
    )
  }

  let body: {
    action?: string
    root?: string
    path?: string
    newPath?: string
    content?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const root = body.root?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()

  try {
    if (body.action === 'write') {
      if (!body.path || typeof body.content !== 'string') {
        return Response.json({ error: 'File path and content are required.' }, { status: 400 })
      }
      const target = resolvePathInsideWorkspace(root, body.path)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, body.content, 'utf8')
      updateIndexedFile(root, body.path, body.content)
      return Response.json({ ok: true, path: body.path })
    }

    if (body.action === 'create-folder') {
      if (!body.path) {
        return Response.json({ error: 'Folder path is required.' }, { status: 400 })
      }
      const target = resolvePathInsideWorkspace(root, body.path)
      await mkdir(target, { recursive: true })
      return Response.json({ ok: true, path: body.path })
    }

    if (body.action === 'rename') {
      if (!body.path || !body.newPath) {
        return Response.json({ error: 'Source path and newPath are required.' }, { status: 400 })
      }
      const from = resolvePathInsideWorkspace(root, body.path)
      const to = resolvePathInsideWorkspace(root, body.newPath)
      await mkdir(path.dirname(to), { recursive: true })
      await rename(from, to)
      return Response.json({ ok: true, path: body.newPath })
    }

    if (body.action === 'delete') {
      if (!body.path) {
        return Response.json({ error: 'Path to delete is required.' }, { status: 400 })
      }
      const target = resolvePathInsideWorkspace(root, body.path)
      await rm(target, { recursive: true, force: true })
      return Response.json({ ok: true, path: body.path })
    }

    if (body.action === 'reveal') {
      const target = body.path
        ? resolvePathInsideWorkspace(root, body.path)
        : path.resolve(/*turbopackIgnore: true*/ root)
      if (process.platform === 'win32') {
        execFile('explorer.exe', [`/select,${target}`], { windowsHide: true }, () => {})
      } else if (process.platform === 'darwin') {
        execFile('open', ['-R', target], () => {})
      } else {
        execFile('xdg-open', [path.dirname(target)], () => {})
      }
      return Response.json({ ok: true, path: target })
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Workspace file operation failed.' },
      { status: 400 },
    )
  }

  return Response.json({ error: 'Unsupported workspace action.' }, { status: 400 })
}
