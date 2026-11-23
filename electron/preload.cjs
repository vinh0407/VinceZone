const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vincezoneDesktop', {
  isDesktop: true,
  port: Number(process.env.PORT || 40704),
  openDirectory: () => ipcRenderer.invoke('vincezone:openDirectory'),
  onMenuAction: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('vincezone:menu', listener)
    return () => ipcRenderer.removeListener('vincezone:menu', listener)
  },
})
