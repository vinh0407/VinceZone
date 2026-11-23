#!/usr/bin/env node
/**
 * CLI-Anything Harness for VinceZone Studio (localhost:40704)
 * Provides structured --json commands and a self-audit diagnostic command
 * backed directly by the live VinceZone Studio loopback APIs.
 */

import readline from 'node:readline'

const DEFAULT_BASE_URL = process.env.VINCEZONE_URL || 'http://127.0.0.1:40704'

async function apiGet(path, baseUrl = DEFAULT_BASE_URL) {
  const started = Date.now()
  const res = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 400) }
  }
  return { ok: res.ok, status: res.status, latencyMs: Date.now() - started, data }
}

async function runCommand(cmd, args, baseUrl) {
  switch (cmd) {
    case 'ping':
      return apiGet('/api/vz-ping', baseUrl)
    case 'workspace': {
      const root = args[0] ? `?root=${encodeURIComponent(args[0])}` : ''
      const res = await apiGet(`/api/workspace${root}`, baseUrl)
      if (res.ok && res.data?.files) {
        return {
          ...res,
          data: {
            root: res.data.root,
            name: res.data.name,
            fileCount: res.data.files.length,
            sampleFiles: res.data.files.slice(0, 12).map((f) => f.path),
          },
        }
      }
      return res
    }
    case 'android':
      return apiGet('/api/android', baseUrl)
    case 'github':
      return apiGet('/api/github', baseUrl)
    case 'cli-tools':
      return apiGet('/api/cli/detect', baseUrl)
    case 'extensions':
      return apiGet('/api/extensions', baseUrl)
    case 'audit': {
      const [ping, workspace, android, github, cliTools, extensions] = await Promise.all([
        apiGet('/api/vz-ping', baseUrl),
        apiGet('/api/workspace', baseUrl),
        apiGet('/api/android', baseUrl),
        apiGet('/api/github', baseUrl),
        apiGet('/api/cli/detect', baseUrl),
        apiGet('/api/extensions', baseUrl),
      ])

      const gaps = []
      if (!ping.ok) gaps.push('VinceZone local runtime is unreachable on ' + baseUrl)
      if (!android.data?.sdkAvailable) gaps.push('Android SDK not detected')
      if (android.data?.sdkAvailable && (!android.data?.avds || android.data.avds.length === 0)) {
        gaps.push('Android SDK found, but 0 AVDs configured (create one via avdmanager/Android Studio)')
      }
      if (android.data?.sdkAvailable && (!android.data?.devices || android.data.devices.length === 0)) {
        gaps.push('No Android emulator or physical ADB device currently booted')
      }
      if (!github.data?.authenticated) {
        gaps.push('GitHub CLI (gh) is not authenticated')
      }
      const missingClis = (cliTools.data?.tools || [])
        .filter((t) => !t.installed)
        .map((t) => t.executable)
      if (missingClis.length > 0) {
        gaps.push(`Optional CLIs not installed on PATH: ${missingClis.join(', ')}`)
      }

      return {
        ok: ping.ok && workspace.ok && android.ok && github.ok && cliTools.ok && extensions.ok,
        baseUrl,
        endpoints: {
          ping: { ok: ping.ok, status: ping.status, latencyMs: ping.latencyMs },
          workspace: {
            ok: workspace.ok,
            status: workspace.status,
            name: workspace.data?.name,
            fileCount: workspace.data?.files?.length ?? 0,
          },
          android: {
            ok: android.ok,
            sdkAvailable: android.data?.sdkAvailable ?? false,
            emulatorAvailable: android.data?.emulatorAvailable ?? false,
            adbAvailable: android.data?.adbAvailable ?? false,
            avdCount: android.data?.avds?.length ?? 0,
            avds: android.data?.avds ?? [],
            deviceCount: android.data?.devices?.length ?? 0,
          },
          github: {
            ok: github.ok,
            authenticated: github.data?.authenticated ?? false,
            username: github.data?.username ?? '',
            repoCount: github.data?.repos?.length ?? 0,
          },
          cliTools: {
            ok: cliTools.ok,
            installedCount: (cliTools.data?.tools || []).filter((t) => t.installed).length,
            totalCount: (cliTools.data?.tools || []).length,
            installed: (cliTools.data?.tools || []).filter((t) => t.installed).map((t) => t.executable),
          },
          extensions: {
            ok: extensions.ok,
            skillCount: extensions.data?.skills?.length ?? 0,
            scannedDirs: extensions.data?.scannedDirs ?? [],
          },
        },
        gaps,
      }
    }
    case 'help':
    default:
      return {
        ok: true,
        commands: [
          'ping        - Check VinceZone Studio runtime on localhost:40704',
          'workspace   - Inspect active local workspace files',
          'android     - Inspect Android SDK, AVDs, and ADB devices',
          'github      - Inspect GitHub CLI authentication and recent repos',
          'cli-tools   - Detect installed AI & dev CLIs',
          'extensions  - List discovered .agent / .agents / Gemini skills',
          'audit       - Run full diagnostic audit across all endpoints',
        ],
      }
  }
}

function formatOutput(result, asJson) {
  if (asJson) return JSON.stringify(result, null, 2)
  return JSON.stringify(result, null, 2)
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const asJson = rawArgs.includes('--json')
  const urlFlagIdx = rawArgs.indexOf('--url')
  const baseUrl = urlFlagIdx !== -1 && rawArgs[urlFlagIdx + 1] ? rawArgs[urlFlagIdx + 1] : DEFAULT_BASE_URL
  const positional = rawArgs.filter(
    (arg, idx) => arg !== '--json' && arg !== '--url' && (urlFlagIdx === -1 || idx !== urlFlagIdx + 1),
  )

  if (positional.length === 0) {
    console.log(`VinceZone CLI-Anything Harness (${baseUrl}) — type 'help', 'audit', or 'exit'`)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'vincezone> ' })
    rl.prompt()
    rl.on('line', async (line) => {
      const parts = line.trim().split(/\s+/).filter(Boolean)
      if (!parts.length) {
        rl.prompt()
        return
      }
      if (parts[0] === 'exit' || parts[0] === 'quit') {
        rl.close()
        return
      }
      try {
        const out = await runCommand(parts[0], parts.slice(1), baseUrl)
        console.log(formatOutput(out, true))
      } catch (err) {
        console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
      }
      rl.prompt()
    })
    return
  }

  try {
    const result = await runCommand(positional[0], positional.slice(1), baseUrl)
    console.log(formatOutput(result, asJson))
    process.exit(result.ok === false ? 1 : 0)
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
    process.exit(1)
  }
}

void main()
