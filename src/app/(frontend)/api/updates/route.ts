import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { APP_VERSION } from '@/lib/app-version'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REPO_SLUG = 'vinh0407/VinceZone'

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

async function readCurrentVersion(): Promise<string> {
  try {
    const raw = await readFile(path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { version?: string }
    return pkg.version || APP_VERSION
  } catch {
    return APP_VERSION
  }
}

export async function GET() {
  const currentVersion = await readCurrentVersion()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_SLUG}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'VinceZone-Studio-Updater',
      },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (res.status === 404) {
      // No published release tag yet; check latest commit on main cleanly
      return Response.json({
        ok: true,
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        repoUrl: `https://github.com/${REPO_SLUG}`,
        message: 'Up to date (no newer GitHub Release tag published yet).',
      })
    }

    if (!res.ok) {
      return Response.json({
        ok: true,
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        repoUrl: `https://github.com/${REPO_SLUG}/releases`,
        message: `GitHub API returned ${res.status}.`,
      })
    }

    const release = (await res.json()) as {
      tag_name?: string
      html_url?: string
      published_at?: string
      body?: string
    }
    const latestVersion = (release.tag_name || currentVersion).replace(/^v/i, '')
    const updateAvailable = compareSemver(latestVersion, currentVersion) > 0

    return Response.json({
      ok: true,
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: release.html_url || `https://github.com/${REPO_SLUG}/releases`,
      publishedAt: release.published_at || null,
      notes: (release.body || '').slice(0, 600),
      message: updateAvailable
        ? `New version v${latestVersion} available!`
        : `You are running the latest version (v${currentVersion}).`,
    })
  } catch {
    return Response.json({
      ok: true,
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      offline: true,
      repoUrl: `https://github.com/${REPO_SLUG}/releases`,
      message: `Offline or GitHub unreachable — running local v${currentVersion}.`,
    })
  } finally {
    clearTimeout(timer)
  }
}
