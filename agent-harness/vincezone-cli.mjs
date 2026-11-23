#!/usr/bin/env node
/**
 * CLI-Anything Harness for VinceZone Studio (100% In-Process by default — ZERO localhost required!)
 * Runs directly against the compiled Next.js standalone bundle via electron/in-process-bridge.cjs,
 * or optionally against a remote URL via --url.
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

let cachedInProcessHandler = null

async function getInProcessHandler() {
  if (!cachedInProcessHandler) {
    const { createInProcessNextHandler } = require(
      path.join(PROJECT_ROOT, 'electron', 'in-process-bridge.cjs'),
    )
    cachedInProcessHandler = await createInProcessNextHandler(
      PROJECT_ROOT,
      process.env.VINCEZONE_WORKSPACE_ROOT || PROJECT_ROOT,
    )
  }
  return cachedInProcessHandler
}

async function apiRequest(apiPath, { method = 'GET', body, baseUrl } = {}) {
  const started = Date.now()
  let res
  if (baseUrl) {
    res = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } else {
    const handler = await getInProcessHandler()
    const request = new Request(`vincezone://studio${apiPath}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    res = await handler(request)
  }

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
  const opts = { baseUrl }
  switch (cmd) {
    case 'ping':
      return apiRequest('/api/vz-ping', opts)
    case 'workspace': {
      const root = args[0] ? `?root=${encodeURIComponent(args[0])}` : ''
      const res = await apiRequest(`/api/workspace${root}`, opts)
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
    case 'git': {
      const root = args[0] ? `?root=${encodeURIComponent(args[0])}` : ''
      return apiRequest(`/api/git${root}`, opts)
    }
    case 'mcp-list': {
      const transport = args[0] === 'http' ? 'http' : 'stdio'
      const endpoint = args.slice(1).join(' ')
      if (!endpoint) {
        return { ok: false, error: 'Usage: mcp-list <stdio|http> <command-or-url>' }
      }
      return apiRequest('/api/mcp', {
        ...opts,
        method: 'POST',
        body: { action: 'list-tools', transport, endpoint },
      })
    }
    case 'android':
      return apiRequest('/api/android', opts)
    case 'github':
      return apiRequest('/api/github', opts)
    case 'cli-tools':
      return apiRequest('/api/cli/detect', opts)
    case 'extensions':
      return apiRequest('/api/extensions', opts)
    case 'craft':
      return apiRequest('/api/craft', opts)
    case 'audit': {
      const [ping, workspace, git, android, github, cliTools, extensions, craft] = await Promise.all([
        apiRequest('/api/vz-ping', opts),
        apiRequest('/api/workspace', opts),
        apiRequest('/api/git', opts),
        apiRequest('/api/android', opts),
        apiRequest('/api/github', opts),
        apiRequest('/api/cli/detect', opts),
        apiRequest('/api/extensions', opts),
        apiRequest('/api/craft', opts),
      ])

      const gaps = []
      if (!ping.ok) gaps.push('VinceZone in-process runtime failed health check')
      if (!android.data?.sdkAvailable) gaps.push('Android SDK not detected')
      if (android.data?.sdkAvailable && (!android.data?.avds || android.data.avds.length === 0)) {
        gaps.push('Android SDK found, but 0 AVDs configured')
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
        ok:
          ping.ok &&
          workspace.ok &&
          git.ok &&
          android.ok &&
          github.ok &&
          cliTools.ok &&
          extensions.ok &&
          craft.ok,
        transport: baseUrl ? baseUrl : 'in-process (vincezone://studio — 0 TCP ports)',
        endpoints: {
          ping: { ok: ping.ok, status: ping.status, latencyMs: ping.latencyMs },
          workspace: {
            ok: workspace.ok,
            status: workspace.status,
            name: workspace.data?.name,
            fileCount: workspace.data?.files?.length ?? 0,
          },
          git: {
            ok: git.ok,
            isRepo: git.data?.isRepo ?? false,
            branch: git.data?.branch ?? null,
            changeCount: git.data?.changes?.length ?? 0,
            commitCount: git.data?.commits?.length ?? 0,
          },
          android: {
            ok: android.ok,
            sdkAvailable: android.data?.sdkAvailable ?? false,
            avdCount: android.data?.avds?.length ?? 0,
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
          craft: {
            ok: craft.ok,
            installed: craft.data?.installed ?? false,
            version: craft.data?.version ?? null,
            totalTools: craft.data?.totalTools ?? 0,
            readyEngines: (craft.data?.engines || []).filter((e) => e.found).map((e) => e.id),
          },
        },
        gaps,
      }
    }
    case 'help':
    default:
      return {
        ok: true,
        transport: baseUrl || 'in-process (vincezone://studio)',
        commands: [
          'ping                         - Check VinceZone Studio runtime',
          'workspace [root]             - Inspect active local workspace files',
          'git [root]                   - Inspect live Git branch, changes, and commits',
          'mcp-list <stdio|http> <ep>   - Run JSON-RPC initialize + tools/list on an MCP server',
          'android                      - Inspect Android SDK, AVDs, and ADB devices',
          'github                       - Inspect GitHub CLI authentication and recent repos',
          'cli-tools                    - Detect installed AI & dev CLIs',
          'extensions                   - List discovered .agent / .agents / Gemini skills',
          'craft                        - Inspect Craft Studio engines',
          'audit                        - Run full diagnostic audit across all endpoints',
        ],
      }
  }
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const urlFlagIdx = rawArgs.indexOf('--url')
  const baseUrl =
    urlFlagIdx !== -1 && rawArgs[urlFlagIdx + 1]
      ? rawArgs[urlFlagIdx + 1]
      : process.env.VINCEZONE_URL || ''
  const positional = rawArgs.filter(
    (arg, idx) =>
      arg !== '--json' && arg !== '--url' && (urlFlagIdx === -1 || idx !== urlFlagIdx + 1),
  )

  if (positional.length === 0) {
    const mode = baseUrl || 'in-process (0 localhost ports)'
    console.log(`VinceZone CLI-Anything Harness [${mode}] — type 'help', 'audit', or 'exit'`)
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'vincezone> ',
    })
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
        console.log(JSON.stringify(out, null, 2))
      } catch (err) {
        console.error(
          JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
        )
      }
      rl.prompt()
    })
    return
  }

  try {
    const result = await runCommand(positional[0], positional.slice(1), baseUrl)
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok === false ? 1 : 0)
  } catch (err) {
    console.error(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    )
    process.exit(1)
  }
}

void main()
