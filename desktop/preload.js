const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vzDesktop', {
  // Workspace management
  openFolderDialog: () => ipcRenderer.invoke('workspace:open-dialog'),
  readTree: (dirPath) => ipcRenderer.invoke('workspace:read-tree', dirPath),
  
  // File operations
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

  // Gateway connection
  getGatewayStatus: () => ipcRenderer.invoke('gateway:status')
});
