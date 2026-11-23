'use client'

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Monitor,
  Play,
  RefreshCw,
  Smartphone,
  Square,
  Tablet,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

type ElectronWebviewElement = HTMLElement & {
  src: string
  reload: () => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  loadURL: (url: string) => Promise<void>
}

export function normalizePreviewUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'http://localhost:3000'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^:\d+/.test(trimmed)) return `http://localhost${trimmed}`
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(trimmed)) {
    return `http://${trimmed}`
  }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

function isLocalUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url)
}

export function WebPreview({
  projectName,
  rootPath,
}: {
  projectName: string
  rootPath?: string
}) {
  const [urlInput, setUrlInput] = useState('http://localhost:3000')
  const [activeUrl, setActiveUrl] = useState('http://localhost:3000')
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [reloadKey, setReloadKey] = useState(0)
  const [useWebview, setUseWebview] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [serverRunning, setServerRunning] = useState(false)
  const [serverStarting, setServerStarting] = useState(false)
  const [serverStatusText, setServerStatusText] = useState('')
  const webviewRef = useRef<ElectronWebviewElement | null>(null)
  const initialWebviewSrcRef = useRef('http://localhost:3000')

  useEffect(() => {
    void fetch('/api/runner', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { running?: boolean; url?: string; command?: string } | null) => {
        if (data?.running) {
          setServerRunning(true)
          if (data.url) setServerStatusText(data.command || data.url)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const desktop = window.vincezoneDesktop as
      | { isDesktop?: boolean; webviewSupported?: boolean }
      | undefined
    setUseWebview(Boolean(desktop?.isDesktop && desktop?.webviewSupported !== false))
  }, [])

  useEffect(() => {
    if (!useWebview) return
    const el = webviewRef.current
    if (!el) return

    const syncNav = () => {
      try {
        setCanGoBack(el.canGoBack())
        setCanGoForward(el.canGoForward())
      } catch {
        // webview not mounted yet
      }
    }

    const onStart = () => {
      setIsLoading(true)
      setLoadError('')
    }
    const onStop = () => {
      setIsLoading(false)
      syncNav()
    }
    const onNavigate = (event: Event & { url?: string }) => {
      if (event.url) {
        setUrlInput(event.url)
        setActiveUrl(event.url)
      }
      syncNav()
    }
    const onFail = (event: Event & { errorCode?: number; errorDescription?: string }) => {
      // Ignore ERR_ABORTED (-3) triggered by normal redirects/navigations
      if (event.errorCode === -3) return
      setIsLoading(false)
      setLoadError(event.errorDescription || 'Failed to load URL.')
    }

    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-navigate', onNavigate as EventListener)
    el.addEventListener('did-navigate-in-page', onNavigate as EventListener)
    el.addEventListener('did-fail-load', onFail as EventListener)

    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-navigate', onNavigate as EventListener)
      el.removeEventListener('did-navigate-in-page', onNavigate as EventListener)
      el.removeEventListener('did-fail-load', onFail as EventListener)
    }
  }, [useWebview])

  const navigate = (customTarget?: string) => {
    const normalized = normalizePreviewUrl(customTarget ?? urlInput)
    setUrlInput(normalized)
    setActiveUrl(normalized)
    setLoadError('')
    if (useWebview && webviewRef.current) {
      try {
        void webviewRef.current.loadURL(normalized)
        return
      } catch {
        // Fallback to remounting src
      }
    }
    setReloadKey((k) => k + 1)
  }

  const handleReload = () => {
    setLoadError('')
    if (useWebview && webviewRef.current) {
      try {
        webviewRef.current.reload()
        return
      } catch {
        // fallback
      }
    }
    setReloadKey((k) => k + 1)
  }

  const openExternal = () => {
    const desktop = window.vincezoneDesktop as
      | { openExternal?: (url: string) => Promise<boolean> }
      | undefined
    if (desktop?.openExternal) {
      void desktop.openExternal(activeUrl)
    } else {
      window.open(activeUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const handleToggleWebServer = async () => {
    setLoadError('')
    if (serverRunning) {
      setServerStarting(true)
      try {
        await fetch('/api/runner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop-web', cwd: rootPath }),
        })
        setServerRunning(false)
        setServerStatusText('')
      } finally {
        setServerStarting(false)
      }
      return
    }

    setServerStarting(true)
    try {
      const res = await fetch('/api/runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-web', cwd: rootPath }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        running?: boolean
        url?: string
        command?: string
        error?: string
      }
      if (!res.ok || !data.ok) {
        setLoadError(data.error || 'Failed to start web app in background.')
        return
      }
      setServerRunning(Boolean(data.running))
      setServerStatusText(data.command || 'Running')
      if (data.url) {
        navigate(data.url)
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to start web app.')
    } finally {
      setServerStarting(false)
    }
  }

  const showIframeHint = !useWebview && !isLocalUrl(activeUrl)

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#141414]">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#181818] px-3">
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-[#e5e5e5]" />
          <span className="text-[12px] font-semibold text-white">Web Project Preview</span>
          <span className="hidden rounded bg-[#262626] px-1.5 py-0.5 text-[10px] text-[#a3a3a3] sm:inline">
            {useWebview ? 'Chromium Native' : projectName}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 max-w-xl items-center gap-1">
          {useWebview && (
            <>
              <button
                onClick={() => webviewRef.current?.goBack()}
                disabled={!canGoBack}
                className="icon-button !size-7 border border-[#333333] disabled:opacity-35"
                title="Back"
              >
                <ArrowLeft size={12} />
              </button>
              <button
                onClick={() => webviewRef.current?.goForward()}
                disabled={!canGoForward}
                className="icon-button !size-7 border border-[#333333] disabled:opacity-35"
                title="Forward"
              >
                <ArrowRight size={12} />
              </button>
            </>
          )}
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-[#333333] bg-[#121212] px-2.5 py-1 focus-within:border-[#737373]">
            <Globe size={12} className="shrink-0 text-[#858585]" />
            <input
              value={urlInput}
              onChange={(event) => setUrlInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') navigate()
              }}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[#e5e5e5] outline-none"
              placeholder="http://localhost:3000 or https://youtube.com"
            />
          </label>
          <button
            onClick={handleReload}
            className="icon-button !size-7 border border-[#333333]"
            title="Reload web preview"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openExternal}
            className="icon-button !size-7 border border-[#333333]"
            title="Open in external browser"
          >
            <ExternalLink size={12} />
          </button>
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
            onClick={() => void handleToggleWebServer()}
            disabled={serverStarting}
            className={`flex h-7 items-center gap-1.5 rounded px-2.5 text-[10px] font-semibold transition disabled:opacity-50 ${
              serverRunning
                ? 'border border-[#525252] bg-[#262626] text-white hover:bg-[#333333]'
                : 'bg-[#e5e5e5] text-[#111111] hover:bg-white'
            }`}
            title={
              serverRunning
                ? `Stop background server (${serverStatusText})`
                : 'Start web project silently in background (no terminal popup)'
            }
          >
            {serverRunning ? (
              <>
                <Square size={10} fill="currentColor" /> Stop Web App
              </>
            ) : (
              <>
                <Play size={11} /> {serverStarting ? 'Starting…' : 'Start Web App'}
              </>
            )}
          </button>
        </div>
      </div>

      {showIframeHint && (
        <div className="flex items-center justify-between gap-3 border-b border-[#2b2b2b] bg-[#1d1d1d] px-4 py-1.5 text-[10px] text-[#bdbdbd]">
          <span>
            External sites like YouTube/GitHub block standard browser iframes. Open VinceZone
            Desktop app (native Chromium webview) or open externally.
          </span>
          <button
            onClick={openExternal}
            className="shrink-0 rounded border border-[#444444] bg-[#262626] px-2 py-0.5 text-white hover:bg-[#333333]"
          >
            Open External
          </button>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between border-b border-[#4a2626] bg-[#241414] px-4 py-1.5 text-[10px] text-[#f48771]">
          <span>Load error: {loadError}</span>
          <button
            onClick={handleReload}
            className="rounded border border-[#5a3030] px-2 py-0.5 text-[#f48771] hover:bg-[#331a1a]"
          >
            Retry
          </button>
        </div>
      )}

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
            <span className="uppercase">
              {useWebview ? `CHROMIUM · ${viewport}` : viewport}
            </span>
          </div>
          {useWebview ? (
            React.createElement('webview', {
              ref: webviewRef,
              src: initialWebviewSrcRef.current,
              partition: 'persist:vincezone-browser',
              allowpopups: 'true',
              style: { width: '100%', height: '100%', flex: '1 1 0%', backgroundColor: '#ffffff' },
            })
          ) : (
            <iframe
              key={`${activeUrl}-${reloadKey}`}
              src={activeUrl}
              title="VinceZone Web Project Preview"
              className="min-h-0 flex-1 w-full bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            />
          )}
        </div>
      </div>
    </section>
  )
}
