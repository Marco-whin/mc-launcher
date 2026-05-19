const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { Client, Authenticator } = require('minecraft-launcher-core');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// ─── Auto-Updater Config ──────────────────────────────────────────────────────
autoUpdater.autoDownload = false;      // User soll zuerst gefragt werden
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  if (!mainWindow) return;
  mainWindow.webContents.send('update-available', {
    version: info.version,
    releaseDate: info.releaseDate,
  });
});

autoUpdater.on('update-not-available', () => {
  if (mainWindow) mainWindow.webContents.send('update-not-available');
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) mainWindow.webContents.send('update-progress', {
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
    speed: progress.bytesPerSecond,
  });
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded');
});

autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('update-error', err.message);
});

// IPC: Renderer kann Updates anstoßen
ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall(false, true));
ipcMain.handle('get-app-version', () => app.getVersion());

const store = new Store();
const launcher = new Client();

let mainWindow;

// ─── Microsoft OAuth Config ───────────────────────────────────────────────────
// You need to register an Azure App at https://portal.azure.com
// and paste your Client ID here. Redirect URI must be: https://login.microsoftonline.com/common/oauth2/nativeclient
const MS_CLIENT_ID = store.get('ms_client_id', 'YOUR_AZURE_CLIENT_ID');

const MS_AUTH_URL =
  `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize` +
  `?client_id=${MS_CLIENT_ID}` +
  `&response_type=code` +
  `&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient` +
  `&scope=XboxLive.signin%20offline_access` +
  `&prompt=select_account`;

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 900,
    minHeight: 580,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();
  // Update-Check 3 Sekunden nach Start (nicht im Dev-Modus)
  if (!process.argv.includes('--dev')) {
    setTimeout(() => autoUpdater.checkForUpdates(), 3000);
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── Window Controls ──────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

// ─── Mojang Version Manifest ──────────────────────────────────────────────────
ipcMain.handle('get-versions', async () => {
  try {
    const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    const data = await res.json();
    return {
      latest: data.latest,
      versions: data.versions.map(v => ({
        id: v.id,
        type: v.type,
        releaseTime: v.releaseTime,
      })),
    };
  } catch (e) {
    return { error: e.message };
  }
});

// ─── Account Management ───────────────────────────────────────────────────────
ipcMain.handle('get-accounts', () => store.get('accounts', []));

ipcMain.handle('add-offline-account', (_, username) => {
  const accounts = store.get('accounts', []);
  const existing = accounts.find(a => a.username === username && a.type === 'offline');
  if (existing) return { error: 'Account already exists' };
  const account = {
    id: `offline_${Date.now()}`,
    type: 'offline',
    username,
    uuid: `offline-${username}`,
  };
  accounts.push(account);
  store.set('accounts', accounts);
  return account;
});

ipcMain.handle('remove-account', (_, id) => {
  const accounts = store.get('accounts', []).filter(a => a.id !== id);
  store.set('accounts', accounts);
  return true;
});

ipcMain.handle('ms-login', async () => {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 680,
      parent: mainWindow,
      modal: true,
      webPreferences: { nodeIntegration: false },
    });

    authWindow.loadURL(MS_AUTH_URL);

    authWindow.webContents.on('will-redirect', async (event, url) => {
      if (url.includes('nativeclient') && url.includes('code=')) {
        const code = new URL(url).searchParams.get('code');
        authWindow.close();
        try {
          const profile = await exchangeMsCode(code);
          const accounts = store.get('accounts', []);
          const idx = accounts.findIndex(a => a.uuid === profile.uuid);
          if (idx >= 0) accounts[idx] = profile;
          else accounts.push(profile);
          store.set('accounts', accounts);
          resolve(profile);
        } catch (e) {
          resolve({ error: e.message });
        }
      }
    });

    authWindow.on('closed', () => resolve({ error: 'Login cancelled' }));
  });
});

async function exchangeMsCode(code) {
  // Step 1: MS Token
  const msRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
      scope: 'XboxLive.signin offline_access',
    }),
  });
  const msToken = await msRes.json();

  // Step 2: Xbox Live
  const xblRes = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msToken.access_token}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }),
  });
  const xbl = await xblRes.json();
  const userHash = xbl.DisplayClaims.xui[0].uhs;

  // Step 3: XSTS
  const xstsRes = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    }),
  });
  const xsts = await xstsRes.json();

  // Step 4: MC Token
  const mcRes = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xsts.Token}` }),
  });
  const mc = await mcRes.json();

  // Step 5: MC Profile
  const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}` },
  });
  const profile = await profileRes.json();

  return {
    id: `ms_${profile.id}`,
    type: 'microsoft',
    username: profile.name,
    uuid: profile.id,
    accessToken: mc.access_token,
    refreshToken: msToken.refresh_token,
  };
}

// ─── Settings ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => store.get('settings', {
  javaPath: 'java',
  gameDir: path.join(os.homedir(), '.mc-launcher'),
  ram: 2048,
  activeAccountId: null,
  msClientId: '',
}));

ipcMain.handle('save-settings', (_, settings) => {
  store.set('settings', settings);
  if (settings.msClientId) store.set('ms_client_id', settings.msClientId);
  return true;
});

// ─── Launch Minecraft ─────────────────────────────────────────────────────────
ipcMain.handle('launch-game', async (_, { versionId, accountId }) => {
  const settings = store.get('settings', {});
  const accounts = store.get('accounts', []);
  const account = accounts.find(a => a.id === accountId);

  if (!account) return { error: 'No account selected' };

  const gameDir = settings.gameDir || path.join(os.homedir(), '.mc-launcher');
  fs.mkdirSync(gameDir, { recursive: true });

  let auth;
  if (account.type === 'offline') {
    auth = Authenticator.getAuth(account.username);
  } else {
    auth = {
      access_token: account.accessToken,
      client_token: account.uuid,
      uuid: account.uuid,
      name: account.username,
      user_properties: '{}',
    };
  }

  const opts = {
    authorization: auth,
    root: gameDir,
    version: { number: versionId, type: 'release' },
    memory: {
      max: `${settings.ram || 2048}M`,
      min: `${Math.floor((settings.ram || 2048) / 2)}M`,
    },
    javaPath: settings.javaPath || 'java',
  };

  return new Promise((resolve) => {
    launcher.launch(opts);

    launcher.on('debug', (e) => mainWindow.webContents.send('launch-log', { type: 'debug', msg: e }));
    launcher.on('data', (e) => mainWindow.webContents.send('launch-log', { type: 'data', msg: e }));
    launcher.on('progress', (e) => mainWindow.webContents.send('launch-progress', e));
    launcher.on('download-status', (e) => mainWindow.webContents.send('launch-progress', { task: e.name, total: e.total, current: e.current }));

    launcher.on('close', (code) => {
      mainWindow.webContents.send('launch-closed', code);
      resolve({ success: true, code });
    });

    resolve({ success: true, started: true });
  });
});
