const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mc', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Versions
  getVersions: () => ipcRenderer.invoke('get-versions'),

  // Accounts
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  addOfflineAccount: (username) => ipcRenderer.invoke('add-offline-account', username),
  removeAccount: (id) => ipcRenderer.invoke('remove-account', id),
  msLogin: () => ipcRenderer.invoke('ms-login'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),

  // Launch
  launchGame: (opts) => ipcRenderer.invoke('launch-game', opts),

  // App info & updates
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Events
  on: (channel, fn) => {
    const allowed = [
      'launch-log', 'launch-progress', 'launch-closed',
      'update-available', 'update-not-available',
      'update-progress', 'update-downloaded', 'update-error',
    ];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_, data) => fn(data));
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
});
