import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type DiscoveredSkill = {
  id: string
  slug: string
  command: string
  name: string
  description: string
  source: '.agent' | '.agents' | 'global-skills'
  directory: string
  path: string
}

export type SkillCombo = {
  id: string
  command: string
  name: string
  group: string
  badge: string
  description: string
  coreSkills: string[]
  skills: string[]
  rules: string[]
  savedPercent: number
  promptCompact: string
  custom?: boolean
}

const FALLBACK_COMBOS: SkillCombo[] = [
  {
    id: 'combo-01-token-saver',
    command: '/combo:combo-01-token-saver',
    name: '01. Siêu Tiết Kiệm Token & Nén Ngữ Cảnh',
    group: '1. Tiết Kiệm Token & Bộ Nhớ',
    badge: 'Tiết kiệm ~99% Token',
    description:
      'Cắt bỏ văn phong thừa, tóm tắt output tool lớn (headroom), đưa code lên đầu và lazy-load SKILL.md.',
    coreSkills: ['caveman-compress', 'headroom', 'strategic-compact', 'context-budget'],
    skills: ['caveman-compress', 'headroom', 'strategic-compact', 'context-budget'],
    rules: [
      'Đưa kết quả & code lên đầu, bỏ lời chào thừa.',
      'Tóm tắt tool output dài trước khi suy luận.',
      'Chỉ đọc SKILL.md khi thực sự cần.',
    ],
    savedPercent: 99,
    promptCompact:
      '[COMBO: Siêu Tiết Kiệm Token] Core: /caveman-compress, /headroom, /strategic-compact. Output code/answer first, zero filler, summarize long logs, lazy-load skills.',
  },
  {
    id: 'combo-08-ponytail-surgical-coder',
    command: '/combo:combo-08-ponytail-surgical-coder',
    name: '08. Code Tối Giản Ponytail & Phẫu Thuật Logic',
    group: '3. Kỷ Luật Coder Cốt Lõi',
    badge: 'Ít dòng code nhất',
    description:
      'Viết giải pháp ngắn nhất chạy đúng, sửa kiểu phẫu thuật không đụng code thừa lân cận.',
    coreSkills: ['ponytail', 'surgical-patch', 'lean-build', 'minimal-fix', 'solid'],
    skills: ['ponytail', 'surgical-patch', 'lean-build', 'minimal-fix', 'solid'],
    rules: [
      'Ưu tiên sửa tối giản, xóa code thừa tốt hơn thêm mới.',
      'Không format hoặc sửa file ngoài phạm vi.',
    ],
    savedPercent: 99,
    promptCompact:
      '[COMBO: Ponytail Surgical Coder] Core: /ponytail, /surgical-patch, /lean-build. Write minimal surgical diffs, avoid unnecessary abstractions.',
  },
]

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
        const skillFolder = path.join(dirPath, entry.name)
        const skillMdPath = path.join(skillFolder, 'SKILL.md')
        try {
          const content = await readFile(skillMdPath, 'utf8')
          const slug = entry.name.toLowerCase()
          const parsedName = parseFrontmatterField(content, 'name') || entry.name
          const parsedDesc =
            parseFrontmatterField(content, 'description') || 'Agent skill module'
          return {
            id: `${source}:${entry.name}`,
            slug,
            command: `/${slug}`,
            name: parsedName,
            description: parsedDesc.slice(0, 160),
            source,
            directory: skillFolder,
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

function customCombosFilePath(root: string) {
  return path.join(root, '.vincezone', 'custom-combos.json')
}

async function loadSkillCombos(root: string): Promise<{ combos: SkillCombo[]; source: string }> {
  const home = os.homedir()
  const savingCandidates = [
    process.env.VINCEZONE_SAVING_COMBOS || '',
    'C:\\VisualStudio\\Saving\\data\\combos.json',
    path.join(home, 'Saving', 'data', 'combos.json'),
  ].filter(Boolean)

  let savingCombos: SkillCombo[] = []
  let source = 'built-in'

  for (const candidate of savingCandidates) {
    try {
      const raw = await readFile(candidate, 'utf8')
      const parsed = JSON.parse(raw) as Array<{
        id?: string
        name?: string
        group?: string
        badge?: string
        description?: string
        coreSkills?: string[]
        skills?: string[]
        rules?: string[]
        tokenStats?: { savedPercent?: number }
        promptCompact?: string
      }>
      if (Array.isArray(parsed) && parsed.length > 0) {
        savingCombos = parsed
          .filter((c) => c && c.id && c.name)
          .map((c) => {
            const id = String(c.id).toLowerCase()
            const coreSkills = Array.isArray(c.coreSkills) ? c.coreSkills : []
            const skills = Array.isArray(c.skills) ? c.skills : coreSkills
            const rules = Array.isArray(c.rules) ? c.rules : []
            return {
              id,
              command: `/combo:${id}`,
              name: String(c.name),
              group: String(c.group || 'Skill Combos'),
              badge: String(c.badge || `Tiết kiệm ~${c.tokenStats?.savedPercent ?? 95}% Token`),
              description: String(c.description || ''),
              coreSkills,
              skills,
              rules,
              savedPercent: c.tokenStats?.savedPercent ?? 96,
              promptCompact:
                c.promptCompact ||
                `[COMBO: ${c.name}] Core Skills: ${coreSkills.join(', ')}\nRules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
            }
          })
        source = candidate
        break
      }
    } catch {
      // Try next candidate
    }
  }

  let customCombos: SkillCombo[] = []
  try {
    const rawCustom = await readFile(customCombosFilePath(root), 'utf8')
    const parsedCustom = JSON.parse(rawCustom) as SkillCombo[]
    if (Array.isArray(parsedCustom)) {
      customCombos = parsedCustom.map((c) => ({ ...c, custom: true }))
    }
  } catch {
    // No custom combos yet
  }

  const base = savingCombos.length > 0 ? savingCombos : FALLBACK_COMBOS
  return { combos: [...customCombos, ...base], source }
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

  const [dotAgent, dotAgents, userAgents, geminiSkills] = await Promise.all([
    scanSkillsDir(projectDotAgent, '.agent', 200),
    scanSkillsDir(projectDotAgents, '.agents', 200),
    scanSkillsDir(userAgentsDir, '.agents', 2000),
    scanSkillsDir(geminiSkillsDir, 'global-skills', 2000),
  ])

  const deduped = new Map<string, DiscoveredSkill>()
  for (const skill of [...dotAgent, ...dotAgents, ...userAgents, ...geminiSkills]) {
    if (!deduped.has(skill.slug)) {
      deduped.set(skill.slug, skill)
    }
  }

  const skills = Array.from(deduped.values()).sort((a, b) => a.slug.localeCompare(b.slug))
  const dirs = [projectDotAgent, projectDotAgents, userAgentsDir, geminiSkillsDir]

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
  const root = path.resolve(
    searchParams.get('root')?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd(),
  )
  const requestedSkill = searchParams.get('skill')?.trim().toLowerCase()
  const requestedCombo = searchParams.get('combo')?.trim().toLowerCase()

  if (requestedCombo) {
    const cleanCombo = requestedCombo.replace(/^\/?(combo:)?/i, '')
    const { combos } = await loadSkillCombos(root)
    const matched = combos.find(
      (c) =>
        c.id.toLowerCase() === cleanCombo ||
        c.id.toLowerCase().includes(cleanCombo) ||
        c.name.toLowerCase().includes(cleanCombo),
    )
    if (!matched) {
      return Response.json({ ok: false, error: `Skill combo "${cleanCombo}" not found.` }, { status: 404 })
    }
    return Response.json({ ok: true, combo: matched }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const [index, comboBundle] = await Promise.all([getSkillIndex(root), loadSkillCombos(root)])

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
      combos: comboBundle.combos,
      comboSource: comboBundle.source,
      total: index.skills.length,
      totalCombos: comboBundle.combos.length,
      scannedPaths: index.dirs,
      scannedDirs: index.dirs,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Restricted to localhost.' }, { status: 403 })
  }

  let body: {
    action?: 'save-combo' | 'delete-combo'
    root?: string
    id?: string
    combo?: {
      name: string
      group?: string
      description?: string
      coreSkills: string[]
      rules?: string[]
    }
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const root = path.resolve(
    body.root?.trim() || process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd(),
  )
  const filePath = customCombosFilePath(root)
  let current: SkillCombo[] = []
  try {
    current = JSON.parse(await readFile(filePath, 'utf8')) as SkillCombo[]
  } catch {
    current = []
  }

  if (body.action === 'save-combo' && body.combo?.name && body.combo.coreSkills?.length) {
    const slug = body.combo.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const id = `custom-${slug || Date.now()}`
    const coreSkills = body.combo.coreSkills.map((s) => s.trim().replace(/^\//, '')).filter(Boolean)
    const rules = (body.combo.rules ?? []).filter(Boolean)
    const created: SkillCombo = {
      id,
      command: `/combo:${id}`,
      name: body.combo.name.trim(),
      group: body.combo.group?.trim() || 'Custom Combos',
      badge: `Custom · ${coreSkills.length} skills`,
      description: body.combo.description?.trim() || `Custom skill combo (${coreSkills.join(', ')})`,
      coreSkills,
      skills: coreSkills,
      rules,
      savedPercent: 95,
      promptCompact: `[COMBO: ${body.combo.name.trim()}] Core Skills: ${coreSkills.map((s) => `/${s}`).join(', ')}${rules.length ? `\nRules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}`,
      custom: true,
    }
    const next = [created, ...current.filter((item) => item.id !== id)]
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(next, null, 2), 'utf8')
    return Response.json({ ok: true, combo: created })
  }

  if (body.action === 'delete-combo' && body.id) {
    const next = current.filter((item) => item.id !== body.id)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(next, null, 2), 'utf8')
    return Response.json({ ok: true })
  }

  return Response.json({ ok: false, error: 'Unsupported action.' }, { status: 400 })
}
