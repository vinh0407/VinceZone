'use client'

import { RotateCcw, Sparkles, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AppSettings, ProviderConfig, RoleModelAssignment } from '@/components/ide/agent-types'
import { ROLE_TERRITORIES } from '@/lib/vincezone-protocol'

const FIXED_ROLES = Object.values(ROLE_TERRITORIES)

export function RoleModelsSection({
  settings,
  providers,
  omniCombos = [],
  onChangeRoleModels,
}: {
  settings: AppSettings
  providers: ProviderConfig[]
  omniCombos?: Array<{ id: string; name?: string }>
  onChangeRoleModels: (next: Record<string, RoleModelAssignment>) => void
}) {
  const [customModelDrafts, setCustomModelDrafts] = useState<Record<string, string>>({})
  const [editingRole, setEditingRole] = useState<string | null>(null)

  const roleModels = settings.roleModels ?? {}

  // Gather every available model across all configured providers + live OmniRoute combos
  const allModelChoices = useMemo(() => {
    const items: Array<{ key: string; providerId: string; providerName: string; model: string }> = []
    const seen = new Set<string>()
    for (const p of providers) {
      const models = (p.models || p.model || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
      for (const m of models) {
        const key = `${p.id}::${m}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ key, providerId: p.id, providerName: p.name || p.id, model: m })
      }
    }
    const defaultProviderId = providers[0]?.id || 'omnirouter'
    for (const c of omniCombos) {
      const key = `${defaultProviderId}::${c.id}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        key,
        providerId: defaultProviderId,
        providerName: 'OmniRoute',
        model: c.id,
      })
    }
    return items
  }, [omniCombos, providers])

  const updateRoleModel = (roleId: string, providerId: string | undefined, model: string) => {
    const clean = model.trim()
    const next = { ...roleModels }
    if (!clean) {
      delete next[roleId]
    } else {
      next[roleId] = { providerId: providerId || providers[0]?.id, model: clean }
    }
    onChangeRoleModels(next)
  }

  return (
    <div className="rounded-lg border border-[#c9a24d]/30 bg-[#15130f] p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#f0d394]">
            <Users size={13} /> Per-Role Model Assignments ({FIXED_ROLES.length} fixed roles)
          </p>
          <p className="mt-0.5 text-[9.5px] text-[#9a9a9a]">
            Whenever Captain @PM recruits a team or you add a fixed specialist, each role
            automatically uses its assigned model below.{' '}
            <strong className="text-[#e6cfa0]">@CUSTOM</strong> remains unpinned so you can freely
            pick any model on the fly.
          </p>
        </div>
        {Object.keys(roleModels).length > 0 && (
          <button
            type="button"
            onClick={() => onChangeRoleModels({})}
            className="flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#202020] px-2 py-1 text-[9.5px] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white"
            title="Reset all fixed roles to recommended default models"
          >
            <RotateCcw size={10} /> Reset defaults
          </button>
        )}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {FIXED_ROLES.map((role) => {
          const assigned = roleModels[role.roleId]
          const activeModel = assigned?.model || role.recommendedModel
          const activeProviderId = assigned?.providerId || providers[0]?.id || 'omnirouter'
          const activeKey = `${activeProviderId}::${activeModel}`
          const isEditingCustom = editingRole === role.roleId
          const hasExactChoice = allModelChoices.some((c) => c.key === activeKey)

          return (
            <div
              key={role.roleId}
              className="rounded-md border border-[#2c2a24] bg-[#1a1916] px-2.5 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: role.accent }}
                  />
                  <span className="shrink-0 rounded bg-[#262626] px-1 py-0.5 font-mono text-[8.5px] font-semibold text-[#e6cfa0]">
                    @{role.code}
                  </span>
                  <span className="truncate text-[10.5px] font-medium text-[#e5e5e5]">
                    {role.title}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingCustom) {
                        setEditingRole(null)
                      } else {
                        setCustomModelDrafts((prev) => ({ ...prev, [role.roleId]: activeModel }))
                        setEditingRole(role.roleId)
                      }
                    }}
                    className="rounded border border-[#333333] bg-[#222222] px-1.5 py-0.5 text-[8.5px] text-[#cccccc] hover:border-[#c9a24d]/50 hover:text-white"
                    title="Enter a custom model ID for this role"
                  >
                    {isEditingCustom ? 'Pick list' : '+ Custom ID'}
                  </button>
                  {assigned && (
                    <button
                      type="button"
                      onClick={() => updateRoleModel(role.roleId, undefined, '')}
                      className="rounded p-0.5 text-[#858585] hover:bg-[#2a2a2a] hover:text-white"
                      title={`Reset to default (${role.recommendedModel})`}
                    >
                      <RotateCcw size={9} />
                    </button>
                  )}
                </div>
              </div>

              {isEditingCustom ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={customModelDrafts[role.roleId] ?? activeModel}
                    onChange={(e) =>
                      setCustomModelDrafts((prev) => ({ ...prev, [role.roleId]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateRoleModel(
                          role.roleId,
                          activeProviderId,
                          customModelDrafts[role.roleId] ?? activeModel,
                        )
                        setEditingRole(null)
                      }
                      if (e.key === 'Escape') setEditingRole(null)
                    }}
                    placeholder="e.g. anthropic/claude-sonnet-4"
                    className="min-w-0 flex-1 rounded border border-[#c9a24d]/50 bg-[#111111] px-2 py-1 font-mono text-[10px] text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      updateRoleModel(
                        role.roleId,
                        activeProviderId,
                        customModelDrafts[role.roleId] ?? activeModel,
                      )
                      setEditingRole(null)
                    }}
                    className="rounded bg-[#c9a24d] px-2 py-1 text-[9.5px] font-semibold text-[#111111] hover:bg-[#ddb968]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <select
                  value={hasExactChoice ? activeKey : `__direct__::${activeModel}`}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val.startsWith('__direct__::')) {
                      updateRoleModel(role.roleId, activeProviderId, val.slice(12))
                      return
                    }
                    const [pid, ...rest] = val.split('::')
                    updateRoleModel(role.roleId, pid, rest.join('::'))
                  }}
                  className="w-full rounded border border-[#333333] bg-[#111111] px-2 py-1 font-mono text-[10px] text-[#e5e5e5] outline-none focus:border-[#c9a24d]"
                >
                  {!hasExactChoice && (
                    <option value={`__direct__::${activeModel}`}>
                      {activeModel} {assigned ? '(assigned)' : '(recommended)'}
                    </option>
                  )}
                  {allModelChoices.map((choice) => (
                    <option key={choice.key} value={choice.key}>
                      {choice.model} · {choice.providerName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-1.5 rounded border border-[#2c2c2c] bg-[#121212] px-2.5 py-1.5 text-[9.5px] text-[#a3a3a3]">
        <Sparkles size={11} className="shrink-0 text-[#ddb968]" />
        <span>
          <strong className="text-white">@CUSTOM (Custom Specialist):</strong> Freely choose any
          model when creating the agent or switch models directly from the agent card header.
        </span>
      </div>
    </div>
  )
}
