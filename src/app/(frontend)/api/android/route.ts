import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

const globalAndroid = globalThis as typeof globalThis & {
  __vincezoneAndroidProc?: ChildProcess | null
  __vincezoneWokenSerials?: Set<string>
}

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
      .filter((line) => line && !line.startsWith('INFO') && !line.startsWith('WARNING'))
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
      .filter((line) => line && !line.startsWith('*'))
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

async function getDeviceScreenSize(
  adbBin: string | null,
  serial: string,
): Promise<{ width: number; height: number } | null> {
  if (!adbBin || !serial) return null
  try {
    const { stdout } = await execFileAsync(adbBin, ['-s', serial, 'shell', 'wm', 'size'], {
      timeout: 4000,
      windowsHide: true,
    })
    const match = stdout.match(/(\d{3,4})x(\d{3,4})/)
    if (!match) return null
    return { width: Number(match[1]), height: Number(match[2]) }
  } catch {
    return null
  }
}

async function isBootCompleted(adbBin: string | null, serial: string): Promise<boolean> {
  if (!adbBin || !serial) return false
  try {
    const { stdout } = await execFileAsync(
      adbBin,
      ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
      { timeout: 3000, windowsHide: true },
    )
    return stdout.trim() === '1'
  } catch {
    return false
  }
}

async function wakeAndUnlock(adbBin: string, serial: string) {
  try {
    await execFileAsync(adbBin, ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], {
      timeout: 4000,
      windowsHide: true,
    })
    await execFileAsync(adbBin, ['-s', serial, 'shell', 'wm', 'dismiss-keyguard'], {
      timeout: 4000,
      windowsHide: true,
    })
  } catch {
    // Non-fatal while launcher is still finishing startup
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
    if (serial) {
      globalAndroid.__vincezoneWokenSerials ??= new Set()
      if (!globalAndroid.__vincezoneWokenSerials.has(serial)) {
        const booted = await isBootCompleted(adbBin, serial)
        if (booted) {
          globalAndroid.__vincezoneWokenSerials.add(serial)
          await wakeAndUnlock(adbBin, serial)
        }
      }
    }
    const args = serial
      ? ['-s', serial, 'exec-out', 'screencap', '-p']
      : ['exec-out', 'screencap', '-p']
    try {
      const { stdout } = await execFileAsync(adbBin, args, {
        encoding: 'buffer',
        maxBuffer: 15 * 1024 * 1024,
        timeout: 8000,
        windowsHide: true,
      })
      if (!stdout || stdout.length < 64) {
        return Response.json({ error: 'Device screen is still booting…' }, { status: 503 })
      }
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
  const online = devices.find((d) => d.status === 'device')
  const bootingDevice = devices.find((d) => d.status === 'offline')
  const [screenSize, bootCompleted] = online
    ? await Promise.all([
        getDeviceScreenSize(adbBin, online.serial),
        isBootCompleted(adbBin, online.serial),
      ])
    : [null, false]

  const emulatorProcessAlive = Boolean(
    globalAndroid.__vincezoneAndroidProc &&
      !globalAndroid.__vincezoneAndroidProc.killed &&
      globalAndroid.__vincezoneAndroidProc.exitCode === null,
  )

  return Response.json(
    {
      sdkAvailable: Boolean(emulatorBin || adbBin),
      emulatorAvailable: Boolean(emulatorBin),
      adbAvailable: Boolean(adbBin),
      avds,
      devices,
      bootingSerial: bootingDevice?.serial ?? null,
      bootCompleted,
      emulatorProcessAlive,
      screenSize: screenSize ?? { width: 720, height: 1280 },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Android runtime is restricted to localhost.' }, { status: 403 })
  }

  let body: {
    action?: string
    avd?: string
    serial?: string
    keycode?: string
    x?: number
    y?: number
    x2?: number
    y2?: number
    text?: string
    headless?: boolean
  }
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
    const existingDevices = await listAdbDevices(adbBin)
    const alreadyRunning = existingDevices.find(
      (d) => d.serial.startsWith('emulator-') && (d.status === 'device' || d.status === 'offline'),
    )
    if (alreadyRunning) {
      if (alreadyRunning.status === 'device' && adbBin) {
        await wakeAndUnlock(adbBin, alreadyRunning.serial)
      }
      return Response.json({
        ok: true,
        alreadyRunning: true,
        serial: alreadyRunning.serial,
        status: alreadyRunning.status,
        launchedAvd: body.avd || 'Running Emulator',
      })
    }

    const avds = await listAvds(emulatorBin)
    const targetAvd = body.avd && avds.includes(body.avd) ? body.avd : avds[0]
    if (!targetAvd) {
      return Response.json(
        { error: 'No Android Virtual Device (AVD) found. Create one in Android Studio AVD Manager.' },
        { status: 404 },
      )
    }

    // CRITICAL on Windows: NEVER use `detached: true` with `windowsHide: true` because
    // libuv sets CREATE_NEW_CONSOLE when detached=true, flashing a black terminal window!
    const args = [
      '-avd',
      targetAvd,
      '-no-window',
      '-no-boot-anim',
      '-no-audio',
      '-gpu',
      'swiftshader_indirect',
    ]

    let earlyErr = ''
    const child = spawn(emulatorBin, args, {
      detached: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        ANDROID_SDK_ROOT: path.dirname(path.dirname(emulatorBin)),
        ANDROID_HOME: path.dirname(path.dirname(emulatorBin)),
      },
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (earlyErr.length < 600) earlyErr += chunk.toString('utf8')
    })
    globalAndroid.__vincezoneAndroidProc = child
    globalAndroid.__vincezoneWokenSerials?.clear()

    // Wait briefly to catch immediate launch errors before returning
    await new Promise((resolve) => setTimeout(resolve, 900))
    if (child.exitCode !== null && child.exitCode !== 0) {
      return Response.json(
        {
          error: earlyErr.trim() || `Android Emulator exited immediately (code ${child.exitCode}).`,
        },
        { status: 500 },
      )
    }

    child.unref()
    return Response.json({ ok: true, launchedAvd: targetAvd, headless: true, pid: child.pid })
  }

  if (body.action === 'keyevent' && body.keycode && adbBin) {
    const allowedKeys = new Set([
      'KEYCODE_HOME',
      'KEYCODE_BACK',
      'KEYCODE_APP_SWITCH',
      'KEYCODE_POWER',
      'KEYCODE_WAKEUP',
      'KEYCODE_ENTER',
      'KEYCODE_DEL',
    ])
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

  if (
    body.action === 'swipe' &&
    typeof body.x === 'number' &&
    typeof body.y === 'number' &&
    typeof body.x2 === 'number' &&
    typeof body.y2 === 'number' &&
    adbBin
  ) {
    const args = [
      ...(body.serial ? ['-s', body.serial] : []),
      'shell',
      'input',
      'swipe',
      String(Math.max(0, Math.round(body.x))),
      String(Math.max(0, Math.round(body.y))),
      String(Math.max(0, Math.round(body.x2))),
      String(Math.max(0, Math.round(body.y2))),
      '220',
    ]
    try {
      await execFileAsync(adbBin, args, { timeout: 6000, windowsHide: true })
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to send swipe.' },
        { status: 500 },
      )
    }
  }

  if (body.action === 'text' && typeof body.text === 'string' && body.text.trim() && adbBin) {
    const safeText = body.text.replace(/[^a-zA-Z0-9._:@/-]/g, '%s').slice(0, 120)
    const args = [
      ...(body.serial ? ['-s', body.serial] : []),
      'shell',
      'input',
      'text',
      safeText,
    ]
    try {
      await execFileAsync(adbBin, args, { timeout: 6000, windowsHide: true })
      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to send text.' },
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
      globalAndroid.__vincezoneAndroidProc = null
      globalAndroid.__vincezoneWokenSerials?.delete(body.serial)
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
