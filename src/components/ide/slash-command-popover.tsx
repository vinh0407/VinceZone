'use client'

import { Plug, Puzzle, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import type { McpServerConfig, PluginConfig } from './agent-types'

export type SkillIndexItem = {
  id: string
  slug: string
  name: string
  description: string
  source: string
  path?: string
}

export type SlashCommandItem = {
  id: string
  kind: 'skill' | 'mcp' | 'plugin'
  command: string
  label: string
  description: string
  badge: string
}

export function slugifyCommand(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Returns the active `/query` token if the user is currently typing a slash command
 * at the end of the draft (e.g. "/", "/play", "fix bug /mcp:craft").
 */
export function extractActiveSlashQuery(draft: string): string | null {
  const match = draft.match(/(?:^|\s)\/([a-z0-9:._-]*)$/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * Replaces the trailing `/query` in `draft` with the chosen slash command + trailing space.
 */
export function applySlashSelection(draft: string, command: string): string {
  return draft.replace(/(^|\s)\/[a-z0-9:._-]*$/i, `$1${command} `)
}

export function buildSlashCommands(
  skills: SkillIndexItem[],
  mcpServers: McpServerConfig[],
  plugins: PluginConfig[],
  query: string,
): SlashCommandItem[] {
  const q = query.trim().toLowerCase()

  const mcpItems: SlashCommandItem[] = mcpServers
    .filter((m) => m.enabled)
    .map((m) => {
      const slug = slugifyCommand(m.name)
      return {
        id: `mcp-${m.id}`,
        kind: 'mcp',
        command: `/mcp:${slug}`,
        label: m.name,
        description: `${m.transport.toUpperCase()} · ${m.endpoint}`,
        badge: 'MCP',
      }
    })

  const pluginItems: SlashCommandItem[] = plugins
    .filter((p) => p.enabled)
    .map((p) => {
      const slug = slugifyCommand(p.name)
      return {
        id: `plugin-${p.id}`,
        kind: 'plugin',
        command: `/plugin:${slug}`,
        label: p.name,
        description: p.description,
        badge: 'PLUGIN',
      }
    })

  const skillItems: SlashCommandItem[] = skills.map((s) => ({
    id: `skill-${s.id}`,
    kind: 'skill',
    command: `/${s.slug}`,
    label: s.name,
    description: s.description,
    badge: 'SKILL',
  }))

  const all = [...mcpItems, ...pluginItems, ...skillItems]

  if (!q) {
    // Show active MCPs + Plugins first, then top popular/alphabetical skills
    return [...mcpItems, ...pluginItems, ...skillItems.slice(0, 14)].slice(0, 22)
  }

  if (q === 'mcp' || q.startsWith('mcp:')) {
    const sub = q.replace(/^mcp:?/, '')
    return mcpItems.filter(
      (item) =>
        !sub ||
        item.command.toLowerCase().includes(sub) ||
        item.label.toLowerCase().includes(sub),
    )
  }

  if (q === 'plugin' || q.startsWith('plugin:')) {
    const sub = q.replace(/^plugin:?/, '')
    return pluginItems.filter(
      (item) =>
        !sub ||
        item.command.toLowerCase().includes(sub) ||
        item.label.toLowerCase().includes(sub),
    )
  }

  return all
    .filter(
      (item) =>
        item.command.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const aExact = a.command.slice(1).startsWith(q) ? 0 : 1
      const bExact = b.command.slice(1).startsWith(q) ? 0 : 1
      return aExact - bExact
    })
    .slice(0, 20)
}

export function SlashCommandPopover({
  query,
  skills,
  mcpServers,
  plugins,
  selectedIndex,
  onSelect,
  onHoverIndex,
}: {
  query: string
  skills: SkillIndexItem[]
  mcpServers: McpServerConfig[]
  plugins: PluginConfig[]
  selectedIndex: number
  onSelect: (command: string) => void
  onHoverIndex: (index: number) => void
}) {
  const items = useMemo(
    () => buildSlashCommands(skills, mcpServers, plugins, query),
    [skills, mcpServers, plugins, query],
  )

  return (
    <div className="max-h-56 overflow-y-auto border-b border-[#2b2b2b] bg-[#161616] p-1">
      <div className="flex items-center justify-between px-2 py-1 text-[9px] uppercase tracking-wider text-[#858585]">
        <span>
          Slash Commands · {skills.length} skills · {mcpServers.filter((m) => m.enabled).length}{' '}
          MCP · {plugins.filter((p) => p.enabled).length} Plugins
        </span>
        <span className="font-mono text-[#6e6e6e]">↑↓ Enter / Tab</span>
      </div>
      {items.length === 0 ? (
        <p className="px-2 py-3 text-center text-[10px] text-[#737373]">
          No matching skill, MCP, or plugin for &ldquo;/{query}&rdquo;
        </p>
      ) : (
        items.map((item, idx) => {
          const active = idx === selectedIndex
          const Icon =
            item.kind === 'mcp' ? Plug : item.kind === 'plugin' ? Puzzle : Sparkles
          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => onHoverIndex(idx)}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(item.command)
              }}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition ${
                active ? 'bg-[#2a2a2a] text-white' : 'text-[#cccccc] hover:bg-[#222222]'
              }`}
            >
              <Icon size={11} className="mt-0.5 shrink-0 text-[#a3a3a3]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[10px] font-semibold text-white">
                    {item.command}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1 py-0.5 font-mono text-[8px] ${
                      item.kind === 'mcp'
                        ? 'bg-[#333333] text-white'
                        : item.kind === 'plugin'
                          ? 'bg-[#2a2a2a] text-[#e5e5e5]'
                          : 'bg-[#1f1f1f] text-[#a3a3a3]'
                    }`}
                  >
                    {item.badge}
                  </span>
                </div>
                <p className="truncate text-[9px] text-[#8e8e8e]">{item.description}</p>
              </div>
            </button>
          )
        })
      )}
    </div>
  )
}
