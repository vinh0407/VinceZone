import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
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
  'tools',
])

const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|zip|tar|gz|pdf|exe|dll|so|dylib|mp4|mp3|wav|sqlite|db|lock)$/i

const MAX_FILES = 120
const MAX_FILE_BYTES = 300_000

type DiskFile = {
  name: string
  path: string
  content: string
  language: string
  dirty?: boolean
}

async function scanWorkspaceDir(
  rootDir: string,
  currentDir: string,
  results: DiskFile[],
  depth = 0,
) {
  if (results.length >= MAX_FILES || depth > 6) return
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
      await scanWorkspaceDir(rootDir, path.join(currentDir, entry.name), results, depth + 1)
    } else if (entry.isFile()) {
      if (BINARY_EXT.test(entry.name)) continue
      const absPath = path.join(currentDir, entry.name)
      try {
        const info = await stat(absPath)
        if (info.size > MAX_FILE_BYTES) continue
        const content = await readFile(absPath, 'utf8')
        if (content.includes('\0')) continue
        const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/')
        results.push({
          name: entry.name,
          path: relPath,
          content,
          language: inferLanguage(entry.name),
          dirty: false,
        })
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
  const requestedRoot =
    searchParams.get('root')?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()
  const resolvedRoot = path.resolve(requestedRoot)

  try {
    const info = await stat(resolvedRoot)
    if (!info.isDirectory()) {
      return Response.json({ error: 'Workspace path is not a directory.' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Workspace directory does not exist.' }, { status: 404 })
  }

  const files: DiskFile[] = []
  await scanWorkspaceDir(resolvedRoot, resolvedRoot, files)

  return Response.json(
    {
      root: resolvedRoot,
      name: path.basename(resolvedRoot) || 'workspace',
      files,
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

  const root =
    body.root?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()

  try {
    if (body.action === 'write') {
      if (!body.path || typeof body.content !== 'string') {
        return Response.json({ error: 'File path and content are required.' }, { status: 400 })
      }
      const target = resolvePathInsideWorkspace(root, body.path)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, body.content, 'utf8')
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
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Workspace file operation failed.' },
      { status: 400 },
    )
  }

  return Response.json({ error: 'Unsupported workspace action.' }, { status: 400 })
}
