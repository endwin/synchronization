import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  selectLocalFolder: () => ipcRenderer.invoke('select-local-folder'),
  testConnection: (nasConfig: any) => ipcRenderer.invoke('test-connection', nasConfig),
  startSync: () => ipcRenderer.invoke('start-sync'),
  onSyncProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('sync-progress', (_event, value) => callback(value));
  },
  onLog: (callback: (logMsg: string) => void) => {
    ipcRenderer.on('sync-log', (_event, value) => callback(value));
  }
});
