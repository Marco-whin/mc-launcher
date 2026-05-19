// ── State ──────────────────────────────────────────────────────────────────────
let allVersions = [];
let currentFilter = 'release';
let accounts = [];
let selectedAccountId = null;
let selectedVersion = null;
let launching = false;
let settings = {};

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  await loadAccounts();
  await loadVersions();
  setupLaunchEvents();
  setupUpdateEvents();
  // Show app version in titlebar
  const v = await mc.getAppVersion().catch(() => '1.0.0');
  document.getElementById('tb-version').textContent = `v${v}`;
}

// ── Auto-Updater ───────────────────────────────────────────────────────────────
function setupUpdateEvents() {
  mc.on('update-available', (info) => {
    const banner = document.getElementById('update-banner');
    document.getElementById('upd-text').innerHTML =
      `🆕 Update verfügbar: <strong>v${info.version}</strong> — Jetzt herunterladen?`;
    document.getElementById('upd-btn-download').style.display = 'inline-flex';
    banner.classList.add('visible');
  });

  mc.on('update-not-available', () => {
    // Nur zeigen wenn der User manuell geprüft hat
    if (manualUpdateCheck) {
      toast('Du hast die neueste Version ✓', 'success');
      manualUpdateCheck = false;
    }
  });

  mc.on('update-progress', (data) => {
    document.getElementById('upd-btn-download').style.display = 'none';
    document.getElementById('upd-prog-bg').style.display = 'block';
    document.getElementById('upd-pct').style.display = 'inline';
    document.getElementById('upd-prog-fill').style.width = data.percent + '%';
    document.getElementById('upd-pct').textContent = `${data.percent}%`;
    const mb = (data.transferred / 1024 / 1024).toFixed(1);
    const total = (data.total / 1024 / 1024).toFixed(1);
    document.getElementById('upd-text').textContent = `⬇ Update wird heruntergeladen… ${mb} / ${total} MB`;
  });

  mc.on('update-downloaded', () => {
    document.getElementById('upd-prog-bg').style.display = 'none';
    document.getElementById('upd-pct').style.display = 'none';
    document.getElementById('upd-text').innerHTML = '✅ Update bereit! Launcher neu starten um zu installieren.';
    document.getElementById('upd-btn-install').style.display = 'inline-flex';
  });

  mc.on('update-error', (msg) => {
    document.getElementById('upd-text').textContent = `⚠ Update-Fehler: ${msg}`;
    document.getElementById('upd-btn-download').style.display = 'none';
  });
}

let manualUpdateCheck = false;

function startUpdateDownload() {
  document.getElementById('upd-btn-download').style.display = 'none';
  mc.downloadUpdate();
}

function installUpdate() {
  mc.installUpdate();
}

function dismissUpdate() {
  document.getElementById('update-banner').classList.remove('visible');
}

async function checkUpdateManually() {
  manualUpdateCheck = true;
  toast('Suche nach Updates…', 'info');
  await mc.checkForUpdates();
}
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${id}`).classList.add('active');
  if (btn) btn.classList.add('active');
}

// ── Versions ───────────────────────────────────────────────────────────────────
async function loadVersions() {
  const sel = document.getElementById('version-select');
  sel.innerHTML = '<option>Lade Versionen…</option>';

  const res = await mc.getVersions();
  if (res.error) {
    toast('Versionen konnten nicht geladen werden: ' + res.error, 'error');
    return;
  }

  allVersions = res.versions;
  renderVersions();

  // Pre-select latest release
  if (res.latest && res.latest.release) {
    const opt = sel.querySelector(`option[value="${res.latest.release}"]`);
    if (opt) {
      sel.value = res.latest.release;
      selectedVersion = res.latest.release;
      updateHero(res.latest.release);
    }
  }
}

function renderVersions() {
  const sel = document.getElementById('version-select');
  const filtered = allVersions.filter(v => currentFilter === 'all' ? true : v.type === currentFilter);

  sel.innerHTML = filtered.map(v => {
    const date = new Date(v.releaseTime).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
    return `<option value="${v.id}">${v.id}  (${date})</option>`;
  }).join('');

  if (filtered.length > 0) {
    const first = filtered[0].id;
    sel.value = first;
    selectedVersion = first;
    updateHero(first);
  }
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderVersions();
}

function onVersionChange(id) {
  selectedVersion = id;
  updateHero(id);
}

function updateHero(id) {
  const v = allVersions.find(x => x.id === id);
  document.getElementById('hero-ver').textContent = id;
  document.getElementById('hero-type').textContent = v ? ({
    release: '🟢 Stabile Version',
    snapshot: '🟡 Snapshot (experimentell)',
    old_beta: '🔵 Beta',
    old_alpha: '🔴 Alpha',
  }[v.type] || v.type) : '';
}

// ── Accounts ───────────────────────────────────────────────────────────────────
async function loadAccounts() {
  accounts = await mc.getAccounts();
  const savedActive = settings.activeAccountId;
  if (savedActive && accounts.find(a => a.id === savedActive)) {
    selectedAccountId = savedActive;
  } else if (accounts.length > 0) {
    selectedAccountId = accounts[0].id;
  }
  renderAccounts();
  updateSidebarAccount();
  updateLaunchHint();
}

function renderAccounts() {
  const grid = document.getElementById('accounts-grid');
  if (accounts.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">👤</div>Noch keine Accounts.<br>Füge einen Microsoft- oder Offline-Account hinzu.</div>';
    return;
  }
  grid.innerHTML = accounts.map(a => `
    <div class="account-card ${a.id === selectedAccountId ? 'selected' : ''}"
         onclick="selectAccount('${a.id}')">
      <div class="account-avatar">${a.type === 'microsoft' ? '🪟' : '⚙️'}</div>
      <div class="account-info">
        <div class="account-name">${escHtml(a.username)}</div>
        <div class="account-meta">${a.type === 'microsoft' ? 'Microsoft' : 'Offline'} · ${a.uuid.slice(0,8)}…</div>
      </div>
      <button class="account-del" title="Entfernen"
        onclick="event.stopPropagation(); removeAccount('${a.id}')">✕</button>
    </div>
  `).join('');
}

function selectAccount(id) {
  selectedAccountId = id;
  renderAccounts();
  updateSidebarAccount();
  updateLaunchHint();
  saveSettingsPartial({ activeAccountId: id });
}

function updateSidebarAccount() {
  const acc = accounts.find(a => a.id === selectedAccountId);
  document.getElementById('sb-acc-name').textContent = acc ? acc.username : 'Kein Account';
  document.getElementById('sb-acc-type').textContent = acc ? (acc.type === 'microsoft' ? '🪟 Microsoft' : '⚙️ Offline') : '–';
}

async function msLogin() {
  toast('Microsoft-Login öffnet sich…', 'info');
  const result = await mc.msLogin();
  if (result.error) {
    toast('Login fehlgeschlagen: ' + result.error, 'error');
    return;
  }
  toast(`Willkommen, ${result.username}!`, 'success');
  await loadAccounts();
  selectAccount(result.id);
}

async function addOffline() {
  const input = document.getElementById('offline-name');
  const username = input.value.trim();
  if (!username || username.length < 3) {
    toast('Benutzername muss mind. 3 Zeichen haben', 'error');
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    toast('Nur Buchstaben, Zahlen und _ erlaubt', 'error');
    return;
  }
  const result = await mc.addOfflineAccount(username);
  if (result.error) {
    toast(result.error, 'error');
    return;
  }
  input.value = '';
  toast(`Offline-Account "${username}" hinzugefügt`, 'success');
  await loadAccounts();
  selectAccount(result.id);
}

async function removeAccount(id) {
  await mc.removeAccount(id);
  if (selectedAccountId === id) selectedAccountId = null;
  await loadAccounts();
  toast('Account entfernt', 'info');
}

// ── Settings ───────────────────────────────────────────────────────────────────
async function loadSettings() {
  settings = await mc.getSettings();
  document.getElementById('s-java').value = settings.javaPath || 'java';
  document.getElementById('s-gamedir').value = settings.gameDir || '';
  document.getElementById('s-ram').value = settings.ram || 2048;
  document.getElementById('s-ram-slider').value = settings.ram || 2048;
  document.getElementById('s-clientid').value = settings.msClientId || '';
}

async function saveSettings() {
  const newSettings = {
    javaPath: document.getElementById('s-java').value || 'java',
    gameDir: document.getElementById('s-gamedir').value,
    ram: parseInt(document.getElementById('s-ram').value) || 2048,
    msClientId: document.getElementById('s-clientid').value,
    activeAccountId: selectedAccountId,
  };
  await mc.saveSettings(newSettings);
  settings = newSettings;
  toast('Einstellungen gespeichert ✓', 'success');
}

async function saveSettingsPartial(partial) {
  const updated = { ...settings, ...partial };
  await mc.saveSettings(updated);
  settings = updated;
}

// ── Launch ─────────────────────────────────────────────────────────────────────
function updateLaunchHint() {
  const hint = document.getElementById('launch-hint');
  const btn = document.getElementById('launch-btn');
  const acc = accounts.find(a => a.id === selectedAccountId);
  if (!acc) {
    hint.textContent = '⚠ Kein Account ausgewählt';
    btn.disabled = true;
  } else if (!selectedVersion) {
    hint.textContent = '⚠ Keine Version ausgewählt';
    btn.disabled = true;
  } else {
    hint.textContent = `Als ${acc.username} spielen`;
    btn.disabled = false;
  }
}

async function launchGame() {
  if (launching) return;
  if (!selectedAccountId || !selectedVersion) {
    toast('Kein Account oder Version gewählt!', 'error');
    return;
  }

  launching = true;
  const btn = document.getElementById('launch-btn');
  btn.innerHTML = '<span class="spin">⟳</span> &nbsp;Starte…';
  btn.disabled = true;

  const progressWrap = document.getElementById('launch-progress-wrap');
  progressWrap.classList.add('visible');
  document.getElementById('prog-task').textContent = 'Vorbereitung…';
  document.getElementById('prog-bar').style.width = '0%';
  document.getElementById('prog-pct').textContent = '0%';
  document.getElementById('console-log').textContent = '';

  const result = await mc.launchGame({ versionId: selectedVersion, accountId: selectedAccountId });

  if (result.error) {
    toast('Fehler: ' + result.error, 'error');
    launching = false;
    btn.innerHTML = '▶ &nbsp;Spielen';
    btn.disabled = false;
    progressWrap.classList.remove('visible');
  }
}

function setupLaunchEvents() {
  mc.on('launch-progress', (data) => {
    const pct = data.total ? Math.round((data.current / data.total) * 100) : 0;
    document.getElementById('prog-task').textContent = data.task || 'Herunterladen…';
    document.getElementById('prog-bar').style.width = pct + '%';
    document.getElementById('prog-pct').textContent = pct + '%';
  });

  mc.on('launch-log', (data) => {
    const log = document.getElementById('console-log');
    log.textContent = (data.msg || '').slice(0, 200);
    log.scrollTop = log.scrollHeight;
  });

  mc.on('launch-closed', (code) => {
    launching = false;
    const btn = document.getElementById('launch-btn');
    btn.innerHTML = '▶ &nbsp;Spielen';
    btn.disabled = false;
    document.getElementById('launch-progress-wrap').classList.remove('visible');
    toast(code === 0 ? 'Minecraft beendet ✓' : `Minecraft beendet (Code ${code})`, code === 0 ? 'success' : 'warn');
    updateLaunchHint();
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Boot ───────────────────────────────────────────────────────────────────────
init();
