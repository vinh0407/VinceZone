'use client'

import { Check, GitCompareArrows, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { computeLineDiff, hashText } from '@/lib/file-tree'
import type { ProposedPatch, WorkspaceFile } from '../agent-types'

export function DiffReviewModal({
  patches,
  files,
  initialPatchId,
  onApply,
  onReject,
  onRollback,
  onClose,
}: {
  patches: ProposedPatch[]
  files: WorkspaceFile[]
  initialPatchId?: string
  onApply: (patchId: string) => void
  onReject: (patchId: string) => void
  onRollback: (patchId: string) => void
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState(
    initialPatchId ||
      patches.find((patch) => patch.status === 'pending')?.id ||
      patches[0]?.id ||
      '',
  )

  useEffect(() => {
    if (initialPatchId && patches.some((patch) => patch.id === initialPatchId)) {
      setSelectedId(initialPatchId)
    } else if (!patches.some((patch) => patch.id === selectedId)) {
      setSelectedId(patches[0]?.id ?? '')
    }
  }, [initialPatchId, patches, selectedId])

  const selected = patches.find((patch) => patch.id === selectedId) ?? patches[0]
  const currentFile = selected ? files.find((file) => file.path === selected.path) : undefined
  const currentContent = currentFile?.content ?? ''
  const isStaleBase = Boolean(
    selected && selected.status === 'pending' && hashText(currentContent) !== selected.baseHash,
  )

  const diffLines = useMemo(() => {
    if (!selected) return []
    const before =
      selected.status === 'applied'
        ? selected.originalContent
        : (currentFile?.content ?? selected.originalContent)
    return computeLineDiff(before, selected.proposedContent)
  }, [selected, currentFile])

  const addedCount = diffLines.filter((line) => line.type === 'added').length
  const removedCount = diffLines.filter((line) => line.type === 'removed').length

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <section className="flex h-[78vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0c] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <GitCompareArrows size={15} className="text-sky-400" />
              <h2 className="text-sm font-semibold text-zinc-100">
                Change Review {selected ? `· ${selected.taskId}` : ''}
              </h2>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-zinc-400">
                {patches.length} change set{patches.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              {selected
                ? `${selected.path} · proposed by ${selected.agentName} · ${selected.summary}`
                : 'No proposed patches from agents yet.'}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close diff review">
            <X size={15} />
          </button>
        </div>

        {patches.length === 0 ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="max-w-sm">
              <GitCompareArrows size={24} className="mx-auto text-zinc-700" />
              <p className="mt-3 text-xs font-medium text-zinc-300">No proposed file patches yet</p>
              <p className="mt-1.5 text-[11px] leading-5 text-zinc-600">
                When worker agents propose file edits during an orchestrated run, their structured
                diffs appear here for conflict-checked approval before touching workspace files.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="w-60 shrink-0 overflow-y-auto border-r border-white/[0.07] bg-[#0a0a0a] p-2">
              <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Proposed Patches
              </p>
              <div className="mt-1 space-y-1">
                {patches.map((patch) => (
                  <button
                    key={patch.id}
                    onClick={() => setSelectedId(patch.id)}
                    className={`block w-full rounded-md border px-2.5 py-2 text-left transition ${
                      selected?.id === patch.id
                        ? 'border-sky-400/30 bg-sky-400/[0.08]'
                        : 'border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate font-mono text-[10px] text-zinc-200">
                        {patch.path.split('/').pop()}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] uppercase ${
                          patch.status === 'applied'
                            ? 'bg-lime-400/15 text-lime-300'
                            : patch.status === 'rejected'
                              ? 'bg-red-400/15 text-red-300'
                              : 'bg-amber-400/15 text-amber-300'
                        }`}
                      >
                        {patch.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[9px] text-zinc-500">{patch.path}</p>
                    <p className="mt-0.5 truncate text-[9px] text-zinc-600">
                      {patch.agentName} · {patch.taskId}
                    </p>
                  </button>
                ))}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              {selected && (isStaleBase || selected.conflictWith || selected.territoryViolation) && (
                <div className="flex flex-col gap-1 border-b border-[#f48771]/30 bg-[#2d1410] px-4 py-2 text-[11px] text-[#ffbeb3]">
                  {selected.territoryViolation && (
                    <div className="flex items-center gap-2">
                      <TriangleAlert size={13} className="shrink-0 text-[#f48771]" />
                      <span>{selected.territoryViolation}</span>
                    </div>
                  )}
                  {(isStaleBase || selected.conflictWith) && (
                    <div className="flex items-center gap-2 text-amber-200">
                      <TriangleAlert size={13} className="shrink-0 text-amber-400" />
                      <span>
                        {selected.conflictWith
                          ? `Overlapping ownership detected with ${selected.conflictWith}. `
                          : ''}
                        {isStaleBase
                          ? 'Workspace file changed after this patch was generated (stale base revision). Review carefully before applying.'
                          : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0e0e0e] px-4 py-1.5 text-[10px] text-zinc-500">
                <span className="font-mono">{selected?.path}</span>
                <span className="font-mono">
                  <span className="text-emerald-400">+{addedCount}</span>{' '}
                  <span className="text-red-400">-{removedCount}</span>
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-5">
                {diffLines.map((line, index) => (
                  <div
                    key={index}
                    className={`grid grid-cols-[44px_44px_20px_1fr] px-2 ${
                      line.type === 'added'
                        ? 'bg-emerald-500/[0.12] text-emerald-200'
                        : line.type === 'removed'
                          ? 'bg-red-500/[0.12] text-red-200'
                          : 'text-zinc-400'
                    }`}
                  >
                    <span className="select-none pr-2 text-right text-[10px] text-zinc-600">
                      {line.leftNumber ?? ''}
                    </span>
                    <span className="select-none pr-2 text-right text-[10px] text-zinc-600">
                      {line.rightNumber ?? ''}
                    </span>
                    <span className="select-none text-center">
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </span>
                    <span className="whitespace-pre">{line.text}</span>
                  </div>
                ))}
              </div>

              {selected && (
                <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-3">
                  <span className="text-[10px] text-zinc-500">
                    {selected.status === 'applied'
                      ? 'Applied to workspace snapshot. Rollback restores the prior content.'
                      : selected.status === 'rejected'
                        ? 'Rejected. Workspace file was left untouched.'
                        : isStaleBase
                          ? 'Base revision changed — review diff before applying.'
                          : 'Base revision matches current workspace snapshot.'}
                  </span>
                  <div className="flex gap-2">
                    {selected.status === 'applied' ? (
                      <button
                        onClick={() => onRollback(selected.id)}
                        className="flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] text-amber-200 hover:bg-amber-400/15"
                      >
                        <RotateCcw size={12} /> Rollback patch
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onReject(selected.id)}
                          disabled={selected.status === 'rejected'}
                          className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-white/[0.04] disabled:opacity-30"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => onApply(selected.id)}
                          className="flex items-center gap-1.5 rounded-md bg-[#e5e5e5] px-3 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white"
                        >
                          <Check size={12} /> Accept &amp; Apply
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
