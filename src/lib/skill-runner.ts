import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type InstalledSkillEntry = {
  slug: string
  name: string
  description: string
  source: '.agent' | '.agents' | 'global-skills'
  skillFile: string
}

function parseFrontmatterField(content: string, field: 'name' | 'description'): string {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const block = fmMatch ? fmMatch[1] : content.slice(0, 1200)
  const lines = block.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(new RegExp(`^${field}:\\s*(.*)$`))
    if (!match) continue
    const raw = match[1].trim()
    if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      const collected: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+/.test(lines[j])) collected.push(lines[j].trim())
        else if (lines[j].trim() === '') continue
        else break
      }
      return collected.join(' ').trim()
    }
    return raw.replace(/^["']|["']$/g, '').trim()
  }
  return ''
}

async function scanDir(
  dirPath: string,
  source: InstalledSkillEntry['source'],
  limit = 1500,
): Promise<InstalledSkillEntry[]> {
  let entries
  try {
    entries = await readdir(/*turbopackIgnore: true*/ dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const dirs = entries.filter((e) => e.isDirectory()).slice(0, limit)
  const out: InstalledSkillEntry[] = []

  for (let i = 0; i < dirs.length; i += 48) {
    const slice = dirs.slice(i, i + 48)
    const batch = await Promise.all(
      slice.map(async (entry) => {
        const skillFile = path.join(/*turbopackIgnore: true*/ dirPath, entry.name, 'SKILL.md')
        try {
          const content = await readFile(/*turbopackIgnore: true*/ skillFile, 'utf8')
          const name = parseFrontmatterField(content, 'name') || entry.name
          const description = parseFrontmatterField(content, 'description')
          return {
            slug: entry.name.toLowerCase(),
            name,
            description: description.slice(0, 180),
            source,
            skillFile,
          } satisfies InstalledSkillEntry
        } catch {
          return null
        }
      }),
    )
    for (const item of batch) {
      if (item) out.push(item)
    }
  }
  return out
}

const CACHE = new Map<string, { at: number; skills: InstalledSkillEntry[] }>()

async function getAllInstalledSkills(workspaceRoot: string): Promise<InstalledSkillEntry[]> {
  const root = path.resolve(/*turbopackIgnore: true*/ workspaceRoot)
  const cached = CACHE.get(root)
  if (cached && Date.now() - cached.at < 30_000) {
    return cached.skills
  }

  const home = os.homedir()
  const [p1, p2, u1, g1] = await Promise.all([
    scanDir(path.join(/*turbopackIgnore: true*/ root, '.agent', 'skills'), '.agent', 200),
    scanDir(path.join(/*turbopackIgnore: true*/ root, '.agents', 'skills'), '.agents', 200),
    scanDir(path.join(/*turbopackIgnore: true*/ home, '.agents', 'skills'), '.agents', 2000),
    scanDir(
      path.join(/*turbopackIgnore: true*/ home, '.gemini', 'config', 'skills'),
      'global-skills',
      2000,
    ),
  ])
  const map = new Map<string, InstalledSkillEntry>()
  for (const s of [...p1, ...p2, ...u1, ...g1]) {
    if (!map.has(s.slug)) map.set(s.slug, s)
  }
  const skills = Array.from(map.values()).sort((a, b) => a.slug.localeCompare(b.slug))
  CACHE.set(root, { at: Date.now(), skills })
  return skills
}

export async function listInstalledSkills(
  workspaceRoot: string,
  query?: string,
  limit = 40,
): Promise<InstalledSkillEntry[]> {
  const skills = await getAllInstalledSkills(workspaceRoot)
  const q = (query || '').trim().toLowerCase()
  const filtered = q
    ? skills.filter(
        (s) =>
          s.slug.includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
    : skills
  return filtered.slice(0, Math.max(1, Math.min(100, limit)))
}

export async function loadSkillInstructions(
  workspaceRoot: string,
  slugOrName: string,
): Promise<{ found: boolean; skill?: InstalledSkillEntry; content?: string; error?: string }> {
  const clean = slugOrName.trim().replace(/^\/+/, '').toLowerCase()
  if (!clean) return { found: false, error: 'Skill name is required.' }
  const all = await getAllInstalledSkills(workspaceRoot)
  const matched =
    all.find((s) => s.slug === clean || s.name.toLowerCase() === clean) ||
    all.find((s) => s.slug.includes(clean) || s.name.toLowerCase().includes(clean))
  if (!matched) {
    return { found: false, error: `Skill "${slugOrName}" not found in workspace or global skill directories.` }
  }
  try {
    const content = await readFile(/*turbopackIgnore: true*/ matched.skillFile, 'utf8')
    return { found: true, skill: matched, content: content.slice(0, 12_000) }
  } catch (err) {
    return {
      found: false,
      error: err instanceof Error ? err.message : 'Failed to read SKILL.md.',
    }
  }
}
