'use client'

import { Check, Loader2, ShieldAlert, Terminal, X } from 'lucide-react'
import type { CommandApprovalItem } from './agent-types'

export function CommandApprovalList({
  items,
  large = false,
  onApprove,
  onReject,
}: {
  items: CommandApprovalItem[]
  large?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) {
  if (!items.length) return null

  return (
    <div className={large ? 'space-y-3' : 'space-y-2'}>
      {items.map((item) => {
        const isPending = item.status === 'pending'
        const isRunning = item.status === 'running'
        const isHigh = item.riskLevel === 'high'

        return (
          <div
            key={item.id}
            className={`rounded-lg border bg-[#191919] ${
              isPending
                ? isHigh
                  ? 'border-[#7a3c3c]'
                  : 'border-[#4a4a4a]'
                : 'border-[#2c2c2c]'
            } ${large ? 'p-4' : 'p-2.5'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className={`flex items-center gap-1.5 font-semibold text-white ${
                  large ? 'text-[13px]' : 'text-[10.5px]'
                }`}
              >
                <ShieldAlert
                  size={large ? 15 : 12}
                  className={isHigh ? 'text-[#f48771]' : 'text-[#dcdcaa]'}
                />
                <span>Command Approval · {item.agentName}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono uppercase ${
                    large ? 'text-[10px]' : 'text-[8.5px]'
                  } ${
                    isHigh
                      ? 'bg-[#3d1f1f] text-[#f48771]'
                      : 'bg-[#2a2a2a] text-[#d4d4d4]'
                  }`}
                >
                  {item.riskLevel}
                </span>
              </div>
              <span
                className={`font-mono uppercase ${large ? 'text-[10.5px]' : 'text-[9px]'} ${
                  item.status === 'approved'
                    ? 'text-[#89d185]'
                    : item.status === 'rejected' || item.status === 'failed'
                      ? 'text-[#f48771]'
                      : 'text-[#a3a3a3]'
                }`}
              >
                {item.status}
              </span>
            </div>

            <div
              className={`mt-2 flex items-center gap-2 rounded border border-[#2b2b2b] bg-[#101010] font-mono text-[#f5f5f5] ${
                large ? 'px-3 py-2 text-[13px]' : 'px-2 py-1.5 text-[10.5px]'
              }`}
            >
              <Terminal size={large ? 14 : 11} className="shrink-0 text-[#858585]" />
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre">{item.command}</code>
            </div>

            {item.reason && (
              <p
                className={`mt-1.5 text-[#9a9a9a] ${
                  large ? 'text-[12.5px] leading-5' : 'text-[10px] leading-4'
                }`}
              >
                {item.reason}
              </p>
            )}

            {isPending && (
              <div className={`mt-2.5 flex items-center gap-2 ${large ? '' : ''}`}>
                <button
                  type="button"
                  onClick={() => onApprove?.(item.id)}
                  className={`flex items-center gap-1.5 rounded bg-[#e5e5e5] font-semibold text-[#111111] transition hover:bg-white ${
                    large ? 'px-3.5 py-1.5 text-[12.5px]' : 'px-2.5 py-1 text-[10px]'
                  }`}
                >
                  <Check size={large ? 14 : 11} /> Allow &amp; Run
                </button>
                <button
                  type="button"
                  onClick={() => onReject?.(item.id)}
                  className={`flex items-center gap-1 rounded border border-[#3a3a3a] bg-[#222222] text-[#cccccc] transition hover:bg-[#2d2d2d] hover:text-white ${
                    large ? 'px-3 py-1.5 text-[12.5px]' : 'px-2.5 py-1 text-[10px]'
                  }`}
                >
                  <X size={large ? 14 : 11} /> Deny
                </button>
              </div>
            )}

            {isRunning && (
              <div
                className={`mt-2 flex items-center gap-1.5 text-[#d4d4d4] ${
                  large ? 'text-[12.5px]' : 'text-[10px]'
                }`}
              >
                <Loader2 size={large ? 14 : 11} className="animate-spin" />
                Running command in workspace…
              </div>
            )}

            {item.output && (
              <pre
                className={`mt-2 max-h-40 overflow-auto rounded border border-[#282828] bg-[#0e0e0e] font-mono text-[#cccccc] ${
                  large ? 'p-2.5 text-[12px] leading-5' : 'p-2 text-[9.5px] leading-4'
                }`}
              >
                {item.output}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
