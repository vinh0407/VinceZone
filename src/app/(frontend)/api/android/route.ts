import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

async function resolveSdkTool(subPath: string): Promise<string | null> {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean) as string[]

  const ext = process.platform === 'win32' ? '.exe' : ''
  for (const root of candidates) {
    const full = path.join(root, `${subPath}${ext}`)
    try {
      await access(full)
      return full
    } catch {
      // continue
    }
  }
  return null
}

async function listAvds(emulatorBin: string | null): Promise<string[]> {
  if (!emulatorBin) return []
  try {
    const { stdout } = await execFileAsync(emulatorBin, ['-list-avds'], {
      timeout: 6000,
      windowsHide: true,
    })
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('INFO'))
  } catch {
    return []
  }
}

async function listAdbDevices(adbBin: string | null) {
  if (!adbBin) return []
  try {
    const { stdout } = await execFileAsync(adbBin, ['devices', '-l'], {
      timeout: 6000,
      windowsHide: true,
    })
    return stdout
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/)
        return {
          serial: parts[0],
          status: parts[1] || 'unknown',
          details: parts.slice(2).join(' '),
        }
      })
  } catch {
    return []
  }
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Android runtime is restricted to localhost.' }, { status: 403 })
  }

  const [emulatorBin, adbBin] = await Promise.all([
    resolveSdkTool(path.join('emulator', 'emulator')),
    resolveSdkTool(path.join('platform-tools', 'adb')),
  ])

  const { searchParams } = new URL(request.url)
  if (searchParams.get('action') === 'screenshot') {
    if (!adbBin) {
      return Response.json({ error: 'ADB binary not found in Android SDK.' }, { status: 404 })
    }
    const serial = searchParams.get('serial')?.trim()
    const args = serial ? ['-s', serial, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p']
    try {
      const { stdout } = await execFileAsync(adbBin, args, {
        encoding: 'buffer',
        maxBuffer: 15 * 1024 * 1024,
        timeout: 8000,
        windowsHide: true,
      })
      return new Response(new Uint8Array(stdout), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
        },
      })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Could not capture device screen.' },
        { status: 500 },
      )
    }
  }

  const [avds, devices] = await Promise.all([listAvds(emulatorBin), listAdbDevices(adbBin)])

  return Response.json(
    {
      sdkAvailable: Boolean(emulatorBin || adbBin),
      emulatorAvailable: Boolean(emulatorBin),
      adbAvailable: Boolean(adbBin),
      avds,
      devices,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Android runtime is restricted to localhost.' }, { status: 403 })
  }

  let body: { action?: string; avd?: string; serial?: string; keycode?: string; x?: number; y?: number }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const [emulatorBin, adbBin] = await Promise.all([
    resolveSdkTool(path.join('emulator', 'emulator')),
    resolveSdkTool(path.join('platform-tools', 'adb')),
  ])

  if (body.action === 'launch') {
    if (!emulatorBin) {
      return Response.json({ error: 'Android Emulator binary not found.' }, { status: 404 })
    }
    const avds = await listAvds(emulatorBin)
    const targetAvd = body.avd && avds.includes(body.avd) ? body.avd : avds[0]
    if (!targetAvd) {
      return Response.json(
        { error: 'No Android Virtual Device (AVD) found. Create one in Android Studio AVD Manager.' },
        { status: 404 },
      )
    }
    const child = spawn(emulatorBin, ['-avd', targetAvd, '-no-snapshot-load'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
    return Response.json({ ok: true, launchedAvd: targetAvd })
  }

  if (body.action === 'keyevent' && body.keycode && adbBin) {
    const allowedKeys = new Set(['KEYCODE_HOME', 'KEYCODE_BACK', 'KEYCODE_APP_SWITCH', 'KEYCODE_POWER', 'KEYCODE_WAKEUP'])
    if (!allowedKeys.has(body.keycode)) {
      return Response.json({ error: 'Unsupported Android keycode.' }, { status: 400 })
    }
    const args = body.serial
      ? ['-s', body.serial, 'shell', 'input', 'keyevent', body.keycode]
      : ['shell', 'input', 'keyevent', body.keycode]
    try {
      await execFileAsync(adbBin, args, { timeout: 6000, windowsHide: true })
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to send keyevent.' },
        { status: 500 },
      )
    }
  }

  if (body.action === 'tap' && typeof body.x === 'number' && typeof body.y === 'number' && adbBin) {
    const x = Math.max(0, Math.round(body.x))
    const y = Math.max(0, Math.round(body.y))
    const args = body.serial
      ? ['-s', body.serial, 'shell', 'input', 'tap', String(x), String(y)]
      : ['shell', 'input', 'tap', String(x), String(y)]
    try {
      await execFileAsync(adbBin, args, { timeout: 6000, windowsHide: true })
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to send tap.' },
        { status: 500 },
      )
    }
  }

  if (body.action === 'stop' && body.serial && adbBin) {
    try {
      await execFileAsync(adbBin, ['-s', body.serial, 'emu', 'kill'], {
        timeout: 6000,
        windowsHide: true,
      })
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to stop emulator.' },
        { status: 500 },
      )
    }
  }

  return Response.json({ error: 'Unsupported Android action.' }, { status: 400 })
}
