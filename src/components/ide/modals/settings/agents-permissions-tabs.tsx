'use client'

import { Check } from 'lucide-react'
import type { AppSettings } from '@/components/ide/agent-types'

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-[10px] text-[#858585]">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-[#2c2c2c] bg-[#181818] p-3 text-left hover:bg-[#1e1e1e]"
    >
      <span>
        <span className="block text-[11px] font-medium text-[#e5e5e5]">{label}</span>
        <span className="mt-1 block text-[10px] leading-4 text-[#858585]">{description}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-[#e5e5e5]' : 'bg-[#333333]'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full shadow transition ${checked ? 'left-[18px] bg-[#111111]' : 'left-0.5 bg-[#9d9d9d]'}`}
        />
      </span>
    </button>
  )
}

export function AgentsDelegationTab({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (next: AppSettings) => void
}) {
  return (
    <SettingsSection
      title="Multi-Agent Delegation & Unlimited Grid"
      description="Control coordinator depth, concurrency, and approval checkpoints (no hard 7-agent panel limit)."
    >
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: 'maxDepth' as const, label: 'Maximum Delegation Depth', values: [0, 1, 2, 3, 4, 6] },
          { key: 'maxActiveAgents' as const, label: 'Maximum Active Agents', values: [2, 4, 6, 8, 12, 16, 24] },
          { key: 'maxConcurrentTasks' as const, label: 'Concurrent Tasks', values: [1, 2, 3, 4, 6, 8, 12] },
          { key: 'maxIterations' as const, label: 'Delegation Iterations', values: [1, 2, 3, 4, 5, 6, 10] },
        ].map((field) => (
          <label
            key={field.key}
            className="block rounded-lg border border-[#2c2c2c] bg-[#181818] p-3"
          >
            <span className="text-[10px] font-medium text-[#d4d4d4]">{field.label}</span>
            <select
              value={settings.delegation[field.key]}
              onChange={(event) =>
                onChange({
                  ...settings,
                  delegation: {
                    ...settings.delegation,
                    [field.key]: Number(event.target.value),
                  },
                })
              }
              className="mt-2 w-full rounded-md border border-[#333333] bg-[#121212] px-2 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
            >
              {field.values.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <label className="block rounded-lg border border-[#2c2c2c] bg-[#181818] p-3">
        <span className="text-[10px] font-medium text-[#d4d4d4]">Task Assignment Mode</span>
        <select
          value={settings.delegation.assignmentMode}
          onChange={(event) =>
            onChange({
              ...settings,
              delegation: {
                ...settings.delegation,
                assignmentMode: event.target.value as 'automatic' | 'manual',
              },
            })
          }
          className="mt-2 w-full rounded-md border border-[#333333] bg-[#121212] px-2 py-1.5 text-[11px] text-[#e5e5e5] outline-none"
        >
          <option value="automatic">Automatic runtime assignment</option>
          <option value="manual">Plan first, approve before executing</option>
        </select>
      </label>

      <SettingsToggle
        label="Require approval before worker execution"
        description="Commander plans the task graph and pauses for interactive review before dispatching workers."
        checked={settings.delegation.requireApproval}
        onChange={(requireApproval) =>
          onChange({
            ...settings,
            delegation: { ...settings.delegation, requireApproval },
          })
        }
      />
      <SettingsToggle
        label="Auto-apply for trusted agents"
        description="Still blocked when Exclusive Territories overlap or a file revision is stale."
        checked={settings.autoApplyTrusted}
        onChange={(autoApplyTrusted) => onChange({ ...settings, autoApplyTrusted })}
      />
    </SettingsSection>
  )
}

export function PermissionsTab({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (next: AppSettings) => void
}) {
  return (
    <SettingsSection
      title="Tool Permissions & Territory Guards"
      description="Destructive commands and cross-territory edits stay approval-gated by default."
    >
      <SettingsToggle
        label="Confirm dangerous tools"
        description="Require explicit review before deletes, destructive shell commands, or sensitive edits."
        checked={settings.confirmDangerousTools}
        onChange={(confirmDangerousTools) => onChange({ ...settings, confirmDangerousTools })}
      />
      <SettingsToggle
        label="Allow integrated terminal commands"
        description="Permit local loopback shell execution inside the active workspace directory."
        checked={settings.allowTerminal}
        onChange={(allowTerminal) => onChange({ ...settings, allowTerminal })}
      />
      <div className="grid grid-cols-2 gap-2">
        {[
          'Exclusive Territory Guard',
          'FE↔BE API Contract Gate',
          'DNS-Verified SSRF Shield',
          'Loopback-Only FS & ADB API',
          'REV-xxx Edit Memory Rollback',
          'Memory-Only Provider API Keys',
        ].map((tool) => (
          <div
            key={tool}
            className="flex items-center gap-2 rounded-md border border-[#2c2c2c] bg-[#181818] px-3 py-2 text-[10px] text-[#cccccc]"
          >
            <Check size={11} className="text-white" />
            {tool}
          </div>
        ))}
      </div>
    </SettingsSection>
  )
}
