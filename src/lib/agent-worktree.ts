import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type AgentWorktreeInfo = {
  slug: string
  branch: string
  worktreePath: string
  head: string
}

export function sanitizeWorktreeSlug(raw: string): string {
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  if (!clean) throw new Error('Worktree slug must contain alphanumeric characters.')
  return clean
}

async function runGit(args: string[], cwd: string, timeout = 20_000) {
  return execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  })
}

export async function listAgentWorktrees(workspaceRoot: string): Promise<AgentWorktreeInfo[]> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const { stdout } = await runGit(['worktree', 'list', '--porcelain'], root)
  const blocks = stdout.trim().split(/\r?\n\r?\n/)
  const results: AgentWorktreeInfo[] = []
  const worktreesBase = path.join(/*turbopackIgnore: true*/ root, '.vincezone', 'worktrees').toLowerCase()

  for (const block of blocks) {
    let wtPath = ''
    let head = ''
    let branch = ''
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) wtPath = line.slice(9).trim()
      else if (line.startsWith('HEAD ')) head = line.slice(5).trim().slice(0, 7)
      else if (line.startsWith('branch ')) branch = line.slice(7).trim().replace(/^refs\/heads\//, '')
    }
    if (!wtPath) continue
    const norm = path.resolve(/*turbopackIgnore: true*/ wtPath).toLowerCase()
    if (norm.startsWith(worktreesBase) || branch.startsWith('vz-agent/')) {
      results.push({
        slug: path.basename(wtPath),
        branch: branch || '(detached)',
        worktreePath: wtPath,
        head,
      })
    }
  }
  return results
}

export async function createAgentWorktree(
  workspaceRoot: string,
  rawSlug: string,
): Promise<AgentWorktreeInfo> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const slug = sanitizeWorktreeSlug(rawSlug)
  const branch = `vz-agent/${slug}`
  const baseDir = path.join(/*turbopackIgnore: true*/ root, '.vincezone', 'worktrees')
  await mkdir(/*turbopackIgnore: true*/ baseDir, { recursive: true })
  const wtPath = path.join(/*turbopackIgnore: true*/ baseDir, slug)

  try {
    await runGit(['worktree', 'add', '-b', branch, wtPath], root)
  } catch {
    // If branch already exists, attach it to the worktree cleanly
    await runGit(['worktree', 'add', wtPath, branch], root)
  }

  const { stdout: headOut } = await runGit(['rev-parse', '--short', 'HEAD'], wtPath)
  return {
    slug,
    branch,
    worktreePath: wtPath,
    head: headOut.trim(),
  }
}

export async function getAgentWorktreeDiff(workspaceRoot: string, rawSlug: string): Promise<string> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const slug = sanitizeWorktreeSlug(rawSlug)
  const wtPath = path.join(/*turbopackIgnore: true*/ root, '.vincezone', 'worktrees', slug)
  const { stdout } = await runGit(['diff', 'HEAD'], wtPath)
  return stdout.slice(0, 40_000)
}

export async function mergeAgentWorktree(
  workspaceRoot: string,
  rawSlug: string,
): Promise<{ output: string }> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const slug = sanitizeWorktreeSlug(rawSlug)
  const branch = `vz-agent/${slug}`
  const { stdout, stderr } = await runGit(
    ['merge', '--no-ff', branch, '-m', `chore(agent): merge worktree ${branch}`],
    root,
  )
  return { output: (stdout || stderr).trim() || `Merged ${branch}` }
}

export async function removeAgentWorktree(
  workspaceRoot: string,
  rawSlug: string,
): Promise<{ removed: boolean }> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const slug = sanitizeWorktreeSlug(rawSlug)
  const branch = `vz-agent/${slug}`
  const wtPath = path.join(/*turbopackIgnore: true*/ root, '.vincezone', 'worktrees', slug)
  await runGit(['worktree', 'remove', '--force', wtPath], root)
  await runGit(['branch', '-D', branch], root).catch(() => {})
  return { removed: true }
}
