const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const AgentEngine = require('./agent-engine');

let mainWindow = null;
let currentWorkspace = null;
let activeAgent = null;
let embeddedServerProcess = null;
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Helper: Check if gateway server is responding
async function isServerOnline() {
  try {
    const res = await fetch(`${SERVER_URL}/api/providers`);
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Helper: Wait for server to become online with retries
async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerOnline()) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// Auto-check and optionally start internal VinceZone gateway server
async function ensureGatewayRunning() {
  const alreadyRunning = await isServerOnline();
  if (alreadyRunning) {
    console.log(`[VinceZone Desktop] Server already active on ${SERVER_URL}`);
    return true;
  }

  console.log('[VinceZone Desktop] Starting embedded VinceZone server in-process...');
  try {
    const serverScript = path.join(__dirname, '..', 'server.js');
    if (fs.existsSync(serverScript)) {
      require(serverScript);
    }
  } catch (err) {
    console.warn('[VinceZone Desktop] In-process server require notice:', err.message);
    try {
      const serverScript = path.join(__dirname, '..', 'server.js');
      embeddedServerProcess = spawn('node', [serverScript], {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe',
        windowsHide: true,
        env: { ...process.env, PORT: SERVER_PORT }
      });
    } catch (e2) {}
  }

  return await waitForServer();
}

function createApplicationMenu() {
  const template = [
    {
      label: 'Tệp (File)',
      submenu: [
        {
          label: 'Mở Thư Mục Dự Án (Open Folder)...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const res = await openFolderDialog();
            if (res && mainWindow) {
              mainWindow.webContents.send('workspace:opened', res);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Tải Lại Giao Diện (Reload)',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload()
        },
        {
          label: 'Tải Lại Bỏ Qua Cache (Hard Reload)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache()
        },
        { type: 'separator' },
        {
          label: 'Thoát (Exit)',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Chỉnh Sửa (Edit)',
      submenu: [
        { label: 'Hoàn tác (Undo)', role: 'undo' },
        { label: 'Làm lại (Redo)', role: 'redo' },
        { type: 'separator' },
        { label: 'Cắt (Cut)', role: 'cut' },
        { label: 'Sao chép (Copy)', role: 'copy' },
        { label: 'Dán (Paste)', role: 'paste' },
        { label: 'Chọn tất cả (Select All)', role: 'selectAll' }
      ]
    },
    {
      label: 'Hiển Thị (View)',
      submenu: [
        { label: 'Toàn Màn Hình (Toggle Fullscreen)', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Phóng to (Zoom In)', role: 'zoomIn' },
        { label: 'Thu nhỏ (Zoom Out)', role: 'zoomOut' },
        { label: 'Kích thước chuẩn (Reset Zoom)', role: 'resetZoom' },
        { type: 'separator' },
        {
          label: 'Công Cụ Nhà Phát Triển (DevTools)',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Cửa Sổ (Window)',
      submenu: [
        { label: 'Thu nhỏ (Minimize)', role: 'minimize' },
        { label: 'Đóng (Close)', role: 'close' }
      ]
    },
    {
      label: 'Trợ Giúp (Help)',
      submenu: [
        {
          label: 'Về VinceZone Studio [Desktop Edition]',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'VinceZone Studio',
              message: 'VinceZone AI Workplay & Autonomous IDE',
              detail: 'Phiên bản Desktop v1.0.0\nTích hợp Hội đồng Agent AI chuyên biệt, Terminal PowerShell/CMD và Quản lý Đa dự án.\n\nTác giả: VinceZone Team'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#09090b',
    title: 'VinceZone Studio - AI Workplay & Autonomous IDE [Desktop]',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  createApplicationMenu();

  // Load splash screen first
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));

  // Ensure gateway is running then navigate to full application
  ensureGatewayRunning().then((isOnline) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
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
ipcMain.handle('app:version', () => app.getVersion());

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
