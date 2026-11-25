import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export type FormatResult = {
  formatted: boolean
  formatter: string
  content: string
  reason?: string
}

function runFormatterProcess(
  bin: string,
  args: string[],
  cwd: string,
  stdinText: string,
  timeoutMs = 8_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(/*turbopackIgnore: true*/ bin, args, {
      cwd,
      windowsHide: true,
      shell: process.platform === 'win32' && !bin.endsWith('.exe'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill()
      } catch {
        // ignore
      }
      resolve({ ok: false, stdout, stderr: 'Formatter timed out.' })
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr: err.message })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: code === 0, stdout, stderr })
    })

    try {
      child.stdin?.write(stdinText)
      child.stdin?.end()
    } catch {
      // ignore
    }
  })
}

function findLocalBin(workspaceRoot: string, name: string): string | null {
  const isWin = process.platform === 'win32'
  const candidate = path.join(
    /*turbopackIgnore: true*/ workspaceRoot,
    'node_modules',
    '.bin',
    isWin ? `${name}.cmd` : name,
  )
  return existsSync(/*turbopackIgnore: true*/ candidate) ? candidate : null
}

/**
 * Formats a source buffer using the repository's real formatter (`biome`, `prettier`, or `ruff` for Python).
 * Falls back gracefully without modifying content if no project formatter is installed.
 */
export async function formatCodeWithProjectTool(input: {
  workspaceRoot: string
  filePath: string
  content: string
}): Promise<FormatResult> {
  const root = path.resolve(/*turbopackIgnore: true*/ input.workspaceRoot)
  const ext = path.extname(input.filePath).toLowerCase()

  // JSON fast-path: always format cleanly even without external binary
  if (ext === '.json') {
    try {
      const parsed = JSON.parse(input.content)
      return {
        formatted: true,
        formatter: 'builtin-json',
        content: `${JSON.stringify(parsed, null, 2)}\n`,
      }
    } catch {
      return {
        formatted: false,
        formatter: 'builtin-json',
        content: input.content,
        reason: 'Invalid JSON syntax.',
      }
    }
  }

  // Python -> ruff format
  if (ext === '.py') {
    const res = await runFormatterProcess(
      'ruff',
      ['format', '--stdin-filename', input.filePath, '-'],
      root,
      input.content,
    )
    if (res.ok && res.stdout) {
      return { formatted: true, formatter: 'ruff', content: res.stdout }
    }
    return {
      formatted: false,
      formatter: 'none',
      content: input.content,
      reason: 'ruff not installed.',
    }
  }

  // JS/TS/CSS/HTML/MD -> Biome first (if biome.json exists or biome bin installed), then Prettier
  const hasBiomeConfig =
    existsSync(path.join(/*turbopackIgnore: true*/ root, 'biome.json')) ||
    existsSync(path.join(/*turbopackIgnore: true*/ root, 'biome.jsonc'))
  const biomeBin = findLocalBin(root, 'biome')
  if (biomeBin && hasBiomeConfig) {
    const res = await runFormatterProcess(
      biomeBin,
      ['format', '--stdin-file-path', input.filePath],
      root,
      input.content,
    )
    if (res.ok && res.stdout) {
      return { formatted: true, formatter: 'biome', content: res.stdout }
    }
  }

  const prettierBin = findLocalBin(root, 'prettier')
  if (prettierBin) {
    const res = await runFormatterProcess(
      prettierBin,
      ['--stdin-filepath', input.filePath],
      root,
      input.content,
    )
    if (res.ok && res.stdout) {
      return { formatted: true, formatter: 'prettier', content: res.stdout }
    }
  }

  if (biomeBin) {
    const res = await runFormatterProcess(
      biomeBin,
      ['format', '--stdin-file-path', input.filePath],
      root,
      input.content,
    )
    if (res.ok && res.stdout) {
      return { formatted: true, formatter: 'biome', content: res.stdout }
    }
  }

  return {
    formatted: false,
    formatter: 'none',
    content: input.content,
    reason: 'No Biome/Prettier formatter installed in workspace.',
  }
}
