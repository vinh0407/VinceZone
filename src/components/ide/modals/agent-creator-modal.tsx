'use client'

import { ArrowRight, Bot, MessageSquare, Sparkles, TerminalSquare, Users, X } from 'lucide-react'
import { useState } from 'react'
import {
  CUSTOM_ROLE_META,
  ROLE_TERRITORIES,
  type VinceZoneRoleId,
} from '@/lib/vincezone-protocol'
import type { Agent, AgentView, ProviderConfig } from '../agent-types'
import { Field } from './provider-settings-modal'

type RolePresetItem = {
  id: VinceZoneRoleId
  code: string
  label: string
  title: string
  position: string
  receivesFrom: string[]
  handsOffTo: string[]
  role: string
  soul: string
  mission: string
  memory: string
}

const ROLE_PRESETS: RolePresetItem[] = [
  ...(Object.values(ROLE_TERRITORIES).map((item) => ({
    id: item.roleId,
    code: item.code,
    label: `@${item.code} — ${item.title}`,
    title: item.title,
    position: item.position,
    receivesFrom: item.receivesFrom,
    handsOffTo: item.handsOffTo,
    role: item.summary,
    soul: item.defaultSoul,
    mission: item.defaultMission,
    memory: item.defaultMemory,
  })) as RolePresetItem[]),
  {
    id: 'custom',
    code: CUSTOM_ROLE_META.code,
    label: `@${CUSTOM_ROLE_META.code} — ${CUSTOM_ROLE_META.title}`,
    title: CUSTOM_ROLE_META.title,
    position: CUSTOM_ROLE_META.position,
    receivesFrom: CUSTOM_ROLE_META.receivesFrom,
    handsOffTo: CUSTOM_ROLE_META.handsOffTo,
    role: 'Custom specialist coding agent',
    soul: CUSTOM_ROLE_META.defaultSoul,
    mission: CUSTOM_ROLE_META.defaultMission,
    memory: CUSTOM_ROLE_META.defaultMemory,
  },
]

function parseModels(provider?: ProviderConfig) {
  if (!provider) return []
  return provider.models
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function AgentCreatorModal({
  providers,
  defaultProviderId,
  defaultModel,
  initialAgent,
  initialView = 'chat',
  onClose,
  onSave,
}: {
  providers: ProviderConfig[]
  defaultProviderId: string
  defaultModel: string
  initialAgent?: Agent | null
  initialView?: AgentView
  onClose: () => void
  onSave: (details: {
    id?: string
    name: string
    role: string
    roleId: VinceZoneRoleId
    soul: string
    mission: string
    memory: string
    providerId: string
    model: string
    view: AgentView
  }) => void
}) {
  const initialProvider =
    providers.find((item) => item.id === (initialAgent?.providerId || defaultProviderId)) ??
    providers[0]

  const initialPreset =
    ROLE_PRESETS.find((preset) => preset.id === initialAgent?.roleId) ??
    ROLE_PRESETS[ROLE_PRESETS.length - 1]

  const [name, setName] = useState(initialAgent?.name ?? '')
  const [roleId, setRoleId] = useState<VinceZoneRoleId>(initialAgent?.roleId ?? 'custom')
  const [role, setRole] = useState(initialAgent?.role ?? initialPreset.role)
  const [soul, setSoul] = useState(initialAgent?.soul ?? initialPreset.soul)
  const [mission, setMission] = useState(initialAgent?.mission ?? initialPreset.mission)
  const [memory, setMemory] = useState(initialAgent?.memory ?? initialPreset.memory)
  const [providerId, setProviderId] = useState(initialProvider?.id ?? '')
  const [model, setModel] = useState(
    initialAgent?.model || initialProvider?.model || defaultModel || '',
  )
  const [view, setView] = useState<AgentView>(initialView)

  const activePreset = ROLE_PRESETS.find((item) => item.id === roleId) ?? initialPreset
  const selectedProvider = providers.find((item) => item.id === providerId) ?? providers[0]
  const availableModels = parseModels(selectedProvider)
  const modelOptions =
    model && !availableModels.includes(model) ? [model, ...availableModels] : availableModels

  const applyRolePreset = (nextRoleId: VinceZoneRoleId) => {
    setRoleId(nextRoleId)
    const preset = ROLE_PRESETS.find((item) => item.id === nextRoleId)
    if (!preset) return
    setRole(preset.role)
    setSoul(preset.soul)
    setMission(preset.mission)
    setMemory(preset.memory)
    if (!initialAgent) {
      setName(preset.title)
    }
  }

  const handleProviderChange = (nextProviderId: string) => {
    setProviderId(nextProviderId)
    const target = providers.find((item) => item.id === nextProviderId)
    if (!target) return
    const nextModels = parseModels(target)
    setModel(target.model || nextModels[0] || '')
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <section className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#333333] bg-[#141414] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-4 py-3">
          <div className="flex items-center gap-2">
            {roleId === 'pm' ? (
              <Sparkles size={15} className="text-white" />
            ) : (
              <Bot size={15} className="text-[#d4d4d4]" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-white">
                {initialAgent ? `Edit Agent — ${initialAgent.name}` : 'Create AI Agent'}
              </h2>
              <p className="mt-0.5 text-[10px] text-[#858585]">
                14 specialized team roles with interlocking Soul, Mission & Role Memory for seamless
                collaboration.
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Agent Name"
              value={name}
              onChange={setName}
              placeholder={activePreset.title}
            />
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
                Role Preset (14 Roles)
              </span>
              <select
                value={roleId}
                onChange={(event) => applyRolePreset(event.target.value as VinceZoneRoleId)}
                className="w-full rounded-md border border-[#333333] bg-[#1b1b1b] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none focus:border-[#737373]"
              >
                {ROLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Role Position & Collaboration Explanation Card */}
          <div className="rounded-lg border border-[#2f2f2f] bg-[#181818] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                <Users size={12} className="text-[#cccccc]" />
                Vị trí trong đội ngũ: @{activePreset.code} ({activePreset.title})
              </div>
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-[#bdbdbd]">{activePreset.position}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[#9d9d9d]">
              <span className="rounded bg-[#222222] px-1.5 py-0.5 font-mono text-[#d4d4d4]">
                Nhận từ: {activePreset.receivesFrom.join(', ')}
              </span>
              <ArrowRight size={11} className="text-[#737373]" />
              <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-white">
                @{activePreset.code}
              </span>
              <ArrowRight size={11} className="text-[#737373]" />
              <span className="rounded bg-[#222222] px-1.5 py-0.5 font-mono text-[#d4d4d4]">
                Bàn giao cho: {activePreset.handsOffTo.join(', ')}
              </span>
            </div>
          </div>

          <Field
            label="Role Summary"
            value={role}
            onChange={setRole}
            placeholder="API implementation, validation, and unit tests"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
                Provider (from Settings)
              </span>
              <select
                value={providerId}
                onChange={(event) => handleProviderChange(event.target.value)}
                className="w-full rounded-md border border-[#333333] bg-[#1b1b1b] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none focus:border-[#737373]"
              >
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">Model</span>
              {modelOptions.length > 0 ? (
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="w-full rounded-md border border-[#333333] bg-[#1b1b1b] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none focus:border-[#737373]"
                >
                  {modelOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="Add models in Settings → Providers"
                  className="w-full rounded-md border border-[#333333] bg-[#1b1b1b] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
                />
              )}
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
              Soul (Personality, Communication Style & Team Principles)
            </span>
            <textarea
              rows={2}
              value={soul}
              onChange={(event) => setSoul(event.target.value)}
              placeholder="e.g. Direct, thorough, prefers small surgical diffs..."
              className="w-full resize-none rounded-md border border-[#333333] bg-[#101010] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
              Mission (Primary Objective & Ownership Boundaries)
            </span>
            <textarea
              rows={2}
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              placeholder="e.g. Own backend API endpoints and keep strict contract parity..."
              className="w-full resize-none rounded-md border border-[#333333] bg-[#101010] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
              Role Memory (Collaboration Handoff Rules & Persistent Constraints)
            </span>
            <textarea
              rows={2}
              value={memory}
              onChange={(event) => setMemory(event.target.value)}
              placeholder="e.g. Coordinate with @BE via HANDOFF @BE: before wiring UI..."
              className="w-full resize-none rounded-md border border-[#333333] bg-[#101010] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
              Default Panel View
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
                { id: 'terminal' as const, label: 'Terminal', icon: TerminalSquare },
              ].map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setView(option.id)}
                    className={`flex items-center justify-center gap-2 rounded-md border py-2 text-[11px] ${
                      view === option.id
                        ? 'border-[#737373] bg-[#2a2a2a] text-white'
                        : 'border-[#2f2f2f] text-[#858585] hover:bg-[#1e1e1e]'
                    }`}
                  >
                    <Icon size={13} /> {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#2b2b2b] bg-[#181818] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[11px] text-[#a3a3a3] hover:bg-[#2a2a2a]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onSave({
                id: initialAgent?.id,
                name: name.trim() || activePreset.title,
                role: role.trim() || activePreset.role,
                roleId,
                soul: soul.trim(),
                mission: mission.trim(),
                memory: memory.trim(),
                providerId: selectedProvider?.id ?? '',
                model: model.trim() || selectedProvider?.model || defaultModel,
                view,
              })
            }
            className="rounded-md bg-[#e5e5e5] px-3.5 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white"
          >
            {initialAgent ? 'Save Agent' : 'Create Agent'}
          </button>
        </div>
      </section>
    </div>
  )
}
