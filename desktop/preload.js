const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vzDesktop', {
  isDesktop: true,
  platform: process.platform,

  // Native Workspace & Folder Picker Dialogs
  openFolderDialog: () => ipcRenderer.invoke('workspace:open-dialog'),
  openFileDialog: (filter) => ipcRenderer.invoke('workspace:open-file-dialog', filter),
  readTree: (dirPath) => ipcRenderer.invoke('workspace:read-tree', dirPath),

  // Native File Operations
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  createFile: (filePath, isDir) => ipcRenderer.invoke('file:create', filePath, isDir),
  deleteItem: (filePath) => ipcRenderer.invoke('file:delete', filePath),

  // Integrated Terminal (PowerShell / CMD)
  runCommand: (command, shell) => ipcRenderer.invoke('terminal:exec', command, shell),

  // AI Agent Engine
  startAgent: (taskPrompt, options) => ipcRenderer.invoke('agent:start', taskPrompt, options),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  onAgentEvent: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('agent:event', subscription);
    return () => ipcRenderer.removeListener('agent:event', subscription);
  },

  // Gateway status check
  getGatewayStatus: () => ipcRenderer.invoke('gateway:status'),
  getServerUrl: () => ipcRenderer.invoke('server:get-url'),
  getServerPort: () => ipcRenderer.invoke('server:get-port'),

  // Window Controls & Info
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowState: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('window:state-changed', handler);
    return () => ipcRenderer.removeListener('window:state-changed', handler);
  },
  getAppVersion: () => ipcRenderer.invoke('app:version')
});
