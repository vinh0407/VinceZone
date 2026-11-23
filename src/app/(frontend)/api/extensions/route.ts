import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type DiscoveredSkill = {
  id: string
  name: string
  description: string
  source: '.agent' | '.agents' | 'global-skills'
}

async function scanSkillsDir(
  dirPath: string,
  source: DiscoveredSkill['source'],
  limit = 120,
): Promise<DiscoveredSkill[]> {
  const results: DiscoveredSkill[] = []
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (results.length >= limit) break
    if (!entry.isDirectory()) continue
    const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md')
    try {
      const content = await readFile(skillMdPath, 'utf8')
      const nameMatch = content.match(/^name:\s*(.+)$/m)
      const descMatch = content.match(/^description:\s*(.+)$/m)
      results.push({
        id: `${source}:${entry.name}`,
        name: (nameMatch?.[1] || entry.name).replace(/^["']|["']$/g, '').trim(),
        description: (descMatch?.[1] || 'Agent skill module').replace(/^["']|["']$/g, '').trim().slice(0, 140),
        source,
      })
    } catch {
      // Skip folders without SKILL.md
    }
  }

  return results
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Extensions discovery is restricted to localhost.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const root = path.resolve(searchParams.get('root')?.trim() || process.cwd())

  const [dotAgent, dotAgents, userAgents, geminiSkills] = await Promise.all([
    scanSkillsDir(path.join(root, '.agent', 'skills'), '.agent', 60),
    scanSkillsDir(path.join(root, '.agents', 'skills'), '.agents', 60),
    scanSkillsDir(path.join(os.homedir(), '.agents', 'skills'), '.agents', 80),
    scanSkillsDir(path.join(os.homedir(), '.gemini', 'config', 'skills'), 'global-skills', 100),
  ])

  const deduped = new Map<string, DiscoveredSkill>()
  for (const skill of [...dotAgent, ...dotAgents, ...userAgents, ...geminiSkills]) {
    if (!deduped.has(skill.name)) {
      deduped.set(skill.name, skill)
    }
  }

  const scannedPaths = ['.agent/skills', '.agents/skills', '~/.agents/skills', '~/.gemini/config/skills']
  return Response.json(
    {
      skills: Array.from(deduped.values()),
      scannedPaths,
      scannedDirs: scannedPaths,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
