'use client'

import {
  Camera,
  ChevronLeft,
  Home,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Smartphone,
  Square,
  SquareStack,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type AndroidStatus = {
  sdkAvailable: boolean
  emulatorAvailable: boolean
  adbAvailable: boolean
  avds: string[]
  devices: Array<{ serial: string; status: string; details: string }>
}

export function AndroidEmulator({
  projectName,
  rootPath,
}: {
  projectName: string
  rootPath?: string
}) {
  const [status, setStatus] = useState<AndroidStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [gradleRunning, setGradleRunning] = useState(false)
  const [gradleOutput, setGradleOutput] = useState('')
  const [selectedAvd, setSelectedAvd] = useState('')
  const [selectedSerial, setSelectedSerial] = useState('')
  const [landscape, setLandscape] = useState(false)
  const [screenUrl, setScreenUrl] = useState<string | null>(null)
  const [autoStream, setAutoStream] = useState(false)
  const [notice, setNotice] = useState('')

  const flashNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

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
      } else {
        setSelectedSerial('')
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

  useEffect(() => {
    if (!autoStream || !selectedSerial) return
    void captureScreen()
    const timer = window.setInterval(() => void captureScreen(), 1800)
    return () => window.clearInterval(timer)
  }, [autoStream, selectedSerial, captureScreen])

  const sendAction = async (payload: Record<string, unknown>, successText: string) => {
    try {
      const res = await fetch('/api/android', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; launchedAvd?: string }
      if (!res.ok) {
        flashNotice(data.error || 'Android action failed')
        return
      }
      flashNotice(data.launchedAvd ? `Launching AVD ${data.launchedAvd}…` : successText)
      window.setTimeout(() => void refreshStatus(), 2500)
    } catch {
      flashNotice('Android runtime request failed')
    }
  }

  const handleScreenClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!selectedSerial) return
    const rect = event.currentTarget.getBoundingClientRect()
    const normX = (event.clientX - rect.left) / rect.width
    const normY = (event.clientY - rect.top) / rect.height
    const deviceX = Math.round(normX * (landscape ? 2400 : 1080))
    const deviceY = Math.round(normY * (landscape ? 1080 : 2400))
    void sendAction({ action: 'tap', serial: selectedSerial, x: deviceX, y: deviceY }, 'Tap sent')
    window.setTimeout(() => void captureScreen(), 450)
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#141414]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#181818] px-4">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="text-[#e5e5e5]" />
          <span className="text-[12px] font-semibold text-white">Android Emulator (Real SDK)</span>
          <span className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[9px] text-[#d4d4d4]">
            {status?.sdkAvailable ? 'SDK Ready' : 'SDK Not Found'}
          </span>
          {selectedSerial && (
            <span className="rounded bg-[#e5e5e5] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#111111]">
              {selectedSerial}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => void sendAction({ action: 'launch', avd: selectedAvd }, 'Emulator launching')}
            disabled={!status?.emulatorAvailable || !selectedAvd}
            className="flex h-7 items-center gap-1.5 rounded bg-[#e5e5e5] px-2.5 text-[10px] font-semibold text-[#111111] hover:bg-white disabled:opacity-35"
          >
            <Play size={11} /> Launch AVD
          </button>
          <button
            onClick={() => void refreshStatus()}
            className="icon-button !size-7 border border-[#333333]"
            title="Refresh ADB & AVDs"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-8 overflow-auto bg-[radial-gradient(circle_at_center,#1b1b1b_0,#0d0d0d_65%)] p-6">
        <div className="rounded-[38px] border-[7px] border-[#2c2c2c] bg-black p-1 shadow-2xl shadow-black transition-all">
          <div
            className={`relative overflow-hidden rounded-[29px] bg-[#111111] transition-all ${
              landscape ? 'h-[280px] w-[580px]' : 'h-[580px] w-[280px]'
            }`}
          >
            {screenUrl ? (
              <img
                src={screenUrl}
                alt="Live Android Device Screen"
                onClick={handleScreenClick}
                className="h-full w-full cursor-crosshair object-contain bg-black"
                title="Click to send real ADB touch tap"
              />
            ) : (
              <>
                <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
                <div className="flex h-8 items-center justify-between bg-black/30 px-4 text-[8px] text-white/70">
                  <span>ADB</span>
                  <span>{selectedSerial ? 'Connected' : 'Standby'}</span>
                </div>
                <div className="flex h-[calc(100%-32px)] flex-col items-center justify-center bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] px-6 text-center">
                  <img
                    src="/logo.png"
                    alt="VinceZone"
                    className="size-16 rounded-2xl border border-[#333333] object-cover shadow-lg"
                  />
                  <h3 className="mt-5 text-base font-semibold text-white">Android Runtime</h3>
                  <p className="mt-2 text-[10px] leading-5 text-[#9a9a9a]">
                    {selectedSerial
                      ? `Device ${selectedSerial} is online. Click Capture or enable Live Mirror to inspect and interact.`
                      : status?.avds.length
                        ? `Found ${status.avds.length} AVD(s) in Android SDK. Click Launch AVD to boot.`
                        : `Android SDK ${status?.sdkAvailable ? 'detected' : 'not found'} for ${projectName}. Create an AVD or connect a USB device via ADB.`}
                  </p>
                  {selectedSerial ? (
                    <button
                      onClick={() => {
                        setAutoStream(true)
                        void captureScreen()
                      }}
                      className="mt-5 rounded-full bg-[#e5e5e5] px-4 py-2 text-[10px] font-semibold text-[#111111] hover:bg-white"
                    >
                      Start Live Mirror
                    </button>
                  ) : status?.avds.length ? (
                    <button
                      onClick={() =>
                        void sendAction(
                          { action: 'launch', avd: selectedAvd || status.avds[0] },
                          `Booting ${selectedAvd || status.avds[0]}...`,
                        )
                      }
                      className="mt-5 rounded-full bg-[#e5e5e5] px-4 py-2 text-[10px] font-semibold text-[#111111] hover:bg-white"
                    >
                      Launch {selectedAvd || status.avds[0]}
                    </button>
                  ) : (
                    <button
                      onClick={() => void refreshStatus()}
                      className="mt-5 rounded-full border border-[#404040] bg-[#242424] px-4 py-2 text-[10px] text-[#e5e5e5] hover:bg-[#333333]"
                    >
                      Refresh ADB Status
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="w-72 space-y-3">
          <div className="rounded-lg border border-[#2b2b2b] bg-[#181818] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-white">Real ADB Controls</p>
              {notice && <span className="text-[10px] text-[#e5e5e5]">{notice}</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                disabled={!selectedSerial}
                onClick={() => void captureScreen()}
                className="flex items-center justify-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2.5 py-2 text-[10px] text-[#d4d4d4] hover:bg-[#2e2e2e] disabled:opacity-35"
              >
                <Camera size={11} /> Capture
              </button>
              <button
                disabled={!selectedSerial}
                onClick={() => setAutoStream((prev) => !prev)}
                className={`flex items-center justify-center gap-1.5 rounded border px-2.5 py-2 text-[10px] disabled:opacity-35 ${
                  autoStream
                    ? 'border-[#e5e5e5] bg-[#e5e5e5] font-semibold text-[#111111]'
                    : 'border-[#333333] bg-[#222222] text-[#d4d4d4] hover:bg-[#2e2e2e]'
                }`}
              >
                <RefreshCw size={11} className={autoStream ? 'animate-spin' : ''} />
                {autoStream ? 'Mirror ON' : 'Live Mirror'}
              </button>
              <button
                disabled={!selectedSerial}
                onClick={() => void sendAction({ action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_HOME' }, 'Home pressed')}
                className="flex items-center justify-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2.5 py-2 text-[10px] text-[#d4d4d4] hover:bg-[#2e2e2e] disabled:opacity-35"
              >
                <Home size={11} /> Home
              </button>
              <button
                disabled={!selectedSerial}
                onClick={() => void sendAction({ action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_BACK' }, 'Back pressed')}
                className="flex items-center justify-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2.5 py-2 text-[10px] text-[#d4d4d4] hover:bg-[#2e2e2e] disabled:opacity-35"
              >
                <ChevronLeft size={11} /> Back
              </button>
              <button
                disabled={!selectedSerial}
                onClick={() => void sendAction({ action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_APP_SWITCH' }, 'Recents pressed')}
                className="flex items-center justify-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2.5 py-2 text-[10px] text-[#d4d4d4] hover:bg-[#2e2e2e] disabled:opacity-35"
              >
                <SquareStack size={11} /> Recents
              </button>
              <button
                onClick={() => setLandscape((prev) => !prev)}
                className="flex items-center justify-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2.5 py-2 text-[10px] text-[#d4d4d4] hover:bg-[#2e2e2e]"
              >
                <RotateCw size={11} /> Rotate
              </button>
              <button
                disabled={!selectedSerial}
                onClick={() => void sendAction({ action: 'keyevent', serial: selectedSerial, keycode: 'KEYCODE_POWER' }, 'Power toggled')}
                className="flex items-center justify-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2.5 py-2 text-[10px] text-[#d4d4d4] hover:bg-[#2e2e2e] disabled:opacity-35"
              >
                <Power size={11} /> Power
              </button>
              <button
                disabled={!selectedSerial}
                onClick={() => void sendAction({ action: 'stop', serial: selectedSerial }, 'Emulator stopped')}
                className="flex items-center justify-center gap-1.5 rounded border border-[#333333] bg-[#222222] px-2.5 py-2 text-[10px] text-[#f48771] hover:bg-[#2e2e2e] disabled:opacity-35"
              >
                <Square size={10} /> Kill Emu
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-[#2b2b2b] bg-[#181818] p-3 text-[10px] leading-4 text-[#a3a3a3]">
            <p className="font-semibold text-[#e5e5e5]">Local Android SDK Status</p>
            <p className="mt-1">ADB: {status?.adbAvailable ? 'Installed' : 'Not found'}</p>
            <p>Emulator binary: {status?.emulatorAvailable ? 'Installed' : 'Not found'}</p>
            <p>AVDs available: {status?.avds.length ?? 0}</p>
            <p>Online devices: {status?.devices.length ?? 0}</p>
            <button
              disabled={gradleRunning}
              onClick={async () => {
                setGradleRunning(true)
                setGradleOutput('')
                try {
                  const res = await fetch('/api/runner', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'run-silent',
                      command: './gradlew installDebug',
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
              {gradleRunning ? 'Running Gradle silently…' : 'Run Gradle installDebug'}
            </button>
            {gradleOutput && (
              <pre className="mt-2 max-h-24 overflow-auto rounded bg-[#111111] p-2 font-mono text-[9px] text-[#bdbdbd]">
                {gradleOutput}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
