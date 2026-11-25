export type SettingsSearchEntry = {
  tab:
    | 'general'
    | 'providers'
    | 'usage'
    | 'github'
    | 'skills'
    | 'cli'
    | 'mcp'
    | 'extensions'
    | 'memory'
    | 'agents'
    | 'permissions'
  label: string
  keywords: string[]
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  {
    tab: 'general',
    label: 'Color Theme (Dark / Light / High Contrast)',
    keywords: ['theme', 'dark', 'light', 'high contrast', 'appearance', 'color'],
  },
  {
    tab: 'general',
    label: 'Auto-Save, Delay & Format on Save',
    keywords: ['auto save', 'autosave', 'debounce', 'disk', 'flush', 'format on save', 'prettier', 'biome', 'ruff'],
  },
  {
    tab: 'general',
    label: 'Editor Font Size, Word Wrap & Minimap',
    keywords: ['font', 'size', 'word wrap', 'minimap', 'monaco', 'compact'],
  },
  {
    tab: 'general',
    label: 'OS DPAPI Encryption & Updates',
    keywords: ['dpapi', 'encryption', 'safeStorage', 'update', 'version', 'session-store'],
  },
  {
    tab: 'providers',
    label: 'AI Providers, API Keys & Role Models (Model theo từng vị trí)',
    keywords: ['provider', 'api key', 'base url', 'omniroute', 'openai', 'model', 'combo', 'role model', 'vi tri', 'vị trí', 'pm', 'fe', 'be', 'qa', 'custom'],
  },
  {
    tab: 'usage',
    label: 'Token Usage & Cost Analytics',
    keywords: ['token', 'usage', 'cost', 'usd', 'analytics', 'spending'],
  },
  {
    tab: 'github',
    label: 'GitHub CLI Authentication & Repos',
    keywords: ['github', 'gh', 'token', 'login', 'repo', 'git'],
  },
  {
    tab: 'skills',
    label: '.agent Skills & Saving Skill Combos',
    keywords: ['skill', 'combo', 'slash', 'prompt', 'saving'],
  },
  {
    tab: 'cli',
    label: 'Detected Local CLI Tools (Claude, Codex, Gemini)',
    keywords: ['cli', 'claude', 'codex', 'gemini', 'opencode', 'detect'],
  },
  {
    tab: 'mcp',
    label: 'MCP Servers (stdio / HTTP tools)',
    keywords: ['mcp', 'stdio', 'http', 'playwright', 'filesystem', 'tools'],
  },
  {
    tab: 'extensions',
    label: 'IDE Plugins & Extensions',
    keywords: ['plugin', 'extension', 'addon'],
  },
  {
    tab: 'memory',
    label: 'Project & Agent Persistent Memory',
    keywords: ['memory', 'notes', 'context', 'recall'],
  },
  {
    tab: 'agents',
    label: 'Multi-Agent Concurrency & Delegation Limits',
    keywords: ['agent', 'delegation', 'concurrent', 'subagent', 'team', 'captain'],
  },
  {
    tab: 'permissions',
    label: 'Tool Permissions, Shell Approval & Auto-Apply',
    keywords: ['permission', 'security', 'shell', 'terminal', 'dangerous', 'auto apply', 'approve'],
  },
]

export function searchSettingsEntries(query: string): SettingsSearchEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return SETTINGS_SEARCH_INDEX.filter(
    (entry) =>
      entry.label.toLowerCase().includes(q) ||
      entry.tab.includes(q) ||
      entry.keywords.some((kw) => kw.includes(q)),
  )
}
