import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter as pathDelimiter, join } from 'node:path'

export const supportedCliTools = [
  { id: 'claude', name: 'Claude Code', executable: 'claude' },
  { id: 'codex', name: 'Codex CLI', executable: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', executable: 'gemini' },
] as const

export type CliDetection = {
  id: (typeof supportedCliTools)[number]['id']
  name: string
  executable: string
  installed: boolean
  authentication: 'unknown'
}

export type DetectCliOptions = {
  pathValue?: string
  platform?: NodeJS.Platform
  pathExt?: string
  accessFn?: (filePath: string, mode?: number) => Promise<void>
}

export function candidateExecutableNames(
  executable: string,
  platform: NodeJS.Platform,
  pathExt?: string,
): string[] {
  if (platform !== 'win32') return [executable]

  const extensions = (pathExt || '.EXE;.CMD;.BAT;.COM;.PS1')
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`))

  const uniqueExts = Array.from(new Set(extensions))
  return [executable, ...uniqueExts.map((ext) => `${executable}${ext}`)]
}

async function isExecutable(
  executable: string,
  options: Required<Pick<DetectCliOptions, 'platform' | 'accessFn'>> & {
    pathValue?: string
    pathExt?: string
  },
) {
  if (!options.pathValue) return false

  const separator = options.platform === 'win32' ? ';' : pathDelimiter
  const mode = options.platform === 'win32' ? constants.F_OK : constants.X_OK
  const candidates = candidateExecutableNames(executable, options.platform, options.pathExt)

  for (const rawDir of options.pathValue.split(separator)) {
    const directory = rawDir.trim().replace(/^"|"$/g, '')
    if (!directory) continue
    for (const candidate of candidates) {
      try {
        await options.accessFn(join(directory, candidate), mode)
        return true
      } catch {
        // Continue through PATH without exposing directories or access errors.
      }
    }
  }

  return false
}

export async function detectSupportedCliTools(
  pathOrOptions: string | DetectCliOptions | undefined = process.env.PATH,
): Promise<CliDetection[]> {
  const options: DetectCliOptions =
    typeof pathOrOptions === 'string' || pathOrOptions === undefined
      ? { pathValue: pathOrOptions }
      : pathOrOptions

  const platform = options.platform ?? process.platform
  const pathExt = options.pathExt ?? process.env.PATHEXT
  const accessFn = options.accessFn ?? access

  return Promise.all(
    supportedCliTools.map(async (tool) => ({
      ...tool,
      installed: await isExecutable(tool.executable, {
        pathValue: options.pathValue,
        platform,
        pathExt,
        accessFn,
      }),
      authentication: 'unknown' as const,
    })),
  )
}
