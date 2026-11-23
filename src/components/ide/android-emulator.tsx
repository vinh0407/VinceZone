'use client'

import {
  ChevronLeft,
  Globe,
  Home,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Smartphone,
  Square,
  SquareStack,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceFile } from './agent-types'

type AndroidStatus = {
  sdkAvailable: boolean
  emulatorAvailable: boolean
  adbAvailable: boolean
  avds: string[]
  devices: Array<{ serial: string; status: string; details: string }>
  bootingSerial?: string | null
  bootCompleted?: boolean
  emulatorProcessAlive?: boolean
  screenSize?: { width: number; height: number }
}

export function AndroidEmulator({
  projectName,
  rootPath,
  files = [],
  activeFile,
  compact = false,
  width,
  onClose,
}: {
  projectName: string
  rootPath?: string
  files?: WorkspaceFile[]
  activeFile?: WorkspaceFile
  compact?: boolean
  width?: number
  onClose?: () => void
}) {
  const [phoneMode, setPhoneMode] = useState<'android' | 'app'>('android')
  const [status, setStatus] = useState<AndroidStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(false)
  const [gradleRunning, setGradleRunning] = useState(false)
  const [gradleOutput, setGradleOutput] = useState('')
  const [selectedAvd, setSelectedAvd] = useState('')
  const [selectedSerial, setSelectedSerial] = useState('')
  const [landscape, setLandscape] = useState(false)
  const [screenUrl, setScreenUrl] = useState<string | null>(null)
  const [autoStream, setAutoStream] = useState(false)
  const [notice, setNotice] = useState('')

  // Live App Preview state (runs directly inside the phone screen!)
  const [appUrl, setAppUrl] = useState('')
  const [appRunning, setAppRunning] = useState(false)
  const [appStarting, setAppStarting] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  const htmlFile = useMemo(
    () =>
      activeFile?.language === 'html'
        ? activeFile
        : files.find((f) => f.path.toLowerCase().endsWith('.html')),
    [activeFile, files],
  )

  const flashNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }, [])

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/android', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as AndroidStatus
      setStatus(data)
      if (data.avds.length > 0) {
        setSelectedAvd((prev) => (data.avds.includes(prev) ? prev : data.avds[0]))
      }
      const online = data.devices.find((d) => d.status === 'device')
      if (online) {
        setSelectedSerial(online.serial)
        setBooting(!data.bootCompleted)
        setAutoStream(true)
      } else {
        setSelectedSerial('')
        if (data.bootingSerial || data.emulatorProcessAlive) {
          setBooting(true)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const captureScreen = useCallback(async () => {
    if (!selectedSerial) return
    try {
      const url = `/api/android?action=screenshot&serial=${encodeURIComponent(selectedSerial)}&t=${Date.now()}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return
      const blob = await res.blob()
      if (blob.size < 64) return
      const objectUrl = URL.createObjectURL(blob)
      setScreenUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return objectUrl
      })
    } catch {
      // Ignore transient capture failure while device boots
    }
  }, [selectedSerial])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // Poll rapidly while AVD is booting headless so screen streams immediately once ready
  useEffect(() => {
    if (!booting) return
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, 1800)
    const timeout = window.setTimeout(() => setBooting(false), 65_000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(timeout)
    }
  }, [booting, refreshStatus])

  // Auto-stream live Android screen directly inside the phone bezel
  useEffect(() => {
    if (phoneMode !== 'android' || !autoStream || !selectedSerial) return
    void captureScreen()
    const timer = window.setInterval(() => void captureScreen(), 550)
    return () => window.clearInterval(timer)
  }, [autoStream, captureScreen, phoneMode, selectedSerial])

  const sendAction = async (payload: Record<string, unknown>, successText: string) => {
    try {
      const res = await fetch('/api/android', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        launchedAvd?: string
        alreadyRunning?: boolean
      }
      if (!res.ok) {
        flashNotice(data.error || 'Android action failed')
        setBooting(false)
        return false
      }
      flashNotice(
        data.launchedAvd
          ? data.alreadyRunning
            ? `Connecting to ${data.launchedAvd}…`
            : `Booting ${data.launchedAvd} inside phone screen…`
          : successText,
      )
      if (payload.action === 'launch') {
        setBooting(true)
        setAutoStream(true)
      }
      if (payload.action === 'stop') {
        setAutoStream(false)
        setBooting(false)
        setScreenUrl(null)
        setSelectedSerial('')
      }
      window.setTimeout(() => void refreshStatus(), 1200)
      return true
    } catch {
      flashNotice('Android runtime request failed')
      setBooting(false)
      return false
    }
  }

  const handleLaunchAndroidOnScreen = () => {
    setPhoneMode('android')
    const avd = selectedAvd || status?.avds[0]
    if (!avd) {
      flashNotice('No AVD found — switching to Live App Phone Preview')
      setPhoneMode('app')
      void startAppOnPhone()
      return
    }
    setBooting(true)
    void sendAction(
      { action: 'launch', avd, headless: true },
      `Booting ${avd} directly on phone screen…`,
    )
  }

  const startAppOnPhone = async () => {
    setPhoneMode('app')
    setAppStarting(true)
    try {
      if (htmlFile && !rootPath) {
        setAppRunning(true)
        setIframeKey((k) => k + 1)
        flashNotice(`Running ${htmlFile.name} on phone`)
        return
      }
      const res = await fetch('/api/runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-web', cwd: rootPath }),
      })
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string }
      if (data.ok && data.url) {
        setAppUrl(data.url)
        setAppRunning(true)
        setIframeKey((k) => k + 1)
        flashNotice(`Running ${data.url} on phone`)
      } else if (htmlFile) {
        setAppRunning(true)
        setIframeKey((k) => k + 1)
        flashNotice(`Previewing ${htmlFile.name}`)
      } else {
        flashNotice(data.error || 'Could not start web app server')
      }
    } finally {
      setAppStarting(false)
    }
  }

  const mapPointerToDevice = (
    event: React.PointerEvent<HTMLImageElement>,
  ): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    const normX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const normY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    const devW = status?.screenSize?.width || 720
    const devH = status?.screenSize?.height || 1280
    return {
      x: Math.round(normX * (landscape ? devH : devW)),
      y: Math.round(normY * (landscape ? devW : devH)),
    }
  }

  const handleScreenPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!selectedSerial) return
    pointerStartRef.current = mapPointerToDevice(event)
  }

  const handleScreenPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!selectedSerial || !pointerStartRef.current) return
    const start = pointerStartRef.current
    pointerStartRef.current = null
    const end = mapPointerToDevice(event)
    const dist = Math.hypot(end.x - start.x, end.y - start.y)

    if (dist > 28) {
      void sendAction(
        {
          action: 'swipe',
          serial: selectedSerial,
          x: start.x,
          y: start.y,
          x2: end.x,
          y2: end.y,
        },
        'Swipe sent',
      )
    } else {
      void sendAction({ action: 'tap', serial: selectedSerial, x: end.x, y: end.y }, 'Tap sent')
    }
    window.setTimeout(() => void captureScreen(), 280)
  }

  const phoneWidthClass = compact
    ? landscape
      ? 'h-[210px] w-[320px]'
      : 'h-[470px] w-[240px]'
    : landscape
      ? 'h-[290px] w-[580px]'
      : 'h-[580px] w-[290px]'

  const phoneScreenContent = (
    <div className="flex flex-col items-center">
      <div className="rounded-[34px] border-[6px] border-[#2c2c2c] bg-black p-1 shadow-2xl shadow-black transition-all">
        <div
          className={`relative overflow-hidden rounded-[26px] bg-[#111111] transition-all ${phoneWidthClass}`}
        >
          {phoneMode === 'app' ? (
            appUrl ? (
              <iframe
                key={iframeKey}
                src={appUrl}
                title="Live Phone App Preview"
                className="h-full w-full border-0 bg-white"
              />
            ) : htmlFile ? (
              <iframe
                key={iframeKey}
                srcDoc={htmlFile.content}
                title="Live HTML Mobile Preview"
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] px-5 text-center">
                <Globe size={28} className="text-[#a3a3a3]" />
                <p className="mt-3 text-[12px] font-semibold text-white">Live Phone Preview</p>
                <p className="mt-1.5 text-[10px] leading-4 text-[#9a9a9a]">
                  Run your current web/mobile project directly inside this phone screen.
                </p>
                <button
                  type="button"
                  disabled={appStarting}
                  onClick={() => void startAppOnPhone()}
                  className="mt-4 flex items-center gap-1.5 rounded-full bg-[#e5e5e5] px-4 py-1.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
                >
                  <Play size={10} /> {appStarting ? 'Starting…' : 'Run App on Phone'}
                </button>
              </div>
            )
          ) : screenUrl ? (
            <img
              src={screenUrl}
              alt="Live Android Device Screen"
              draggable={false}
              onPointerDown={handleScreenPointerDown}
              onPointerUp={handleScreenPointerUp}
              className="h-full w-full cursor-pointer select-none bg-black object-contain"
              title="Click to tap or drag to swipe directly on Android"
            />
          ) : (
            <>
              <div className="absolute left-1/2 top-2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-black" />
              <div className="flex h-7 items-center justify-between bg-black/40 px-3.5 text-[8px] text-white/70">
                <span>{selectedAvd || 'Android'}</span>
                <span>{booting ? 'Booting…' : selectedSerial ? 'Online' : 'Standby'}</span>
              </div>
              <div className="flex h-[calc(100%-28px)] flex-col items-center justify-center bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] px-5 text-center">
                <img
                  src="/logo.png"
                  alt="VinceZone"
                  className={`size-14 rounded-2xl border border-[#333333] object-cover shadow-lg ${
                    booting ? 'animate-pulse' : ''
                  }`}
                />
                <h3 className="mt-4 text-[13px] font-semibold text-white">
                  {booting ? `Booting ${selectedAvd || 'Android'}…` : 'Android Phone'}
                </h3>
                <p className="mt-1.5 text-[10px] leading-4 text-[#9a9a9a]">
                  {booting
                    ? status?.bootingSerial
                      ? `${status.bootingSerial} detected — booting Android OS silently in background (no terminal popup)…`
                      : 'Starting Android silently inside this phone screen (takes ~15-20s on first boot)…'
                    : selectedSerial
                      ? `Connected to ${selectedSerial}. Streaming live screen…`
                      : status?.avds.length
                        ? `Ready: ${selectedAvd || status.avds[0]} (Android SDK). Press Run to boot directly inside this screen.`
                        : `No Android AVD found for ${projectName}. Switch to Live App to preview directly on this phone.`}
                </p>
                {booting ? (
                  <div className="mt-4 h-1 w-32 overflow-hidden rounded-full bg-[#2a2a2a]">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-[#e5e5e5]" />
                  </div>
                ) : selectedSerial ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAutoStream(true)
                      void captureScreen()
                    }}
                    className="mt-4 rounded-full bg-[#e5e5e5] px-4 py-1.5 text-[10px] font-semibold text-[#111111] hover:bg-white"
                  >
                    Connect Screen
                  </button>
                ) : (
                  <div className="mt-4 flex flex-col gap-2">
                    {status?.avds.length ? (
                      <button
                        type="button"
                        onClick={handleLaunchAndroidOnScreen}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-[#e5e5e5] px-4 py-1.5 text-[10px] font-semibold text-[#111111] hover:bg-white"
                      >
                        <Play size={10} /> Run {selectedAvd || status.avds[0]}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void startAppOnPhone()}
                      className="rounded-full border border-[#404040] bg-[#222222] px-4 py-1.5 text-[10px] text-[#e5e5e5] hover:bg-[#333333]"
                    >
                      Run Web/App Preview
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hardware Navigation Bar directly under the Phone Bezel */}
      <div className="mt-2.5 flex items-center gap-1.5 rounded-full border border-[#2b2b2b] bg-[#181818] px-2.5 py-1">
        {phoneMode === 'android' ? (
          <>
            <button
              type="button"
              disabled={!selectedSerial}
              onClick={() =>
                void sendAction(
                  { action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_BACK' },
                  'Back',
                )
              }
              className="mini-button disabled:opacity-30"
              title="Android Back"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              disabled={!selectedSerial}
              onClick={() =>
                void sendAction(
                  { action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_HOME' },
                  'Home',
                )
              }
              className="mini-button disabled:opacity-30"
              title="Android Home"
            >
              <Home size={11} />
            </button>
            <button
              type="button"
              disabled={!selectedSerial}
              onClick={() =>
                void sendAction(
                  { action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_APP_SWITCH' },
                  'Recents',
                )
              }
              className="mini-button disabled:opacity-30"
              title="Android Recents"
            >
              <SquareStack size={11} />
            </button>
            <div className="mx-0.5 h-3 w-px bg-[#2f2f2f]" />
            <button
              type="button"
              onClick={() => setLandscape((prev) => !prev)}
              className="mini-button"
              title="Rotate phone"
            >
              <RotateCw size={11} />
            </button>
            <button
              type="button"
              disabled={!selectedSerial}
              onClick={() =>
                void sendAction(
                  { action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_POWER' },
                  'Power',
                )
              }
              className="mini-button disabled:opacity-30"
              title="Power"
            >
              <Power size={11} />
            </button>
            <button
              type="button"
              disabled={!selectedSerial}
              onClick={() =>
                void sendAction({ action: 'stop', serial: selectedSerial }, 'Stopped emulator')
              }
              className="mini-button text-[#f48771] disabled:opacity-30"
              title="Stop Android Emulator"
            >
              <Square size={10} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              className="mini-button"
              title="Reload app preview"
            >
              <RefreshCw size={11} />
            </button>
            <button
              type="button"
              onClick={() => setLandscape((prev) => !prev)}
              className="mini-button"
              title="Rotate phone"
            >
              <RotateCw size={11} />
            </button>
            <button
              type="button"
              disabled={!appRunning}
              onClick={async () => {
                await fetch('/api/runner', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'stop-web' }),
                })
                setAppRunning(false)
                setAppUrl('')
                flashNotice('Stopped preview server')
              }}
              className="mini-button text-[#f48771] disabled:opacity-30"
              title="Stop app server"
            >
              <Square size={10} />
            </button>
          </>
        )}
      </div>
    </div>
  )

  if (compact) {
    return (
      <aside
        style={width ? { width } : undefined}
        className="flex shrink-0 flex-col border-l border-[#2b2b2b] bg-[#141414]"
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-3">
          <div className="flex items-center gap-1.5">
            <Smartphone size={13} className="text-[#e5e5e5]" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#cccccc]">
              Phone Demo
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="mini-button"
              title="Refresh ADB & AVDs"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
            {onClose && (
              <button type="button" onClick={onClose} className="mini-button" title="Close Phone Panel">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Mode Switcher + Quick Run Bar */}
        <div className="space-y-1.5 border-b border-[#2b2b2b] bg-[#161616] p-2">
          <div className="grid grid-cols-2 gap-1 rounded bg-[#101010] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setPhoneMode('android')}
              className={`rounded py-1 font-medium transition ${
                phoneMode === 'android'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#858585] hover:text-[#cccccc]'
              }`}
            >
              Android AVD
            </button>
            <button
              type="button"
              onClick={() => setPhoneMode('app')}
              className={`rounded py-1 font-medium transition ${
                phoneMode === 'app'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#858585] hover:text-[#cccccc]'
              }`}
            >
              Live App
            </button>
          </div>

          {phoneMode === 'android' ? (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedAvd}
                onChange={(e) => setSelectedAvd(e.target.value)}
                className="min-w-0 flex-1 rounded border border-[#333333] bg-[#121212] px-1.5 py-1 text-[10px] text-[#d4d4d4] outline-none"
              >
                {status?.avds.length ? (
                  status.avds.map((avd) => (
                    <option key={avd} value={avd}>
                      {avd}
                    </option>
                  ))
                ) : (
                  <option value="">No AVD</option>
                )}
              </select>
              <button
                type="button"
                onClick={handleLaunchAndroidOnScreen}
                disabled={booting}
                className="flex shrink-0 items-center gap-1 rounded bg-[#e5e5e5] px-2 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
              >
                <Play size={10} /> {selectedSerial ? 'Live' : booting ? 'Boot…' : 'Run'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && appUrl.trim()) {
                    setAppRunning(true)
                    setIframeKey((k) => k + 1)
                  }
                }}
                placeholder="http://localhost:3000"
                className="min-w-0 flex-1 rounded border border-[#333333] bg-[#121212] px-2 py-1 font-mono text-[10px] text-white outline-none"
              />
              <button
                type="button"
                onClick={() => void startAppOnPhone()}
                disabled={appStarting}
                className="flex shrink-0 items-center gap-1 rounded bg-[#e5e5e5] px-2 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
              >
                <Play size={10} /> Run
              </button>
            </div>
          )}

          {notice && <p className="truncate text-[9px] text-[#d4d4d4]">{notice}</p>}
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,#1b1b1b_0,#0d0d0d_70%)] p-3">
          {phoneScreenContent}
        </div>
      </aside>
    )
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#141414]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-4">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="text-[#e5e5e5]" />
          <span className="text-[12px] font-semibold text-white">
            Phone & Android Emulator (Direct On-Screen)
          </span>
          <div className="ml-2 flex rounded border border-[#2f2f2f] bg-[#121212] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setPhoneMode('android')}
              className={`rounded px-2 py-0.5 ${
                phoneMode === 'android' ? 'bg-[#2a2a2a] text-white' : 'text-[#858585]'
              }`}
            >
              Android AVD
            </button>
            <button
              type="button"
              onClick={() => setPhoneMode('app')}
              className={`rounded px-2 py-0.5 ${
                phoneMode === 'app' ? 'bg-[#2a2a2a] text-white' : 'text-[#858585]'
              }`}
            >
              Live App
            </button>
          </div>
          {selectedSerial && (
            <span className="rounded bg-[#e5e5e5] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#111111]">
              {selectedSerial}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {phoneMode === 'android' ? (
            <>
              <select
                value={selectedAvd}
                onChange={(event) => setSelectedAvd(event.target.value)}
                className="h-7 rounded border border-[#333333] bg-[#141414] px-2 text-[10px] text-[#cccccc] outline-none"
              >
                {status?.avds.length ? (
                  status.avds.map((avd) => (
                    <option key={avd} value={avd}>
                      {avd}
                    </option>
                  ))
                ) : (
                  <option value="">No AVD configured</option>
                )}
              </select>
              <button
                type="button"
                onClick={handleLaunchAndroidOnScreen}
                disabled={booting}
                className="flex h-7 items-center gap-1.5 rounded bg-[#e5e5e5] px-2.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-35"
              >
                <Play size={11} /> {booting ? 'Booting…' : 'Run On Phone'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void startAppOnPhone()}
              disabled={appStarting}
              className="flex h-7 items-center gap-1.5 rounded bg-[#e5e5e5] px-2.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-35"
            >
              <Play size={11} /> {appStarting ? 'Starting…' : 'Run App On Phone'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="icon-button !size-7 border border-[#333333]"
            title="Refresh ADB & AVDs"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-8 overflow-auto bg-[radial-gradient(circle_at_center,#1b1b1b_0,#0d0d0d_65%)] p-6">
        {phoneScreenContent}

        <div className="w-72 space-y-3">
          <div className="rounded-lg border border-[#2b2b2b] bg-[#181818] p-3 text-[10px] leading-4 text-[#a3a3a3]">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-[#e5e5e5]">Android SDK & Live Runner</p>
              {notice && <span className="text-[9px] text-white">{notice}</span>}
            </div>
            <p className="mt-1.5">ADB: {status?.adbAvailable ? 'Installed' : 'Not found'}</p>
            <p>Emulator: {status?.emulatorAvailable ? 'Installed (Headless Mode)' : 'Not found'}</p>
            <p>AVDs: {status?.avds.join(', ') || 'None'}</p>
            <p>Online devices: {status?.devices.length ?? 0}</p>
            <p className="mt-1 text-[9px] text-[#737373]">
              Tap or drag directly on the phone display to interact with Android.
            </p>
            <button
              type="button"
              disabled={gradleRunning}
              onClick={async () => {
                setGradleRunning(true)
                setGradleOutput('')
                try {
                  const isWinBrowser =
                    typeof navigator !== 'undefined' &&
                    navigator.userAgent.toLowerCase().includes('win')
                  const cmd = isWinBrowser
                    ? '.\\gradlew.bat installDebug'
                    : './gradlew installDebug'
                  const res = await fetch('/api/runner', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'run-silent',
                      command: cmd,
                      cwd: rootPath,
                    }),
                  })
                  const data = (await res.json()) as {
                    ok?: boolean
                    stdout?: string
                    stderr?: string
                  }
                  flashNotice(data.ok ? 'APK installed cleanly' : 'Gradle finished with errors')
                  setGradleOutput((data.stdout || data.stderr || '').slice(-400))
                } finally {
                  setGradleRunning(false)
                }
              }}
              className="mt-2.5 w-full rounded border border-[#3c3c3c] bg-[#242424] py-1.5 text-[10px] text-[#e5e5e5] hover:bg-[#333333] disabled:opacity-50"
            >
              {gradleRunning ? 'Installing APK…' : 'Build & Install APK (gradlew)'}
            </button>
            {gradleOutput && (
              <pre className="mt-2 max-h-24 overflow-auto rounded bg-[#101010] p-1.5 font-mono text-[9px] text-[#cccccc]">
                {gradleOutput}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
