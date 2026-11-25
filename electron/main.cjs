const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, safeStorage, shell } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createInProcessNextHandler } = require('./in-process-bridge.cjs')
const { createRotatingLogger } = require('./rotating-logger.cjs')

const APP_ORIGIN = 'vincezone://studio'
let mainWindow = null
let activeInProcessHandler = null
let desktopLogger = null

function getDesktopLogger() {
  if (!desktopLogger) {
    const logFile = path.join(app.getPath('userData'), 'logs', 'vincezone-main.log')
    desktopLogger = createRotatingLogger(logFile, { maxBytes: 2 * 1024 * 1024, maxBackups: 3 })
  }
  return desktopLogger
}

// Register custom local protocol BEFORE app.whenReady() — ZERO TCP ports, ZERO localhost!
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vincezone',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      allowServiceWorkers: false,
    },
  },
])

if (process.platform === 'win32') {
  app.setAppUserModelId('com.vincezone.studio')
}

const gotSingleLock = app.requestSingleInstanceLock()
if (!gotSingleLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

process.on('uncaughtException', (err) => {
  console.error('[VinceZone Local App] UncaughtException:', err.message || err)
  try {
    getDesktopLogger().error('uncaughtException', err.stack || err.message || String(err))
  } catch {
    // ignore
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('[VinceZone Local App] UnhandledRejection:', reason)
  try {
    getDesktopLogger().error('unhandledRejection', reason instanceof Error ? reason.stack : String(reason))
  } catch {
    // ignore
  }
})

function buildNativeMenu(win) {
  const send = (action, extra = {}) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('vincezone:menu', { action, ...extra })
    }
  }

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Local Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
            if (!res.canceled && res.filePaths[0]) {
              send('open-workspace', { folder: res.filePaths[0] })
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => send('open-settings'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit VinceZone Studio' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Multi-Agent Control Center',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => send('open-agents'),
        },
        {
          label: 'Edit Memory (REV-xxx)',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => send('open-revisions'),
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'Ctrl+`',
          click: () => send('toggle-terminal'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function resolveDefaultWorkspace(appRoot) {
  if (process.env.VINCEZONE_WORKSPACE_ROOT && fs.existsSync(process.env.VINCEZONE_WORKSPACE_ROOT)) {
    return process.env.VINCEZONE_WORKSPACE_ROOT
  }
  if (!app.isPackaged) {
    return appRoot
  }
  // If packaged inside <repo>/desktop/VinceZone Studio/resources/app, open <repo> by default
  const candidateRepo = path.resolve(appRoot, '..', '..', '..', '..')
  if (
    fs.existsSync(path.join(candidateRepo, 'package.json')) ||
    fs.existsSync(path.join(candidateRepo, '.git'))
  ) {
    return candidateRepo
  }
  // If placed directly in a folder alongside a workspace, check cwd or fall back to user home
  const cwd = process.cwd()
  if (cwd && !cwd.toLowerCase().includes('resources\\app') && fs.existsSync(path.join(cwd, 'package.json'))) {
    return cwd
  }
  return os.homedir()
}

async function createWindow() {
  const appRoot = path.resolve(__dirname, '..')
  const defaultWorkspaceRoot = resolveDefaultWorkspace(appRoot)
  let inProcessHandler = null
  let bootError = ''

  try {
    inProcessHandler = await createInProcessNextHandler(appRoot, defaultWorkspaceRoot)
    activeInProcessHandler = inProcessHandler
    protocol.handle('vincezone', async (request) => {
      try {
        return await inProcessHandler(request)
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Local runtime request failed.',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
      }
    })
  } catch (err) {
    bootError = err instanceof Error ? err.message : String(err)
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 480,
    title: 'VinceZone Studio',
    icon: path.join(__dirname, 'vincezone-logo.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#181818',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#181818',
      symbolColor: '#cccccc',
      height: 35,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  })

  // Harden embedded <webview> guest tabs (Web Project Preview browser)
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    if (!/^https?:\/\//i.test(params.src || '')) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  buildNativeMenu(mainWindow)

  if (inProcessHandler) {
    await mainWindow.loadURL(`${APP_ORIGIN}/`)
  } else {
    await mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="background:#181818;color:#cccccc;font-family:Segoe UI,sans-serif;padding:40px">
          <h2 style="color:#fff">VinceZone Studio Local Runtime Error</h2>
          <pre style="background:#111;padding:12px;border-radius:8px;color:#f48771">${bootError}</pre>
          <p>Run <code>pnpm build</code> once to prepare the local bundle.</p>
        </body>`,
      )}`,
    )
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('vincezone:openDirectory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0] || null
})

ipcMain.handle('vincezone:openExternal', async (_event, targetUrl) => {
  if (typeof targetUrl === 'string' && /^https?:\/\//i.test(targetUrl)) {
    await shell.openExternal(targetUrl)
    return true
  }
  return false
})

ipcMain.handle('vincezone:openLogsFolder', async () => {
  const logger = getDesktopLogger()
  fs.mkdirSync(logger.logDir, { recursive: true })
  logger.info('User opened desktop logs folder')
  await shell.openPath(logger.logDir)
  return { ok: true, logDir: logger.logDir, logFile: logger.logFilePath }
})

ipcMain.handle('vincezone:downloadUpdate', async (_event, releaseUrl) => {
  if (typeof releaseUrl === 'string' && /^https:\/\/github\.com\/vinh0407\/VinceZone\//i.test(releaseUrl)) {
    getDesktopLogger().info('Opening update download URL', releaseUrl)
    await shell.openExternal(releaseUrl)
    return { ok: true }
  }
  return { ok: false, error: 'Invalid release URL.' }
})

// P2-2: OS-level API Key Encryption via Electron safeStorage (Windows DPAPI / macOS Keychain)
function getSecretsVaultPath() {
  return path.join(app.getPath('userData'), 'vincezone-secrets.enc.json')
}

ipcMain.handle('vincezone:secrets:isAvailable', () => {
  try {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable())
  } catch {
    return false
  }
})

ipcMain.handle('vincezone:secrets:save', (_event, keyMap) => {
  if (!keyMap || typeof keyMap !== 'object') return { ok: false, encrypted: false }
  try {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
      return { ok: false, encrypted: false }
    }
    const encryptedEntries = {}
    for (const [providerId, rawKey] of Object.entries(keyMap)) {
      if (typeof rawKey === 'string' && rawKey.trim()) {
        encryptedEntries[providerId] = safeStorage.encryptString(rawKey.trim()).toString('base64')
      }
    }
    const vaultPath = getSecretsVaultPath()
    fs.mkdirSync(path.dirname(vaultPath), { recursive: true })
    const tmpPath = `${vaultPath}.${Date.now()}.tmp`
    fs.writeFileSync(
      tmpPath,
      JSON.stringify({ version: 1, backend: 'electron-safeStorage-dpapi', keys: encryptedEntries }, null, 2),
      { encoding: 'utf8', mode: 0o600 },
    )
    fs.renameSync(tmpPath, vaultPath)
    return { ok: true, encrypted: true, count: Object.keys(encryptedEntries).length }
  } catch {
    return { ok: false, encrypted: false }
  }
})

ipcMain.handle('vincezone:secrets:load', () => {
  try {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return {}
    const vaultPath = getSecretsVaultPath()
    if (!fs.existsSync(vaultPath)) return {}
    const parsed = JSON.parse(fs.readFileSync(vaultPath, 'utf8'))
    const out = {}
    for (const [providerId, cipherBase64] of Object.entries(parsed.keys || {})) {
      if (typeof cipherBase64 === 'string' && cipherBase64) {
        try {
          out[providerId] = safeStorage.decryptString(Buffer.from(cipherBase64, 'base64'))
        } catch {
          // Skip key encrypted under another OS user profile
        }
      }
    }
    return out
  } catch {
    return {}
  }
})

app.whenReady().then(() => {
  getDesktopLogger().info('VinceZone Studio starting', `version=${app.getVersion()} platform=${process.platform}`)
  return createWindow()
})

app.on('before-quit', () => {
  try {
    getDesktopLogger().info('VinceZone Studio shutting down cleanly')
  } catch {
    // ignore
  }
  if (activeInProcessHandler) {
    void activeInProcessHandler(
      new Request(`${APP_ORIGIN}/api/vz-ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'shutdown' }),
      }),
    ).catch(() => {})
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})
