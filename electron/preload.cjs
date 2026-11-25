const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vincezoneDesktop', {
  isDesktop: true,
  webviewSupported: true,
  port: 0,
  openDirectory: () => ipcRenderer.invoke('vincezone:openDirectory'),
  openNewWindow: (payload) => ipcRenderer.invoke('vincezone:openNewWindow', payload),
  openExternal: (url) => ipcRenderer.invoke('vincezone:openExternal', url),
  openLogsFolder: () => ipcRenderer.invoke('vincezone:openLogsFolder'),
  downloadUpdate: (url) => ipcRenderer.invoke('vincezone:downloadUpdate', url),
  secrets: {
    isAvailable: () => ipcRenderer.invoke('vincezone:secrets:isAvailable'),
    saveApiKeys: (keyMap) => ipcRenderer.invoke('vincezone:secrets:save', keyMap),
    loadApiKeys: () => ipcRenderer.invoke('vincezone:secrets:load'),
  },
  onMenuAction: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vincezone:menu', listener)
    return () => ipcRenderer.removeListener('vincezone:menu', listener)
  },
})
