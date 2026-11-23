/**
 * Packages VinceZone Studio as a self-contained portable local Windows .exe
 * inside `desktop/VinceZone Studio/VinceZone Studio.exe`:
 * - 100% in-process Next.js + Electron (`vincezone://studio` — ZERO localhost ports, ZERO terminal)
 * - Embeds `electron/vincezone-logo.ico` and Windows version metadata directly into the .exe
 * - Removes legacy localhost launcher scripts (.bat, .vbs, .lnk, .zip)
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const STANDALONE_DIR = path.join(ROOT, '.next', 'standalone')
const DESKTOP_DIR = path.join(ROOT, 'desktop')
const OUT_DIR = path.join(DESKTOP_DIR, 'VinceZone Studio')
const APP_DIR = path.join(OUT_DIR, 'resources', 'app')
const ICON_PATH = path.join(ROOT, 'electron', 'vincezone-logo.ico')
const EXE_PATH = path.join(OUT_DIR, 'VinceZone Studio.exe')

function resolveElectronDist() {
  const realElectronDir = fs.realpathSync(path.join(ROOT, 'node_modules', 'electron'))
  const distDir = path.join(realElectronDir, 'dist')
  const exePath = path.join(distDir, 'electron.exe')

  if (!fs.existsSync(exePath)) {
    const cacheDir = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'electron',
      'Cache',
    )
    const cachedZips = fs.existsSync(cacheDir)
      ? fs.readdirSync(cacheDir).filter((f) => /^electron-.*win32-x64\.zip$/i.test(f))
      : []
    if (cachedZips.length > 0) {
      const zipPath = path.join(cacheDir, cachedZips[0])
      fs.mkdirSync(distDir, { recursive: true })
      execFileSync('tar.exe', ['-xf', zipPath, '-C', distDir], { stdio: 'inherit' })
      fs.writeFileSync(path.join(realElectronDir, 'path.txt'), 'electron.exe', 'utf8')
    }
  }

  if (!fs.existsSync(exePath)) {
    throw new Error(`Electron runtime not found at ${exePath}.`)
  }
  return distDir
}

async function patchExeIconAndMetadata() {
  try {
    const rceditMod = require('rcedit')
    const rceditFn = typeof rceditMod === 'function' ? rceditMod : rceditMod.rcedit
    await rceditFn(EXE_PATH, {
      icon: ICON_PATH,
      'file-version': '2.1.0.0',
      'product-version': '2.1.0.0',
      'version-string': {
        ProductName: 'VinceZone Studio',
        FileDescription: 'VinceZone Studio - Autonomous Multi-Agent Local IDE',
        CompanyName: 'VinceZone',
        OriginalFilename: 'VinceZone Studio.exe',
      },
    })
    console.log('Embedded VinceZone folded-V icon & PE metadata into VinceZone Studio.exe')
  } catch (err) {
    console.warn('Warning: rcedit icon embedding skipped:', err instanceof Error ? err.message : err)
  }
}

function removeLegacyLocalhostFiles() {
  const legacyFiles = [
    path.join(DESKTOP_DIR, 'Start-VinceZone.bat'),
    path.join(DESKTOP_DIR, 'VinceZone-Studio.vbs'),
    path.join(DESKTOP_DIR, 'VinceZone Studio.lnk'),
    path.join(DESKTOP_DIR, 'VinceZone-Studio-v2.0.0.zip'),
    path.join(ROOT, 'Start-VinceZone.bat'),
    path.join(ROOT, 'VinceZone Studio.lnk'),
    path.join(ROOT, 'VinceZone Studio.vbs'),
    path.join(ROOT, '.tmp-elec-err.txt'),
    path.join(ROOT, '.tmp-elec-out.txt'),
  ]
  for (const filePath of legacyFiles) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
      console.log('Removed legacy file:', path.relative(ROOT, filePath))
    }
  }
}

async function main() {
  if (!fs.existsSync(path.join(STANDALONE_DIR, 'server.js'))) {
    console.error('Standalone build missing. Run `pnpm build` first.')
    process.exit(1)
  }

  const electronDist = resolveElectronDist()
  console.log('Using Electron runtime:', electronDist)

  // Clean old output directory
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 1. Copy Electron runtime
  fs.cpSync(electronDist, OUT_DIR, { recursive: true, force: true })

  // 2. Rename electron.exe -> VinceZone Studio.exe and remove default_app.asar
  fs.renameSync(path.join(OUT_DIR, 'electron.exe'), EXE_PATH)
  const defaultAsar = path.join(OUT_DIR, 'resources', 'default_app.asar')
  if (fs.existsSync(defaultAsar)) {
    fs.rmSync(defaultAsar, { force: true })
  }

  // 3. Assemble resources/app/
  fs.mkdirSync(path.join(APP_DIR, 'electron'), { recursive: true })
  fs.mkdirSync(path.join(APP_DIR, '.next'), { recursive: true })
  fs.mkdirSync(path.join(APP_DIR, 'agent-harness'), { recursive: true })

  fs.writeFileSync(
    path.join(APP_DIR, 'package.json'),
    JSON.stringify(
      {
        name: 'vincezone-studio',
        version: '2.1.0',
        private: true,
        main: 'electron/main.cjs',
      },
      null,
      2,
    ),
    'utf8',
  )

  for (const file of ['main.cjs', 'preload.cjs', 'in-process-bridge.cjs', 'vincezone-logo.ico']) {
    fs.copyFileSync(path.join(ROOT, 'electron', file), path.join(APP_DIR, 'electron', file))
  }

  // Copy compiled self-contained Next.js standalone bundle (dereference symlinks for portability)
  fs.cpSync(STANDALONE_DIR, path.join(APP_DIR, '.next', 'standalone'), {
    recursive: true,
    force: true,
    dereference: true,
  })

  // Copy CLI-Anything harness
  fs.copyFileSync(
    path.join(ROOT, 'agent-harness', 'vincezone-cli.mjs'),
    path.join(APP_DIR, 'agent-harness', 'vincezone-cli.mjs'),
  )

  // 4. Embed VinceAuto icon & Windows app metadata into VinceZone Studio.exe
  await patchExeIconAndMetadata()

  // 5. Remove legacy localhost launchers (.bat, .vbs, .lnk, .zip)
  removeLegacyLocalhostFiles()

  const exeStat = fs.statSync(EXE_PATH)
  console.log(
    `\nBuilt standalone local app: ${EXE_PATH} (${(exeStat.size / (1024 * 1024)).toFixed(1)} MB)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
