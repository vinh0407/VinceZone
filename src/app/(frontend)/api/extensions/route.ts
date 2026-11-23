import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type DiscoveredSkill = {
  id: string
  slug: string
  name: string
  description: string
  source: '.agent' | '.agents' | 'global-skills'
  path: string
}

function parseFrontmatterField(content: string, field: 'name' | 'description'): string {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const block = fmMatch ? fmMatch[1] : content.slice(0, 1200)
  const lines = block.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(new RegExp(`^${field}:\\s*(.*)$`))
    if (!match) continue
    const raw = match[1].trim()
    // Handle YAML folded/literal multiline scalars (>, |, >-, |-)
    if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      const collected: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+/.test(lines[j])) {
          collected.push(lines[j].trim())
        } else if (lines[j].trim() === '') {
          continue
        } else {
          break
        }
      }
      return collected.join(' ').trim()
    }
    return raw.replace(/^["']|["']$/g, '').trim()
  }
  return ''
}

async function scanSkillsDir(
  dirPath: string,
  source: DiscoveredSkill['source'],
  limit = 2000,
): Promise<DiscoveredSkill[]> {
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const dirs = entries.filter((e) => e.isDirectory()).slice(0, limit)
  const results: DiscoveredSkill[] = []
  const chunkSize = 48

  for (let i = 0; i < dirs.length; i += chunkSize) {
    const slice = dirs.slice(i, i + chunkSize)
    const batch = await Promise.all(
      slice.map(async (entry) => {
        const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md')
        try {
          const content = await readFile(skillMdPath, 'utf8')
          const parsedName = parseFrontmatterField(content, 'name') || entry.name
          const parsedDesc =
            parseFrontmatterField(content, 'description') || 'Agent skill module'
          return {
            id: `${source}:${entry.name}`,
            slug: entry.name.toLowerCase(),
            name: parsedName,
            description: parsedDesc.slice(0, 160),
            source,
            path: skillMdPath,
          } satisfies DiscoveredSkill
        } catch {
          return null
        }
      }),
    )
    for (const item of batch) {
      if (item) results.push(item)
    }
  }

  return results
}

const cacheState = globalThis as typeof globalThis & {
  __vincezoneSkillsCache?: { key: string; at: number; skills: DiscoveredSkill[]; dirs: string[] }
}

async function getSkillIndex(root: string) {
  const now = Date.now()
  if (
    cacheState.__vincezoneSkillsCache &&
    cacheState.__vincezoneSkillsCache.key === root &&
    now - cacheState.__vincezoneSkillsCache.at < 30_000
  ) {
    return cacheState.__vincezoneSkillsCache
  }

  const userAgentsDir = path.join(os.homedir(), '.agents', 'skills')
  const projectDotAgent = path.join(root, '.agent', 'skills')
  const projectDotAgents = path.join(root, '.agents', 'skills')
  const geminiSkillsDir = path.join(os.homedir(), '.gemini', 'config', 'skills')

  // Prioritize project skills, then C:\Users\ADMIN\.agents\skills (primary user skills dir), then ~/.gemini/config/skills
  const [dotAgent, dotAgents, userAgents, geminiSkills] = await Promise.all([
    scanSkillsDir(projectDotAgent, '.agent', 200),
    scanSkillsDir(projectDotAgents, '.agents', 200),
    scanSkillsDir(userAgentsDir, '.agents', 2000),
    scanSkillsDir(geminiSkillsDir, 'global-skills', 2000),
  ])

  const deduped = new Map<string, DiscoveredSkill>()
  for (const skill of [...dotAgent, ...dotAgents, ...userAgents, ...geminiSkills]) {
    const key = skill.slug
    if (!deduped.has(key)) {
      deduped.set(key, skill)
    }
  }

  const skills = Array.from(deduped.values()).sort((a, b) => a.slug.localeCompare(b.slug))
  const dirs = [userAgentsDir, '.agent/skills', '.agents/skills', '~/.gemini/config/skills']

  cacheState.__vincezoneSkillsCache = { key: root, at: now, skills, dirs }
  return cacheState.__vincezoneSkillsCache
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json(
      { error: 'Extensions discovery is restricted to localhost.' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(request.url)
  const root = path.resolve(searchParams.get('root')?.trim() || process.cwd())
  const requestedSkill = searchParams.get('skill')?.trim().toLowerCase()

  const index = await getSkillIndex(root)

  // Load full SKILL.md instructions for a specific /skill invocation
  if (requestedSkill) {
    const clean = requestedSkill.replace(/^\/+/, '')
    if (!/^[a-z0-9._-]+$/i.test(clean)) {
      return Response.json({ ok: false, error: 'Invalid skill identifier.' }, { status: 400 })
    }
    const found = index.skills.find(
      (item) => item.slug === clean || item.name.toLowerCase() === clean,
    )
    if (!found) {
      return Response.json({ ok: false, error: `Skill "/${clean}" not found.` }, { status: 404 })
    }
    try {
      const content = await readFile(found.path, 'utf8')
      return Response.json(
        {
          ok: true,
          skill: {
            ...found,
            content: content.slice(0, 12_000),
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    } catch {
      return Response.json({ ok: false, error: `Unable to read ${found.path}` }, { status: 500 })
    }
  }

  return Response.json(
    {
      skills: index.skills,
      total: index.skills.length,
      scannedPaths: index.dirs,
      scannedDirs: index.dirs,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
