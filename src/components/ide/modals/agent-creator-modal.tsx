'use client'

import { MessageSquare, TerminalSquare, X } from 'lucide-react'
import { useState } from 'react'
import type { AgentView } from '../agent-types'
import { Field } from './provider-settings-modal'

export function AgentCreatorModal({
  defaultModel,
  onClose,
  onCreate,
}: {
  defaultModel: string
  onClose: () => void
  onCreate: (details: { name: string; role: string; model: string; view: AgentView }) => void
}) {
  const [details, setDetails] = useState({
    name: '',
    role: 'Coding agent',
    model: defaultModel,
    view: 'chat' as AgentView,
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">New agent</h2>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Create an independent session in the shared workspace.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <Field
            label="Agent name"
            value={details.name}
            onChange={(name) => setDetails({ ...details, name })}
            placeholder="Backend Agent"
          />
          <Field
            label="Role and instructions"
            value={details.role}
            onChange={(role) => setDetails({ ...details, role })}
            placeholder="API implementation and tests"
          />
          <Field
            label="Model"
            value={details.model}
            onChange={(model) => setDetails({ ...details, model })}
          />
          <div>
            <span className="mb-1.5 block text-[10px] font-medium text-zinc-500">Default view</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
                { id: 'terminal' as const, label: 'Terminal', icon: TerminalSquare },
              ].map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    onClick={() => setDetails({ ...details, view: option.id })}
                    className={`flex items-center justify-center gap-2 rounded-md border py-2 text-[10px] ${
                      details.view === option.id
                        ? 'border-lime-400/40 bg-lime-400/10 text-lime-300'
                        : 'border-white/[0.08] text-zinc-600 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Icon size={13} /> {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/[0.07] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[11px] text-zinc-500 hover:bg-white/[0.05]"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onCreate({
                ...details,
                name: details.name.trim() || 'New agent',
              })
            }
            className="rounded-md bg-lime-400 px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-lime-300"
          >
            Create agent
          </button>
        </div>
      </section>
    </div>
  )
}
