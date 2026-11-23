const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron')
const path = require('node:path')
const { spawn } = require('node:child_process')

const PORT = Number(process.env.PORT || 40704)
const SERVER_URL = `http://127.0.0.1:${PORT}`

let mainWindow = null
let serverChild = null

if (process.platform === 'win32') {
  app.setAppUserModelId('com.vincezone.studio')
}

process.on('uncaughtException', (err) => {
  console.error('[VinceZone Desktop] UncaughtException:', err.message || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[VinceZone Desktop] UnhandledRejection:', reason)
})

async function isVinceZoneReady() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const res = await fetch(`${SERVER_URL}/api/vz-ping`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return false
    const data = await res.json()
    return data && data.app === 'vincezone'
  } catch {
    return false
  }
}

async function ensureLocalServer() {
  if (await isVinceZoneReady()) {
    console.log(`[VinceZone Desktop] Connected to running VinceZone server at ${SERVER_URL}`)
    return true
  }

  console.log(`[VinceZone Desktop] Booting embedded Next.js server on ${SERVER_URL}...`)
  const projectRoot = path.resolve(__dirname, '..')
  const isProd = process.env.VINCEZONE_PROD === '1'
  const nextBin = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
  const args = [nextBin, isProd ? 'start' : 'dev', '--port', String(PORT), '--hostname', '127.0.0.1']

  serverChild = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
    windowsHide: true,
  })

  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (await isVinceZoneReady()) return true
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

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
    {
      label: 'Help',
      submenu: [
        {
          label: `Open in Browser (localhost:${PORT})`,
          click: () => shell.openExternal(`http://localhost:${PORT}`),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow() {
  const ready = await ensureLocalServer()

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'VinceZone Studio',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

  if (ready) {
    await mainWindow.loadURL(`http://localhost:${PORT}`)
  } else {
    await mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="background:#1e1e1e;color:#cccccc;font-family:Segoe UI,sans-serif;padding:40px">
          <h2 style="color:#fff">VinceZone Studio failed to reach localhost:${PORT}</h2>
          <p>Run <code>pnpm dev</code> or <code>pnpm desktop</code> from the workspace root.</p>
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (serverChild && !serverChild.killed) {
    serverChild.kill()
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})
