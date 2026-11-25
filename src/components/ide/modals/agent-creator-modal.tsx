'use client'

import {
  ArrowRight,
  BookmarkPlus,
  Bot,
  Check,
  Crown,
  Layers,
  MessageSquare,
  RotateCcw,
  Sparkles,
  TerminalSquare,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { resolveModelForRole, type FixedSpecialistRoleId } from '@/lib/pm-team-recruiter'
import {
  BUILTIN_PROJECT_TEAM_COMBOS,
  deleteCustomTeamCombo,
  loadSavedCustomTeamCombos,
  recommendTeamComboForWorkspace,
  saveCustomTeamCombo,
  UNIVERSAL_ELITE_SKILLS,
  type ProjectTeamCombo,
} from '@/lib/team-combos'
import {
  CUSTOM_ROLE_META,
  getRoleBlueprint,
  ROLE_TERRITORIES,
  type VinceZoneRoleId,
} from '@/lib/vincezone-protocol'
import type {
  Agent,
  AgentView,
  ProviderConfig,
  RoleModelAssignment,
  WorkspaceFile,
} from '../agent-types'
import { Field } from './provider-settings-modal'

type RolePresetItem = {
  id: VinceZoneRoleId
  code: string
  label: string
  title: string
  position: string
  receivesFrom: string[]
  handsOffTo: string[]
  recommendedModel: string
  defaultSkills: string[]
  role: string
  soul: string
  mission: string
  memory: string
}

const ROLE_PRESETS: RolePresetItem[] = [
  ...(Object.values(ROLE_TERRITORIES).map((rawItem) => {
    const item = getRoleBlueprint(rawItem.roleId)
    return {
      id: item.roleId,
      code: item.code,
      label: `@${item.code} — ${item.title}`,
      title: item.title,
      position: item.position,
      receivesFrom: item.receivesFrom,
      handsOffTo: item.handsOffTo,
      recommendedModel: item.recommendedModel,
      defaultSkills: item.defaultSkills,
      role: item.summary,
      soul: item.defaultSoul,
      mission: item.defaultMission,
      memory: item.defaultMemory,
    }
  }) as RolePresetItem[]),
  (() => {
    const customBp = getRoleBlueprint('custom')
    return {
      id: 'custom' as const,
      code: CUSTOM_ROLE_META.code,
      label: `@${CUSTOM_ROLE_META.code} — ${CUSTOM_ROLE_META.title}`,
      title: CUSTOM_ROLE_META.title,
      position: CUSTOM_ROLE_META.position,
      receivesFrom: CUSTOM_ROLE_META.receivesFrom,
      handsOffTo: CUSTOM_ROLE_META.handsOffTo,
      recommendedModel: CUSTOM_ROLE_META.recommendedModel,
      defaultSkills: customBp.defaultSkills,
      role: CUSTOM_ROLE_META.summary,
      soul: CUSTOM_ROLE_META.defaultSoul,
      mission: CUSTOM_ROLE_META.defaultMission,
      memory: CUSTOM_ROLE_META.defaultMemory,
    }
  })(),
]

const ALL_SPECIALIST_ROLE_IDS: FixedSpecialistRoleId[] = [
  'arch',
  'fe',
  'uiux',
  'be',
  'db',
  'mobile',
  'ai',
  'sec',
  'qa',
  'devops',
  'perf',
  'docs',
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
  roleModels,
  projectName = 'VinceZone Studio',
  files = [],
  initialAgent,
  initialView = 'chat',
  onClose,
  onSave,
  onDeployTeamCombo,
}: {
  providers: ProviderConfig[]
  defaultProviderId: string
  defaultModel: string
  roleModels?: Record<string, RoleModelAssignment>
  projectName?: string
  files?: WorkspaceFile[]
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
  onDeployTeamCombo?: (payload: {
    combo: ProjectTeamCombo
    teamName: string
    selectedRoles: FixedSpecialistRoleId[]
    customDirective: string
    includeCustomAgent: { name: string; role: string; model: string; providerId: string } | null
  }) => void
}) {
  const recommendation = useMemo(() => recommendTeamComboForWorkspace(files), [files])
  const [modeTab, setModeTab] = useState<'team' | 'single'>(
    initialAgent ? 'single' : onDeployTeamCombo ? 'team' : 'single',
  )

  // --- Project Team Combo state ---
  const [savedCustomCombos, setSavedCustomCombos] = useState<ProjectTeamCombo[]>(() =>
    loadSavedCustomTeamCombos(),
  )
  const allCombos = useMemo(
    () => [...BUILTIN_PROJECT_TEAM_COMBOS, ...savedCustomCombos],
    [savedCustomCombos],
  )
  const [selectedComboId, setSelectedComboId] = useState<string>(recommendation.recommended.id)
  const activeCombo =
    allCombos.find((c) => c.id === selectedComboId) ?? recommendation.recommended
  const [teamName, setTeamName] = useState<string>(
    `${projectName} · ${recommendation.recommended.name}`,
  )
  const [selectedRoles, setSelectedRoles] = useState<FixedSpecialistRoleId[]>(
    recommendation.recommended.roles,
  )
  const [customDirective, setCustomDirective] = useState<string>('')
  const [addCustomMember, setAddCustomMember] = useState(false)
  const [customMemberName, setCustomMemberName] = useState('Custom Specialist')
  const [customMemberRole, setCustomMemberRole] = useState(
    'Handle project-specific domain tasks and custom integrations',
  )
  const [customMemberModel, setCustomMemberModel] = useState(defaultModel)

  const handleSelectCombo = (combo: ProjectTeamCombo) => {
    setSelectedComboId(combo.id)
    setSelectedRoles(combo.roles)
    setTeamName(`${projectName} · ${combo.name}`)
  }

  const toggleSpecialistRole = (rid: FixedSpecialistRoleId) => {
    setSelectedRoles((prev) =>
      prev.includes(rid)
        ? prev.length > 1
          ? prev.filter((item) => item !== rid)
          : prev
        : [...prev, rid],
    )
  }

  const handleSaveCustomComboPreset = () => {
    const cleanName = teamName.trim() || 'Custom Project Team'
    const customCombo: ProjectTeamCombo = {
      id: `custom-${Date.now().toString(36)}`,
      name: cleanName,
      badge: 'Custom Team Preset',
      tagline: `${selectedRoles.map((r) => `@${r.toUpperCase()}`).join(', ')}`,
      description:
        customDirective.trim() ||
        `Custom project team (${cleanName}) with @PM Captain and ${selectedRoles.length} specialists.`,
      roles: selectedRoles,
      comboSkills: Array.from(
        new Set([
          ...activeCombo.comboSkills,
          ...UNIVERSAL_ELITE_SKILLS,
        ]),
      ),
      pmLogic: {
        soulAddon: activeCombo.pmLogic.soulAddon,
        missionAddon: customDirective.trim() || activeCombo.pmLogic.missionAddon,
        memoryAddon: activeCombo.pmLogic.memoryAddon,
      },
      specialistLogic: activeCombo.specialistLogic,
      isCustom: true,
    }
    const next = saveCustomTeamCombo(customCombo)
    setSavedCustomCombos(next)
    setSelectedComboId(customCombo.id)
  }

  // --- Single Agent state ---
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
    if (nextRoleId !== 'custom') {
      const resolved = resolveModelForRole(
        nextRoleId,
        roleModels,
        selectedProvider?.id || defaultProviderId,
        defaultModel,
      )
      if (resolved.providerId && providers.some((p) => p.id === resolved.providerId)) {
        setProviderId(resolved.providerId)
      }
      if (resolved.model) {
        setModel(resolved.model)
      }
    }
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
      <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#333333] bg-[#141414] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#181818] px-4 py-3">
          <div className="flex items-center gap-2">
            {modeTab === 'team' ? (
              <Users size={15} className="text-[#e6cfa0]" />
            ) : roleId === 'pm' ? (
              <Sparkles size={15} className="text-white" />
            ) : (
              <Bot size={15} className="text-[#d4d4d4]" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-white">
                {initialAgent
                  ? `Edit Agent — ${initialAgent.name}`
                  : modeTab === 'team'
                    ? 'Create Project Team (Combo & Custom Squad)'
                    : 'Create Single AI Agent'}
              </h2>
              <p className="mt-0.5 text-[10px] text-[#858585]">
                {modeTab === 'team'
                  ? 'Each Project Team Combo configures tailored @PM Captain logic, specialist duties, Role Models, and elite skills (/unslop, /design-taste-frontend, /ponytail, /playwright-cli, /cli-anything).'
                  : '14 specialized team roles with interlocking Soul, Mission, Role Memory & token-saving skills.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!initialAgent && onDeployTeamCombo && (
              <div className="flex rounded-lg border border-[#333333] bg-[#111111] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setModeTab('team')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                    modeTab === 'team'
                      ? 'bg-[#c9a24d] text-[#111111]'
                      : 'text-[#a3a3a3] hover:text-white'
                  }`}
                >
                  <Users size={12} /> Project Team Combo
                </button>
                <button
                  type="button"
                  onClick={() => setModeTab('single')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                    modeTab === 'single'
                      ? 'bg-[#e5e5e5] text-[#111111]'
                      : 'text-[#a3a3a3] hover:text-white'
                  }`}
                >
                  <Bot size={12} /> Single Agent
                </button>
              </div>
            )}
            <button className="icon-button" onClick={onClose} title="Close">
              <X size={15} />
            </button>
          </div>
        </div>

        {modeTab === 'team' && !initialAgent && onDeployTeamCombo ? (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {/* AI @PM Recommendation Banner */}
              <div className="rounded-lg border border-[#c9a24d]/40 bg-[#1a1710] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#f0d394]">
                    <Sparkles size={13} /> @PM Recommended Combo for {projectName}:{' '}
                    <span className="underline">{recommendation.recommended.name}</span>
                  </div>
                  {selectedComboId !== recommendation.recommended.id && (
                    <button
                      type="button"
                      onClick={() => handleSelectCombo(recommendation.recommended)}
                      className="rounded border border-[#c9a24d]/50 bg-[#c9a24d]/15 px-2 py-0.5 text-[10px] font-medium text-[#f0d394] hover:bg-[#c9a24d]/25"
                    >
                      Use Recommended
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-4 text-[#c7bfa8]">
                  {recommendation.reason}
                </p>
              </div>

              {/* Project Team Combo Grid */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9d9d9d]">
                    1. Select Project Team Combo (or Custom Preset)
                  </span>
                  <span className="text-[10px] text-[#737373]">
                    {allCombos.length} presets available
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allCombos.map((combo) => {
                    const isSelected = combo.id === activeCombo.id
                    const isRec = combo.id === recommendation.recommended.id
                    return (
                      <div
                        key={combo.id}
                        onClick={() => handleSelectCombo(combo)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') handleSelectCombo(combo)
                        }}
                        className={`group relative flex cursor-pointer flex-col justify-between rounded-lg border p-2.5 text-left transition ${
                          isSelected
                            ? 'border-[#c9a24d] bg-[#211d13] text-white shadow-[0_0_14px_rgba(201,162,77,0.18)]'
                            : 'border-[#2c2c2c] bg-[#181818] text-[#cccccc] hover:border-[#444444] hover:bg-[#1e1e1e]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[8.5px] text-[#e6cfa0]">
                              {combo.badge}
                            </span>
                            <div className="flex items-center gap-1">
                              {isRec && (
                                <span className="rounded bg-[#c9a24d]/20 px-1.5 py-0.5 text-[8.5px] font-semibold text-[#f0d394]">
                                  Recommended
                                </span>
                              )}
                              {combo.isCustom && (
                                <button
                                  type="button"
                                  title="Delete saved custom combo"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const next = deleteCustomTeamCombo(combo.id)
                                    setSavedCustomCombos(next)
                                    if (selectedComboId === combo.id) {
                                      handleSelectCombo(recommendation.recommended)
                                    }
                                  }}
                                  className="rounded p-0.5 text-[#858585] hover:bg-[#332020] hover:text-[#f48771]"
                                >
                                  <Trash2 size={10} />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="mt-1.5 text-[12px] font-semibold text-white">
                            {combo.name}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#9a9a9a]">
                            {combo.description}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[#2a2a2a] pt-1.5">
                          <span className="rounded bg-[#c9a24d]/20 px-1 py-0.5 font-mono text-[8.5px] font-semibold text-[#f0d394]">
                            @PM
                          </span>
                          {combo.roles.map((r) => (
                            <span
                              key={r}
                              className="rounded bg-[#252525] px-1 py-0.5 font-mono text-[8.5px] text-[#d4d4d4]"
                            >
                              @{r.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Team Name & Custom Save */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Field
                    label="2. Team / Project Squad Name"
                    value={teamName}
                    onChange={setTeamName}
                    placeholder={`${projectName} · ${activeCombo.name}`}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSaveCustomComboPreset}
                    className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-md border border-[#3a3a3a] bg-[#1e1e1e] px-3 text-[11px] font-medium text-[#e5e5e5] transition hover:border-[#c9a24d]/50 hover:bg-[#262626]"
                    title="Save current team name, role selection, and directive as a reusable preset"
                  >
                    <BookmarkPlus size={13} className="text-[#e6cfa0]" /> Save as Custom Combo
                  </button>
                </div>
              </div>

              {/* Customize Specialist Roster & Per-Role Models */}
              <div className="rounded-lg border border-[#2b2b2b] bg-[#181818] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#e5e5e5]">
                    3. Team Roster &amp; Pre-Configured Role Models (@PM Captain +{' '}
                    {selectedRoles.length} Specialists)
                  </span>
                  <span className="text-[9.5px] text-[#858585]">
                    Click any role to add/remove from this project team
                  </span>
                </div>

                {/* Locked @PM Captain Row */}
                <div className="mb-2 flex items-center justify-between rounded-md border border-[#c9a24d]/40 bg-[#221d12] px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Crown size={13} className="text-[#f0d394]" />
                    <span className="font-semibold text-[#f0d394]">
                      @PM — PM Orchestrator (Locked Team Captain · Left Pane in 1:6 PM)
                    </span>
                  </div>
                  <span className="rounded bg-[#141414] px-1.5 py-0.5 font-mono text-[9.5px] text-[#e6cfa0]">
                    {
                      resolveModelForRole('pm', roleModels, defaultProviderId, defaultModel)
                        .model
                    }
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {ALL_SPECIALIST_ROLE_IDS.map((rid) => {
                    const meta = ROLE_TERRITORIES[rid]
                    const checked = selectedRoles.includes(rid)
                    const resolvedModel = resolveModelForRole(
                      rid,
                      roleModels,
                      defaultProviderId,
                      defaultModel,
                    ).model
                    const comboDuty =
                      activeCombo.specialistLogic[rid]?.responsibility || meta.summary
                    return (
                      <button
                        key={rid}
                        type="button"
                        onClick={() => toggleSpecialistRole(rid)}
                        title={comboDuty}
                        className={`flex flex-col justify-between rounded-md border px-2.5 py-1.5 text-left transition ${
                          checked
                            ? 'border-[#c9a24d]/60 bg-[#c9a24d]/15 text-white'
                            : 'border-[#2b2b2b] bg-[#121212] text-[#7a7a7a] hover:border-[#3d3d3d] hover:text-[#bdbdbd]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] font-semibold text-[#e6cfa0]">
                            @{meta.code}
                          </span>
                          {checked && <Check size={11} className="text-[#f0d394]" />}
                        </div>
                        <span className="truncate text-[10.5px] font-medium">{meta.title}</span>
                        <span className="mt-0.5 truncate font-mono text-[8.5px] text-[#8a8a8a]">
                          {resolvedModel}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Optional @CUSTOM Freeform Member */}
                <div className="mt-2.5 border-t border-[#262626] pt-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#d4d4d4]">
                    <input
                      type="checkbox"
                      checked={addCustomMember}
                      onChange={(e) => setAddCustomMember(e.target.checked)}
                      className="accent-[#c9a24d]"
                    />
                    <span>
                      Include an extra <strong className="text-[#e6cfa0]">@CUSTOM</strong> freeform
                      specialist (unpinned model)
                    </span>
                  </label>
                  {addCustomMember && (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        value={customMemberName}
                        onChange={(e) => setCustomMemberName(e.target.value)}
                        placeholder="Custom Agent Name"
                        className="rounded border border-[#333333] bg-[#101010] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-[#c9a24d]"
                      />
                      <input
                        value={customMemberRole}
                        onChange={(e) => setCustomMemberRole(e.target.value)}
                        placeholder="Custom responsibility"
                        className="rounded border border-[#333333] bg-[#101010] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-[#c9a24d]"
                      />
                      <input
                        value={customMemberModel}
                        onChange={(e) => setCustomMemberModel(e.target.value)}
                        placeholder="Freeform model ID"
                        className="rounded border border-[#333333] bg-[#101010] px-2.5 py-1.5 font-mono text-[11px] text-white outline-none focus:border-[#c9a24d]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Combo PM Logic & Skill Pack Preview */}
              <div className="rounded-lg border border-[#2b2b2b] bg-[#181818] p-3 text-[11px]">
                <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-[#f0d394]">
                  <Layers size={13} /> Combo Logic &amp; Equipped Power Skills
                </div>
                <p className="text-[10.5px] leading-4 text-[#cccccc]">
                  <strong className="text-white">@PM Logic:</strong> {activeCombo.pmLogic.soulAddon}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Array.from(
                    new Set([...activeCombo.comboSkills, ...UNIVERSAL_ELITE_SKILLS]),
                  ).map((skill) => (
                    <span
                      key={skill}
                      className="rounded border border-[#383326] bg-[#16140f] px-1.5 py-0.5 font-mono text-[9.5px] text-[#e6cfa0]"
                    >
                      /{skill}
                    </span>
                  ))}
                </div>
                <label className="mt-2.5 block">
                  <span className="mb-1 block text-[10px] font-medium text-[#9d9d9d]">
                    Optional Custom Project Directive (injected into @PM and all team members):
                  </span>
                  <input
                    value={customDirective}
                    onChange={(e) => setCustomDirective(e.target.value)}
                    placeholder="e.g. Focus on Next.js App Router, Tailwind v4, strict TDD, and mobile-first dark UI…"
                    className="w-full rounded-md border border-[#333333] bg-[#101010] px-3 py-1.5 text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#c9a24d]"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[#2b2b2b] bg-[#181818] px-4 py-3">
              <span className="text-[10.5px] text-[#858585]">
                Deploys into <strong className="text-[#e6cfa0]">1:6 PM</strong> mode with @PM Captain
                on the left pane
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-3 py-1.5 text-[11px] text-[#a3a3a3] hover:bg-[#2a2a2a]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeployTeamCombo({
                      combo: activeCombo,
                      teamName: teamName.trim() || `${projectName} · ${activeCombo.name}`,
                      selectedRoles,
                      customDirective,
                      includeCustomAgent: addCustomMember
                        ? {
                            name: customMemberName.trim() || 'Custom Specialist',
                            role: customMemberRole.trim(),
                            model: customMemberModel.trim() || defaultModel,
                            providerId: defaultProviderId,
                          }
                        : null,
                    })
                    onClose()
                  }}
                  className="flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#d1ab59] to-[#a98336] px-4 py-1.5 text-[11px] font-semibold text-[#111111] shadow-[0_1px_8px_rgba(201,162,77,0.28)] hover:from-[#e0bc6c] hover:to-[#bc9542]"
                >
                  <Users size={13} /> Deploy Project Team ({selectedRoles.length + 1 + (addCustomMember ? 1 : 0)} Agents)
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
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
                    Role Preset (14 Team Positions)
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

              <div className="rounded-lg border border-[#2c2c2c] bg-[#181818] p-3 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-[#444444] bg-[#252525] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                      @{activePreset.code}
                    </span>
                    <span className="font-semibold text-[#e5e5e5]">{activePreset.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyRolePreset(roleId)}
                    className="flex items-center gap-1 rounded border border-[#383838] bg-[#222222] px-2 py-0.5 text-[10px] text-[#cccccc] hover:bg-[#2c2c2c] hover:text-white"
                    title="Reset Soul, Mission & Role Memory to the canonical v6 blueprint for this role"
                  >
                    <RotateCcw size={10} /> Reset to v6 Blueprint
                  </button>
                </div>
                <p className="mt-1.5 text-[#b5b5b5]">{activePreset.position}</p>
                {activePreset.defaultSkills.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="text-[#858585]">Equipped Skills:</span>
                    {activePreset.defaultSkills.map((skillSlug) => (
                      <span
                        key={skillSlug}
                        className="rounded border border-[#3a3a3a] bg-[#141414] px-1.5 py-0.5 font-mono text-[9.5px] text-[#e6cfa0]"
                      >
                        /{skillSlug}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[#8f8f8f]">
                  <span>
                    Receives from:{' '}
                    <strong className="text-[#d4d4d4]">
                      {activePreset.receivesFrom.join(', ') || 'User / @PM'}
                    </strong>
                  </span>
                  <ArrowRight size={10} className="text-[#666666]" />
                  <span>
                    Hands off to:{' '}
                    <strong className="text-[#d4d4d4]">
                      {activePreset.handsOffTo.join(', ') || 'All Specialists'}
                    </strong>
                  </span>
                </div>
              </div>

              <Field
                label="Role Summary (One-Line Responsibility)"
                value={role}
                onChange={setRole}
                placeholder="API implementation, validation, and unit tests"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
                    Provider
                  </span>
                  <select
                    value={selectedProvider?.id ?? ''}
                    onChange={(event) => handleProviderChange(event.target.value)}
                    className="w-full rounded-md border border-[#333333] bg-[#1b1b1b] px-3 py-2 text-[11px] text-[#e5e5e5] outline-none focus:border-[#737373]"
                  >
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-medium text-[#9d9d9d]">
                    Model{' '}
                    {roleId === 'custom'
                      ? '(Freeform @CUSTOM — pick or type any model)'
                      : '(Pre-configured per role)'}
                  </span>
                  {modelOptions.length > 0 && roleId !== 'custom' ? (
                    <select
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      className="w-full rounded-md border border-[#333333] bg-[#1b1b1b] px-3 py-2 font-mono text-[11px] text-[#e5e5e5] outline-none focus:border-[#737373]"
                    >
                      {modelOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      list="vincezone-custom-agent-models"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="Add or type any model ID"
                      className="w-full rounded-md border border-[#333333] bg-[#1b1b1b] px-3 py-2 font-mono text-[11px] text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
                    />
                  )}
                  <datalist id="vincezone-custom-agent-models">
                    {modelOptions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
              </div>

              <label className="block">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-[#9d9d9d]">
                  <span>Soul (Core Identity, Specialist Reasoning &amp; Judgment)</span>
                  <span className="font-mono text-[9px] text-[#737373]">
                    {soul.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={soul}
                  onChange={(event) => setSoul(event.target.value)}
                  placeholder="Detailed role soul, reasoning disciplines, and decision standards..."
                  className="w-full resize-y rounded-md border border-[#333333] bg-[#101010] px-3 py-2 font-mono text-[11px] leading-5 text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
                />
              </label>

              <label className="block">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-[#9d9d9d]">
                  <span>Mission (Primary Objectives, Execution Rules &amp; Deliverables)</span>
                  <span className="font-mono text-[9px] text-[#737373]">
                    {mission.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={mission}
                  onChange={(event) => setMission(event.target.value)}
                  placeholder="Detailed responsibilities, orchestration duties, and verification deliverables..."
                  className="w-full resize-y rounded-md border border-[#333333] bg-[#101010] px-3 py-2 font-mono text-[11px] leading-5 text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
                />
              </label>

              <label className="block">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-[#9d9d9d]">
                  <span>Role Memory (Persistent Constraints, Territory &amp; Handoff Rules)</span>
                  <span className="font-mono text-[9px] text-[#737373]">
                    {memory.length.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={memory}
                  onChange={(event) => setMemory(event.target.value)}
                  placeholder="Persistent guardrails, territory rules, and inter-agent handoff standards..."
                  className="w-full resize-y rounded-md border border-[#333333] bg-[#101010] px-3 py-2 font-mono text-[11px] leading-5 text-[#e5e5e5] outline-none placeholder:text-[#666666] focus:border-[#737373]"
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
          </>
        )}
      </section>
    </div>
  )
}
