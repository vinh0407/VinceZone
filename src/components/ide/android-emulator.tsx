'use client'

import { Braces, Play, Smartphone } from 'lucide-react'
import { useState } from 'react'

export function AndroidEmulator({
  projectName,
  onRun,
}: {
  projectName: string
  onRun: () => void
}) {
  const [device, setDevice] = useState('Pixel 9 API 35')
  const [powered, setPowered] = useState(true)
  const [landscape, setLandscape] = useState(false)
  const [notice, setNotice] = useState('')
  const [syncing, setSyncing] = useState(false)

  const flashNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 1400)
  }

  const runAndroid = () => {
    setSyncing(true)
    flashNotice('Simulated Gradle sync started')
    window.setTimeout(() => {
      setSyncing(false)
      flashNotice('Simulated build installed')
      onRun()
    }, 1200)
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#090909]">
      <div className="flex h-11 items-center justify-between border-b border-white/[0.07] px-4">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="text-emerald-400" />
          <span className="text-[12px] font-semibold text-zinc-200">Android simulator</span>
          <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300">
            Simulated preview
          </span>
          <span className="text-[10px] text-zinc-600">{projectName}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={device}
            onChange={(event) => setDevice(event.target.value)}
            className="h-7 rounded-md border border-white/10 bg-[#141414] px-2 text-[10px] text-zinc-400 outline-none"
          >
            <option>Pixel 9 API 35</option>
            <option>Pixel Fold API 35</option>
            <option>Tablet 11 API 34</option>
          </select>
          <button
            onClick={runAndroid}
            className="flex h-7 items-center gap-1.5 rounded-md bg-lime-400 px-2.5 text-[10px] font-semibold text-black"
          >
            <Play size={11} /> Run preview
          </button>
        </div>
      </div>
      {syncing && (
        <div className="relative h-7 shrink-0 overflow-hidden border-b border-sky-400/10 bg-sky-400/[0.06] px-4 text-[10px] leading-7 text-sky-200/70">
          Simulated Gradle project sync in progress…
          <span className="android-sync-line absolute inset-x-0 bottom-0 h-0.5 bg-sky-400" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center gap-8 overflow-auto bg-[radial-gradient(circle_at_center,#171717_0,#0b0b0b_58%)] p-8">
        <div className="rounded-[38px] border-[7px] border-[#272727] bg-black p-1 shadow-2xl shadow-black transition-all">
          <div
            className={`relative overflow-hidden rounded-[29px] bg-[#111827] transition-all ${
              landscape ? 'h-[270px] w-[560px]' : 'h-[560px] w-[270px]'
            }`}
          >
            <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
            {powered ? (
              <>
                <div className="flex h-8 items-center justify-between bg-black/20 px-4 text-[8px] text-white/70">
                  <span>9:41</span>
                  <span>5G · 100%</span>
                </div>
                <div className="flex h-[calc(100%-32px)] flex-col items-center justify-center bg-gradient-to-b from-[#152018] to-[#0c120e] px-7 text-center">
                  <div className="grid size-16 place-items-center rounded-2xl bg-lime-400 text-black shadow-lg shadow-lime-400/10">
                    <Braces size={28} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">Baton Preview</h3>
                  <p className="mt-2 text-[10px] leading-5 text-white/40">
                    Android UI simulation for {projectName}. Connect the Local Companion for real
                    ADB, Gradle, and APK execution.
                  </p>
                  <button
                    onClick={runAndroid}
                    className="mt-6 rounded-full bg-lime-400 px-5 py-2 text-[10px] font-semibold text-black"
                  >
                    Simulate launch
                  </button>
                </div>
              </>
            ) : (
              <div className="grid h-full place-items-center text-[10px] text-zinc-700">
                Device off
              </div>
            )}
          </div>
        </div>
        <div className="w-64 space-y-3">
          <div className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-zinc-300">Device controls</p>
              {notice && <span className="text-[9px] text-lime-400">{notice}</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPowered((current) => !current)}
                className="rounded-md border border-white/10 px-3 py-2 text-[10px] text-zinc-500 hover:bg-white/5"
              >
                {powered ? 'Power off' : 'Power on'}
              </button>
              <button
                onClick={() => setLandscape((current) => !current)}
                className="rounded-md border border-white/10 px-3 py-2 text-[10px] text-zinc-500 hover:bg-white/5"
              >
                Rotate
              </button>
              <button
                onClick={() => flashNotice('Preview snapshot captured')}
                className="rounded-md border border-white/10 px-3 py-2 text-[10px] text-zinc-500 hover:bg-white/5"
              >
                Screenshot
              </button>
              <button
                onClick={() => {
                  setPowered(false)
                  window.setTimeout(() => setPowered(true), 250)
                  flashNotice('Preview reloaded')
                }}
                className="rounded-md border border-white/10 px-3 py-2 text-[10px] text-zinc-500 hover:bg-white/5"
              >
                Reload
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-400/10 bg-amber-400/[0.03] p-3 text-[10px] leading-4 text-zinc-600">
            This browser preview simulates an Android device. Native ADB, Gradle, SDK, and APK
            execution require the Local Companion runtime.
          </div>
        </div>
      </div>
    </section>
  )
}
