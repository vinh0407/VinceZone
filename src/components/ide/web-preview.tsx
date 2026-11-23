'use client'

import {
  ExternalLink,
  Globe,
  Monitor,
  Play,
  RefreshCw,
  Smartphone,
  Tablet,
} from 'lucide-react'
import { useState } from 'react'

export function WebPreview({
  projectName,
  onRunCommand,
}: {
  projectName: string
  onRunCommand: (command: string) => void
}) {
  const [urlInput, setUrlInput] = useState('http://localhost:3000')
  const [activeUrl, setActiveUrl] = useState('http://localhost:3000')
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [reloadKey, setReloadKey] = useState(0)

  const navigate = () => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
    setUrlInput(normalized)
    setActiveUrl(normalized)
    setReloadKey((k) => k + 1)
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#141414]">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#181818] px-3">
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-[#e5e5e5]" />
          <span className="text-[12px] font-semibold text-white">Web Project Preview</span>
          <span className="hidden rounded bg-[#262626] px-1.5 py-0.5 text-[10px] text-[#a3a3a3] sm:inline">
            {projectName}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 max-w-xl items-center gap-1.5">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-[#333333] bg-[#121212] px-2.5 py-1 focus-within:border-[#737373]">
            <Globe size={12} className="shrink-0 text-[#858585]" />
            <input
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigate()
              }}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[#e5e5e5] outline-none"
              placeholder="http://localhost:3000"
            />
          </label>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="icon-button !size-7 border border-[#333333]"
            title="Reload web preview"
          >
            <RefreshCw size={12} />
          </button>
          <a
            href={activeUrl}
            target="_blank"
            rel="noreferrer"
            className="icon-button !size-7 border border-[#333333]"
            title="Open in external browser"
          >
            <ExternalLink size={12} />
          </a>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded border border-[#333333] bg-[#121212] p-0.5">
            {(
              [
                { id: 'desktop', icon: Monitor, label: 'Desktop' },
                { id: 'tablet', icon: Tablet, label: 'Tablet' },
                { id: 'mobile', icon: Smartphone, label: 'Mobile' },
              ] as const
            ).map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setViewport(item.id)}
                  title={item.label}
                  className={`rounded p-1 ${
                    viewport === item.id ? 'bg-[#2e2e2e] text-white' : 'text-[#858585] hover:text-white'
                  }`}
                >
                  <Icon size={12} />
                </button>
              )
            })}
          </div>
          <button
            onClick={() => onRunCommand('pnpm dev')}
            className="flex h-7 items-center gap-1.5 rounded bg-[#e5e5e5] px-2.5 text-[10px] font-semibold text-[#111111] hover:bg-white"
            title="Start web project dev server in Terminal"
          >
            <Play size={11} /> Start Web App
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#0e0e0e] p-4">
        <div
          className={`flex h-full flex-col overflow-hidden rounded-lg border border-[#2f2f2f] bg-white shadow-2xl transition-all ${
            viewport === 'desktop'
              ? 'w-full'
              : viewport === 'tablet'
                ? 'w-[768px] max-w-full'
                : 'w-[390px] max-w-full'
          }`}
        >
          <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-3 text-[10px] text-[#9a9a9a]">
            <span className="truncate font-mono">{activeUrl}</span>
            <span className="uppercase">{viewport}</span>
          </div>
          <iframe
            key={`${activeUrl}-${reloadKey}`}
            src={activeUrl}
            title="VinceZone Web Project Preview"
            className="min-h-0 flex-1 w-full bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        </div>
      </div>
    </section>
  )
}
