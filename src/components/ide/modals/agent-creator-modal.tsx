'use client'

import { Bot, MessageSquare, Sparkles, TerminalSquare, X } from 'lucide-react'
import { useState } from 'react'
import type { VinceZoneRoleId } from '@/lib/vincezone-protocol'
import type { Agent, AgentView, ProviderConfig } from '../agent-types'
import { Field } from './provider-settings-modal'

type RolePreset = {
  id: VinceZoneRoleId
  label: string
  role: string
  soul: string
  mission: string
  memory: string
}

const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'pm',
    label: '@PM — Orchestrator',
    role: 'Central Task Registry, decomposition & QA coordination',
    soul: 'Decisive, structured, zero duplicate work, enforces verifiable handoffs.',
    mission:
      'Decompose goals into non-overlapping tasks with clear owners, dependencies, and acceptance criteria.',
    memory: 'Always verify FE↔BE API contracts before dispatching UI integration tasks.',
  },
  {
    id: 'arch',
    label: '@ARCH — Architect',
    role: 'System architecture, API contracts & docs',
    soul: 'Minimalist, modular, protects long-term architectural clarity.',
    mission: 'Define system boundaries, data schemas, and clean interfaces across modules.',
    memory: 'Keep core logic pure in src/lib/ with unit test coverage.',
  },
  {
    id: 'fe',
    label: '@FE — Frontend',
    role: 'React/Next.js UI components, design system & state',
    soul: 'Craft-obsessed, monochrome VS Code ergonomics, zero visual clutter.',
    mission: 'Build responsive, accessible interfaces strictly inside frontend component boundaries.',
    memory: 'Never modify backend API routes directly; consume documented contracts.',
  },
  {
    id: 'be',
    label: '@BE — Backend',
    role: 'Server routes, security guards, services & API contracts',
    soul: 'Security-first, strict input validation, zero shortcuts on SSRF or auth.',
    mission: 'Implement reliable server endpoints, local runtimes, and typed API contracts.',
    memory: 'Primary owner of API contracts; guard local routes with loopback checks.',
  },
  {
    id: 'db',
    label: '@DB — Data & Schema',
    role: 'Database schema, migrations, indexing & query performance',
    soul: 'Data-integrity first, backwards-compatible migrations, strict typing.',
    mission: 'Design durable schemas, access control rules, and safe data transitions.',
    memory: 'Never drop fields or alter cardinality without verifying existing records.',
  },
  {
    id: 'qa',
    label: '@QA — Verification',
    role: 'Unit tests, E2E verification & regression audits',
    soul: 'Skeptical, evidence-driven, verifies every change with real commands.',
    mission: 'Catch edge cases, write Vitest & Playwright checks, and block unverified merges.',
    memory: 'Never mark work complete without passing tsc, vitest, and browser console checks.',
  },
  {
    id: 'devops',
    label: '@DEVOPS — Runtime',
    role: 'Desktop Electron packaging, CI/CD, Docker & local tooling',
    soul: 'Automate everything, reproducible builds, clean local startup.',
    mission: 'Maintain Electron packaging, scripts, ports, and reliable deployment pipelines.',
    memory: 'Keep localhost:40704 startup fast and clean on Windows & cross-platform.',
  },
  {
    id: 'custom',
    label: '@CUSTOM — Specialist',
    role: 'Custom specialist coding agent',
    soul: 'Focused, pragmatic, concise engineering communicator.',
    mission: 'Deliver scoped, high-signal changes with minimal footprint.',
    memory: 'Respect workspace conventions and attach evidence to every handoff.',
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
    ROLE_PRESETS.find((preset) => preset.id === initialAgent?.roleId) ?? ROLE_PRESETS[7]

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
    if (!initialAgent && !name.trim()) {
      setName(preset.label.split('—')[1]?.trim() || 'Specialist Agent')
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
      <section className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#333333] bg-[#141414] shadow-2xl">
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
                Configure role persona (Soul, Mission, Memory), provider, and model.
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
              placeholder="Backend Specialist"
            />
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
                Role Preset
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
              Soul (Personality, Communication Style & Principles)
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
              Role Memory (Persistent Rules, Constraints & Context)
            </span>
            <textarea
              rows={2}
              value={memory}
              onChange={(event) => setMemory(event.target.value)}
              placeholder="e.g. Always write Vitest specs before editing business logic..."
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
                name: name.trim() || 'Specialist Agent',
                role: role.trim() || 'Custom specialist coding agent',
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
