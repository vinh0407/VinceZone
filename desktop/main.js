const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const AgentEngine = require('./agent-engine');

let mainWindow = null;
let currentWorkspace = null;
let activeAgent = null;
let embeddedServerProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#09090b',
    title: 'VinceZone Studio - Autonomous AI Agent IDE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (activeAgent) {
      activeAgent.stop();
    }
  });
}

// Auto-check and optionally start internal VinceZone gateway server
async function ensureGatewayRunning() {
  try {
    const res = await fetch('http://localhost:3000/api/providers');
    if (res.ok) {
      return true;
    }
  } catch (e) {
    // Start server.js in background
    const serverScript = path.join(__dirname, '..', 'server.js');
    if (fs.existsSync(serverScript)) {
      embeddedServerProcess = spawn('node', [serverScript], {
        cwd: path.join(__dirname, '..'),
        stdio: 'ignore',
        windowsHide: true
      });
    }
  }
  return true;
}

// ---------------- IPC HANDLERS ----------------

// Workspace: Open Native Directory Dialog
ipcMain.handle('workspace:open-dialog', async () => {
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
});

// Workspace: Recursive Tree Listing
function getDirectoryTree(dirPath, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dirPath)) return [];
  
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

  // Sort: directories first, then files alphabetically
  return tree.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

ipcMain.handle('workspace:read-tree', async (event, dirPath) => {
  const targetDir = dirPath || currentWorkspace;
  if (!targetDir || !fs.existsSync(targetDir)) return [];
  return getDirectoryTree(targetDir);
});

// File Operations
ipcMain.handle('file:read', async (event, filePath) => {
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace, filePath);
  if (!fs.existsSync(full)) {
    throw new Error(`File không tồn tại: ${filePath}`);
  }
  return fs.readFileSync(full, 'utf8');
});

ipcMain.handle('file:save', async (event, filePath, content) => {
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace, filePath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(full, content, 'utf8');
  return { success: true, path: full };
});

ipcMain.handle('file:create', async (event, filePath, isDir) => {
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace, filePath);
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
  const full = path.isAbsolute(filePath) ? filePath : path.resolve(currentWorkspace, filePath);
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

  activeAgent = new AgentEngine(currentWorkspace, {
    gatewayUrl: options.gatewayUrl || 'http://localhost:3000/v1/chat/completions',
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
    const res = await fetch('http://localhost:3000/api/providers');
    if (res.ok) {
      const providers = await res.json();
      return { online: true, providers };
    }
  } catch (e) {}
  return { online: false, providers: [] };
});

// App lifecycle
app.whenReady().then(async () => {
  await ensureGatewayRunning();
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
