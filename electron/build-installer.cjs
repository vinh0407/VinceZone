/**
 * Builds a Windows distributable installer for VinceZone Studio:
 * 1. If NSIS (`makensis`) is installed on Windows, compiles `electron/installer.nsi`
 *    into `desktop/VinceZone-Studio-Setup-<version>.exe` (with Desktop/Start Menu shortcuts + Uninstaller).
 * 2. Otherwise, packages `desktop/VinceZone-Studio-Portable-<version>.zip` via PowerShell
 *    so distribution always succeeds cleanly out of the box.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const version = pkg.version || '2.0.0'
const sourceDir = path.join(repoRoot, 'desktop', 'VinceZone Studio')
const nsiScript = path.join(__dirname, 'installer.nsi')

if (!fs.existsSync(path.join(sourceDir, 'VinceZone Studio.exe'))) {
  console.error('Missing built desktop/VinceZone Studio/VinceZone Studio.exe — run `pnpm build:exe` first.')
  process.exit(1)
}

function findMakensis() {
  const candidates = [
    'makensis.exe',
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe',
  ]
  for (const bin of candidates) {
    try {
      if (bin.includes('\\') && !fs.existsSync(bin)) continue
      execFileSync(bin, ['/VERSION'], { stdio: 'ignore', windowsHide: true })
      return bin
    } catch {
      // continue
    }
  }
  return null
}

const makensis = findMakensis()
if (makensis) {
  const outExe = path.join(repoRoot, 'desktop', `VinceZone-Studio-Setup-${version}.exe`)
  console.log(`Compiling NSIS installer with ${makensis}...`)
  execFileSync(
    makensis,
    [
      `/DAPP_VERSION=${version}`,
      `/DSOURCE_DIR=${sourceDir}`,
      `/DOUTPUT_FILE=${outExe}`,
      nsiScript,
    ],
    { stdio: 'inherit', windowsHide: true },
  )
  const mb = (fs.statSync(outExe).size / (1024 * 1024)).toFixed(1)
  console.log(`\nBuilt Windows NSIS Installer: ${outExe} (${mb} MB)`)
} else {
  const outZip = path.join(repoRoot, 'desktop', `VinceZone-Studio-Portable-${version}.zip`)
  if (fs.existsSync(outZip)) fs.unlinkSync(outZip)
  console.log('NSIS (makensis.exe) not found on PATH — creating portable Windows distribution ZIP...')
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${outZip}' -CompressionLevel Optimal`,
    ],
    { stdio: 'inherit', windowsHide: true },
  )
  const mb = (fs.statSync(outZip).size / (1024 * 1024)).toFixed(1)
  console.log(`\nBuilt Portable Distribution Archive: ${outZip} (${mb} MB)`)
  console.log('Tip: Install NSIS (winget install NSIS.NSIS) and re-run `pnpm build:installer` to generate Setup .exe.')
}
