import { execFile } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { isLoopbackRequest } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

async function exists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function resolveCraftCliBinary(): Promise<string | null> {
  const exeName = process.platform === 'win32' ? 'craft-anything-cli.exe' : 'craft-anything-cli'
  const workspaceRoot = process.env.VINCEZONE_WORKSPACE_ROOT || process.cwd()
  const toolsDir = path.join(workspaceRoot, 'tools', 'craft-anything')

  const direct = path.join(toolsDir, exeName)
  if (await exists(direct)) return direct

  try {
    const entries = await readdir(toolsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(toolsDir, entry.name, exeName)
      if (await exists(candidate)) return candidate
    }
  } catch {
    // tools/craft-anything not present yet
  }

  // Fallback to PATH
  const pathEnv = process.env.PATH || ''
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, exeName)
    if (await exists(candidate)) return candidate
  }

  return null
}

function buildCraftEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const sdkHome =
    env.ANDROID_HOME ||
    env.ANDROID_SDK_ROOT ||
    (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Android', 'Sdk') : '')
  if (sdkHome) {
    const platformTools = path.join(sdkHome, 'platform-tools')
    env.PATH = `${platformTools}${path.delimiter}${env.PATH || ''}`
  }
  return env
}

function parseJsonSafe(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    // Try extracting the last JSON object/array from mixed stdout
    const startObj = trimmed.indexOf('{')
    const startArr = trimmed.indexOf('[')
    const start =
      startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr)
    if (start >= 0) {
      try {
        return JSON.parse(trimmed.slice(start))
      } catch {
        // Fall back to raw text
      }
    }
    return { raw: trimmed.slice(0, 8000) }
  }
}

async function runCraftCli(binary: string, args: string[], timeoutMs = 25_000) {
  const started = Date.now()
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: buildCraftEnv(),
    })
    return {
      ok: true,
      exitCode: 0,
      durationMs: Date.now() - started,
      data: parseJsonSafe(stdout),
      stderr: stderr.trim(),
    }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
    return {
      ok: false,
      exitCode: typeof err.code === 'number' ? err.code : 1,
      durationMs: Date.now() - started,
      data: parseJsonSafe(err.stdout || ''),
      stderr: (err.stderr || err.message || 'Craft CLI command failed.').trim(),
    }
  }
}

export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Craft Anything API is restricted to localhost.' }, { status: 403 })
  }

  const binary = await resolveCraftCliBinary()
  if (!binary) {
    return Response.json(
      {
        installed: false,
        binaryPath: null,
        version: null,
        totalTools: 0,
        analysisMode: 'clean-room',
        engines: [],
        toolsets: [],
        tools: [],
        doctor: { checks: [] },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode') === 'deep' ? '--deep' : '--clean-room'

  const [capRes, cmdRes, docRes] = await Promise.all([
    runCraftCli(binary, ['--format', 'json', mode, 'capabilities'], 15_000),
    runCraftCli(binary, ['--format', 'json', 'commands'], 15_000),
    runCraftCli(binary, ['--format', 'json', 'doctor'], 15_000),
  ])

  const cap = (capRes.data && typeof capRes.data === 'object' ? capRes.data : {}) as {
    version?: string
    analysis_mode?: string
    tools?: number
    engines?: Array<{
      id: string
      name: string
      found: boolean
      installable_here: boolean
      needed_for: string
      path: string | null
    }>
    toolsets?: Array<{
      id: string
      title: string
      tools: Array<{ tool: string; available: boolean; needs_target: boolean; reason: string | null }>
    }>
  }

  const tools = Array.isArray(cmdRes.data)
    ? (cmdRes.data as Array<{
        command: string
        tool: string
        toolset: string
        title: string
        summary: string
        needs_target: boolean
      }>)
    : []

  const doctor = (docRes.data && typeof docRes.data === 'object' ? docRes.data : { checks: [] }) as {
    checks?: Array<{ name: string; status: string; message: string; remediation?: string }>
  }

  return Response.json(
    {
      installed: true,
      binaryPath: binary,
      version: cap.version || '0.6.1',
      analysisMode: cap.analysis_mode || (mode === '--deep' ? 'deep' : 'clean-room'),
      totalTools: cap.tools || tools.length,
      engines: cap.engines ?? [],
      toolsets: (cap.toolsets ?? []).map((ts) => ({
        id: ts.id,
        title: ts.title,
        total: ts.tools.length,
        available: ts.tools.filter((t) => t.available).length,
      })),
      tools,
      doctor,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Craft Anything API is restricted to localhost.' }, { status: 403 })
  }

  const binary = await resolveCraftCliBinary()
  if (!binary) {
    return Response.json(
      { ok: false, error: 'craft-anything-cli is not installed in tools/craft-anything/.' },
      { status: 404 },
    )
  }

  let body: {
    action?: string
    command?: string
    args?: string[]
    deepMode?: boolean
    target?: string
    engineId?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 })
  }

  const modeFlag = body.deepMode ? '--deep' : '--clean-room'

  if (body.action === 'run-tool') {
    const cmd = (body.command || '').trim()
    if (!/^[a-z0-9-]+$/.test(cmd)) {
      return Response.json({ ok: false, error: 'Invalid Craft Anything tool command.' }, { status: 400 })
    }
    const safeArgs = Array.isArray(body.args)
      ? body.args.map((a) => String(a)).slice(0, 20)
      : []
    const result = await runCraftCli(binary, ['--format', 'json', modeFlag, cmd, ...safeArgs], 35_000)
    return Response.json(result, { status: result.ok ? 200 : 400 })
  }

  if (body.action === 'triage') {
    const target = (body.target || '').trim()
    if (!target) {
      return Response.json({ ok: false, error: 'Target file path is required.' }, { status: 400 })
    }
    const result = await runCraftCli(binary, ['--format', 'json', modeFlag, 'triage', target], 45_000)
    return Response.json(result, { status: result.ok ? 200 : 400 })
  }

  if (body.action === 'install-engine') {
    const engineId = (body.engineId || '').trim()
    if (!/^[a-z0-9_-]+$/i.test(engineId)) {
      return Response.json({ ok: false, error: 'Invalid engine id.' }, { status: 400 })
    }
    const result = await runCraftCli(
      binary,
      ['--format', 'json', 'engines-install', '--engine', engineId],
      90_000,
    )
    return Response.json(result, { status: result.ok ? 200 : 400 })
  }

  if (body.action === 'setup-plan') {
    const result = await runCraftCli(
      binary,
      ['--format', 'json', 'setup', '--dry-run', '--all-detected'],
      20_000,
    )
    return Response.json(result, { status: result.ok ? 200 : 400 })
  }

  if (body.action === 'study-web') {
    const targetUrl = (body.target || '').trim()
    if (!/^https?:\/\/.+/i.test(targetUrl)) {
      return Response.json(
        { ok: false, error: 'Provide a valid http:// or https:// URL to study.' },
        { status: 400 },
      )
    }

    // Use playwright-cli for clean-room multi-width observation (Desktop, Tablet, Mobile)
    const pwBin = process.platform === 'win32' ? 'playwright-cli.cmd' : 'playwright-cli'
    const started = Date.now()
    try {
      await execFileAsync(pwBin, ['open', targetUrl], { timeout: 25_000, windowsHide: true })
      const widths = [
        { label: 'desktop', w: '1440', h: '900' },
        { label: 'tablet', w: '768', h: '1024' },
        { label: 'mobile', w: '390', h: '844' },
      ]
      const viewports: Array<{
        label: string
        width: number
        height: number
        horizontalOverflow: boolean
      }> = []

      let metrics: Record<string, unknown> = {}
      for (const vp of widths) {
        await execFileAsync(pwBin, ['resize', vp.w, vp.h], { timeout: 10_000, windowsHide: true })
        const evalRes = await execFileAsync(
          pwBin,
          [
            'eval',
            "() => ({ title: document.title, url: location.href, overflow: document.documentElement.scrollWidth > window.innerWidth, headings: [...document.querySelectorAll('h1,h2,h3')].slice(0,8).map(h => h.textContent?.trim()).filter(Boolean), navLinks: document.querySelectorAll('a').length, buttons: document.querySelectorAll('button').length, images: document.querySelectorAll('img').length, bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color, font: getComputedStyle(document.body).fontFamily })",
          ],
          { timeout: 15_000, windowsHide: true },
        )
        const jsonMatch = evalRes.stdout.match(/\{[\s\S]*\}/)
        const parsed = jsonMatch ? (parseJsonSafe(jsonMatch[0]) as Record<string, unknown>) : {}
        if (vp.label === 'desktop') metrics = parsed
        viewports.push({
          label: vp.label,
          width: Number(vp.w),
          height: Number(vp.h),
          horizontalOverflow: Boolean(parsed.overflow),
        })
      }

      await execFileAsync(pwBin, ['close'], { timeout: 10_000, windowsHide: true }).catch(() => {})

      return Response.json({
        ok: true,
        durationMs: Date.now() - started,
        mode: body.deepMode ? 'deep' : 'clean-room',
        evidence: {
          target: targetUrl,
          confidence: 'high',
          coverage: '3 responsive viewports (1440px, 768px, 390px) via playwright-cli',
          ...metrics,
          viewports,
        },
      })
    } catch (error) {
      await execFileAsync(pwBin, ['close'], { timeout: 5_000, windowsHide: true }).catch(() => {})
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : 'Playwright web study failed.',
        },
        { status: 500 },
      )
    }
  }

  return Response.json({ ok: false, error: 'Unsupported Craft action.' }, { status: 400 })
}
