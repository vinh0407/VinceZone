const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const AgentEngine = require('./agent-engine');

// Prevent unexpected process error dialogs
process.on('uncaughtException', (err) => {
  console.error('[VinceZone Desktop] UncaughtException in main process:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[VinceZone Desktop] UnhandledRejection in main process:', reason);
});

let mainWindow = null;
let currentWorkspace = null;
let activeAgent = null;
let embeddedServerProcess = null;
let SERVER_PORT = 3300;
let SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Helper: Check if server on url is actually VinceZone Gateway
Menu.setApplicationMenu(null);
async function isVinceZoneOnline(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${url}/api/vz-ping`, { signal: timer.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return data && data.app === 'vincezone';
    }
  } catch (e) {}
  return false;
}

// Helper: Check if a local TCP port is free to bind
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.once('close', () => resolve(true)).close())
      .listen(port, '127.0.0.1');
  });
}

// Find existing VinceZone instance or a free port that doesn't conflict with other apps (e.g. Next.js on 3000)
async function resolveAvailableServer() {
  const candidatePorts = [3300, 3000, 3001, 3002, 3301, 3302, 3303];
  
  // 1. Check if VinceZone is already running on any of these ports
  for (const p of candidatePorts) {
    if (await isVinceZoneOnline(`http://localhost:${p}`)) {
      SERVER_PORT = p;
      SERVER_URL = `http://localhost:${p}`;
      process.env.PORT = String(p);
      console.log(`[VinceZone Desktop] Connected to existing VinceZone server on ${SERVER_URL}`);
      return true;
    }
  }

  // 2. Select a port that is NOT occupied by other apps (e.g. Next.js on 3000)
  for (const p of candidatePorts) {
    if (await isPortAvailable(p)) {
      SERVER_PORT = p;
      SERVER_URL = `http://localhost:${p}`;
      process.env.PORT = String(p);
      console.log(`[VinceZone Desktop] Selected available port: ${p}`);
      return false;
    }
  }

  // 3. Dynamic OS fallback port
  const dynamicPort = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
  SERVER_PORT = dynamicPort;
  SERVER_URL = `http://localhost:${dynamicPort}`;
  process.env.PORT = String(dynamicPort);
  return false;
}

// Auto-check and optionally start internal VinceZone gateway server in-process
async function ensureGatewayRunning() {
  const isAlreadyRunning = await resolveAvailableServer();
  if (isAlreadyRunning) return true;

  console.log(`[VinceZone Desktop] Starting embedded VinceZone server on ${SERVER_URL}...`);
  const candidates = [
    path.join(__dirname, '..', 'server.js'),
    path.join(app.getAppPath(), 'server.js'),
    path.resolve('server.js')
  ];

  for (const sPath of candidates) {
    try {
      if (fs.existsSync(sPath)) {
        require(sPath);
        console.log(`[VinceZone Desktop] Embedded server loaded from: ${sPath}`);
        break;
      }
    } catch (err) {
      console.warn(`[VinceZone Desktop] Server load notice from ${sPath}:`, err.message);
    }
  }

  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await isVinceZoneOnline(SERVER_URL)) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

function createWindow() {
  const appIcon = path.join(__dirname, 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#09090b',
    title: 'VinceZone',
    frame: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(appIcon) ? appIcon : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.autoHideMenuBar = true;

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: true });
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state-changed', { isMaximized: false });
    }
  });

  // Load splash screen first
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));

  // Ensure gateway is running then navigate to full application
  ensureGatewayRunning().then(async (isOnline) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.webContents.session.clearCache();
      } catch (e) {}
      if (isOnline) {
        mainWindow.loadURL(SERVER_URL);
      } else {
        // Fallback: try loading public index directly if server couldn't bind
        mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (activeAgent) {
      activeAgent.stop();
    }
  });
}

// ---------------- IPC HANDLERS ----------------

// Workspace: Open Native Directory Dialog
async function openFolderDialog() {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Chọn thư mục dự án để mở trong VinceZone Studio'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  currentWorkspace = result.filePaths[0];
  return {
    rootPath: currentWorkspace,
    name: path.basename(currentWorkspace)
  };
}

ipcMain.handle('workspace:open-dialog', async () => {
  return await openFolderDialog();
});

ipcMain.handle('workspace:open-file-dialog', async (event, filters = []) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Chọn tệp tin để mở',
    filters
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Workspace: Recursive Tree Listing
function getDirectoryTree(dirPath, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dirPath)) return [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const tree = [];

    for (const entry of entries) {
      // Ignore bulky/cache directories
      if (['node_modules', '.git', '.next', 'dist', 'build', '.gemini', '.cache', 'coverage'].includes(entry.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(currentWorkspace || dirPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        tree.push({
          name: entry.name,
          type: 'directory',
          path: relPath,
          fullPath,
          children: getDirectoryTree(fullPath, maxDepth, currentDepth + 1)
        });
      } else {
        tree.push({
          name: entry.name,
          type: 'file',
          path: relPath,
          fullPath
        });
      }
    }

    return tree.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'directory' ? -1 : 1;
    });
  } catch (e) {
    return [];
  }
}

ipcMain.handle('workspace:read-tree', async (event, dirPath) => {
  const targetDir = dirPath || currentWorkspace;
  if (!targetDir || !fs.existsSync(targetDir)) return [];
  return getDirectoryTree(targetDir);
});

// File Operations
ipcMain.handle('file:read', async (event, filePath) => {
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace || process.cwd(), filePath);
  if (!fs.existsSync(full)) {
    throw new Error(`File không tồn tại: ${filePath}`);
  }
  return fs.readFileSync(full, 'utf8');
});

ipcMain.handle('file:save', async (event, filePath, content) => {
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace || process.cwd(), filePath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(full, content, 'utf8');
  return { success: true, path: full };
});

ipcMain.handle('file:create', async (event, filePath, isDir) => {
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace || process.cwd(), filePath);
  if (isDir) {
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  } else {
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(full)) fs.writeFileSync(full, '', 'utf8');
  }
  return { success: true, fullPath: full };
});

ipcMain.handle('file:delete', async (event, filePath) => {
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace || process.cwd(), filePath);
  if (fs.existsSync(full)) {
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    } else {
      fs.unlinkSync(full);
    }
  }
  return { success: true };
});

// Integrated Terminal (PowerShell / CMD Execution)
ipcMain.handle('terminal:exec', async (event, command, shell = 'powershell') => {
  const cwd = currentWorkspace || process.cwd();
  const shellBinary = shell.toLowerCase() === 'cmd' ? 'cmd.exe' : 'powershell.exe';
  const args = shell.toLowerCase() === 'cmd' 
    ? ['/c', command] 
    : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];

  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const child = spawn(shellBinary, args, {
      cwd,
      env: { ...process.env },
      windowsHide: true
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({
        command,
        exitCode: code !== null ? code : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - start
      });
    });

    child.on('error', (err) => {
      resolve({
        command,
        exitCode: 1,
        stdout,
        stderr: err.message,
        durationMs: Date.now() - start
      });
    });
  });
});

// AI Agent Controller
ipcMain.handle('agent:start', async (event, taskPrompt, options = {}) => {
  if (activeAgent) {
    activeAgent.stop();
  }

  activeAgent = new AgentEngine(currentWorkspace || process.cwd(), {
    gatewayUrl: options.gatewayUrl || `${SERVER_URL}/v1/chat/completions`,
    apiKey: options.apiKey || 'vz_live_default',
    model: options.model || 'kilo-auto/free',
    autoApprove: options.autoApprove !== undefined ? options.autoApprove : true
  });

  const onProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:event', data);
    }
  };

  try {
    const result = await activeAgent.executeTask(taskPrompt, onProgress);
    return result;
  } catch (err) {
    return { status: 'error', message: err.message };
  } finally {
    activeAgent = null;
  }
});

ipcMain.handle('agent:stop', async () => {
  if (activeAgent) {
    activeAgent.stop();
    activeAgent = null;
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('gateway:status', async () => {
  try {
    const res = await fetch(`${SERVER_URL}/api/providers`);
    if (res.ok) {
      const providers = await res.json();
      return { online: true, providers };
    }
  } catch (e) {}
  return { online: false, providers: [] };
});

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('window:is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('server:get-url', () => SERVER_URL);
ipcMain.handle('server:get-port', () => SERVER_PORT);

// App lifecycle
app.whenReady().then(async () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (embeddedServerProcess) {
    try { embeddedServerProcess.kill(); } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
