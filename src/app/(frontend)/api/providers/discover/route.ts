import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type DiscoveredProvider = {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  models: string
  source: 'omniroute' | 'opencode' | 'saving'
  isLocal?: boolean
}

export type DiscoveredOmniCombo = {
  id: string
  name: string
  strategy: string
  models: string[]
}

const DEFAULT_OMNIROUTE_COMBOS = [
  'super-coder',
  'lead-architect',
  'backend-core',
  'frontend-ui-ux',
  'qa-test-debugger',
  'secops-reviewer',
  'ultimate-free-stack',
  'free-forever',
  'always-on',
  'free-stack',
]

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function fetchLiveOmniRouteCombos(): Promise<{
  online: boolean
  combos: DiscoveredOmniCombo[]
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1600)
  try {
    const res = await fetch('http://127.0.0.1:20128/api/combos', {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return { online: false, combos: [] }
    const data = (await res.json()) as
      | Array<{ id?: string; name?: string; strategy?: string; models?: unknown[] }>
      | { combos?: Array<{ id?: string; name?: string; strategy?: string; models?: unknown[] }> }
    const rawList = Array.isArray(data) ? data : data.combos ?? []
    const combos: DiscoveredOmniCombo[] = rawList
      .filter((c) => c && c.name)
      .map((c) => ({
        id: String(c.id || c.name),
        name: String(c.name),
        strategy: String(c.strategy || 'priority'),
        models: Array.isArray(c.models)
          ? c.models
              .map((m) =>
                typeof m === 'string'
                  ? m
                  : typeof m === 'object' && m !== null
                    ? String((m as { model?: string; id?: string }).model || (m as { id?: string }).id || '')
                    : '',
              )
              .filter(Boolean)
          : [],
      }))
    return { online: true, combos }
  } catch {
    return { online: false, combos: [] }
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json(
      { error: 'Provider auto-discovery is restricted to local desktop runtime.' },
      { status: 403 },
    )
  }

  const home = os.homedir()
  const opencodePath = path.join(home, '.config', 'opencode', 'opencode.json')
  const savingPaths = [
    process.env.VINCEZONE_SAVING_API_CONFIG || '',
    'C:\\VisualStudio\\Saving\\data\\api_configs.json',
    path.join(home, 'Saving', 'data', 'api_configs.json'),
  ].filter(Boolean)

  const [omniLive, opencodeCfg, ...savingCfgs] = await Promise.all([
    fetchLiveOmniRouteCombos(),
    readJsonSafe<{
      provider?: Record<
        string,
        {
          name?: string
          options?: { baseURL?: string; apiKey?: string }
          models?: Record<string, unknown>
        }
      >
    }>(opencodePath),
    ...savingPaths.map((p) =>
      readJsonSafe<
        Array<{
          name?: string
          title?: string
          baseUrl?: string
          url?: string
          endpoint?: string
          apiKey?: string
          key?: string
          token?: string
          model?: string
          models?: string[] | string
        }>
      >(p),
    ),
  ])

  const discovered = new Map<string, DiscoveredProvider>()
  const liveComboNames = omniLive.combos.map((c) => c.name)

  // 1. OpenCode providers (prioritize OmniRoute AI Gateway with live combos!)
  if (opencodeCfg?.provider) {
    for (const [key, entry] of Object.entries(opencodeCfg.provider)) {
      const baseUrl = entry.options?.baseURL?.trim()
      if (!baseUrl) continue
      const isOmni =
        key.toLowerCase().includes('omni') || baseUrl.includes('20128') || baseUrl.includes('omniroute')
      const configModels = Object.keys(entry.models ?? {})
      const mergedModels = Array.from(
        new Set([
          ...(isOmni ? liveComboNames : []),
          ...configModels,
          ...(isOmni ? DEFAULT_OMNIROUTE_COMBOS : []),
        ]),
      )
      const id = isOmni ? 'omnirouter' : `opencode-${key.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`
      discovered.set(baseUrl.replace(/\/$/, '').toLowerCase(), {
        id,
        name: entry.name || (isOmni ? 'OmniRoute AI Gateway' : key),
        baseUrl,
        apiKey: entry.options?.apiKey?.trim() || '',
        model: mergedModels[0] || (isOmni ? 'super-coder' : ''),
        models: mergedModels.join(', '),
        source: isOmni ? 'omniroute' : 'opencode',
        isLocal: /localhost|127\.0\.0\.1/.test(baseUrl),
      })
    }
  }

  // Ensure OmniRoute exists if running locally even without opencode.json
  const omniKey = 'http://localhost:20128/v1'
  if (omniLive.online && !discovered.has(omniKey) && !discovered.has('http://127.0.0.1:20128/v1')) {
    const comboList = liveComboNames.length ? liveComboNames : DEFAULT_OMNIROUTE_COMBOS
    discovered.set(omniKey, {
      id: 'omnirouter',
      name: 'OmniRoute AI Gateway (Local)',
      baseUrl: omniKey,
      apiKey: '',
      model: comboList[0] || 'super-coder',
      models: comboList.join(', '),
      source: 'omniroute',
      isLocal: true,
    })
  }

  // 2. Saving project providers (OpenRouter, Kilo Gateway, Opencode2, Cloudflare Workers AI, etc.)
  for (const cfg of savingCfgs) {
    if (!Array.isArray(cfg)) continue
    for (const item of cfg) {
      const baseUrl = (item.baseUrl || item.url || item.endpoint || '').trim()
      const name = (item.name || item.title || '').trim()
      if (!baseUrl || !name) continue
      const normUrl = baseUrl.replace(/\/$/, '').toLowerCase()
      if (discovered.has(normUrl)) continue
      const modelList = Array.isArray(item.models)
        ? item.models.filter(Boolean)
        : typeof item.models === 'string'
          ? item.models
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean)
          : item.model
            ? [item.model]
            : []
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      discovered.set(normUrl, {
        id: `saving-${slug || 'provider'}`,
        name,
        baseUrl,
        apiKey: (item.apiKey || item.key || item.token || '').trim(),
        model: item.model || modelList[0] || '',
        models: modelList.join(', '),
        source: 'saving',
        isLocal: /localhost|127\.0\.0\.1/.test(baseUrl),
      })
    }
  }

  // Order OmniRoute first so it's the immediate default active provider
  const providers = Array.from(discovered.values()).sort((a, b) => {
    if (a.id === 'omnirouter') return -1
    if (b.id === 'omnirouter') return 1
    return a.name.localeCompare(b.name)
  })

  return Response.json(
    {
      ok: true,
      omnirouteOnline: omniLive.online,
      combos: omniLive.combos,
      providers,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
