const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const PREFERRED_PORT = Number(process.env.PORT || 40704)
let activePort = PREFERRED_PORT
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

function findAvailablePort(preferred) {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => {
      const fallback = net.createServer()
      fallback.listen(0, '127.0.0.1', () => {
        const addr = fallback.address()
        const port = typeof addr === 'object' && addr ? addr.port : 40705
        fallback.close(() => resolve(port))
      })
    })
    tester.once('listening', () => {
      tester.close(() => resolve(preferred))
    })
    tester.listen(preferred, '127.0.0.1')
  })
}

async function isVinceZoneReady(port) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const res = await fetch(`http://127.0.0.1:${port}/api/vz-ping`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return false
    const data = await res.json()
    return data && data.app === 'vincezone'
  } catch {
    return false
  }
}

function resolveNodeBinary() {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('where.exe', ['node.exe'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3000,
      })
      const first = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.toLowerCase().endsWith('node.exe'))
      if (first) return first
    } catch {
      // Fallback to bundled Electron Node
    }
  }
  return process.execPath
}

async function ensureEmbeddedRuntime() {
  // Reuse already-running VinceZone runtime on preferred port if present
  if (await isVinceZoneReady(PREFERRED_PORT)) {
    activePort = PREFERRED_PORT
    return true
  }

  activePort = await findAvailablePort(PREFERRED_PORT)
  const projectRoot = path.resolve(__dirname, '..')
  const standaloneServer = path.join(projectRoot, '.next', 'standalone', 'server.js')
  const nodeBin = resolveNodeBinary()
  const useElectronAsNode = nodeBin === process.execPath

  // Prefer self-contained production standalone bundle (boots silently in < 300ms, no dev server needed)
  if (fs.existsSync(standaloneServer) && process.env.VINCEZONE_DEV !== '1') {
    serverChild = spawn(nodeBin, [standaloneServer], {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
        PORT: String(activePort),
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${activePort}`,
        ...(useElectronAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      },
      stdio: 'ignore',
      windowsHide: true,
    })
  } else {
    const nextBin = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
    serverChild = spawn(
      nodeBin,
      [nextBin, 'dev', '--port', String(activePort), '--hostname', '127.0.0.1'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          PORT: String(activePort),
          NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${activePort}`,
          ...(useElectronAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        stdio: 'ignore',
        windowsHide: true,
      },
    )
  }

  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (await isVinceZoneReady(activePort)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
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
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow() {
  const ready = await ensureEmbeddedRuntime()

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
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
    await mainWindow.loadURL(`http://127.0.0.1:${activePort}`)
  } else {
    await mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="background:#181818;color:#cccccc;font-family:Segoe UI,sans-serif;padding:40px">
          <h2 style="color:#fff">VinceZone Studio failed to initialize its local runtime</h2>
          <p>Run <code>pnpm build</code> inside <code>c:\\VisualStudio\\V-IDE</code> and reopen VinceZone Studio.</p>
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
  if (serverChild && !serverChild.killed && serverChild.pid) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(serverChild.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
    } else {
      serverChild.kill()
    }
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})
