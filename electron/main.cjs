const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } = require('electron')
const path = require('node:path')
const { createInProcessNextHandler } = require('./in-process-bridge.cjs')

const APP_ORIGIN = 'vincezone://studio'
let mainWindow = null

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

process.on('uncaughtException', (err) => {
  console.error('[VinceZone Local App] UncaughtException:', err.message || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[VinceZone Local App] UnhandledRejection:', reason)
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

async function createWindow() {
  const projectRoot = path.resolve(__dirname, '..')
  let inProcessHandler = null
  let bootError = ''

  try {
    inProcessHandler = await createInProcessNextHandler(projectRoot)
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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})
