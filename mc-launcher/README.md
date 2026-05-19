# ⛏ MC Launcher — Custom Minecraft Launcher

Ein eigener, moderner Minecraft Launcher mit Electron, Auto-Updater und GitHub Releases.

---

## Features

- ✅ **Microsoft-Login** (OAuth2 via Azure)
- ✅ **Offline-Accounts** (ohne Minecraft-Kauf zum Testen)
- ✅ **Versionsauswahl** — immer aktuell via Mojang API (Release / Snapshot / Beta)
- ✅ **RAM-Einstellung**, eigener Java-Pfad, eigenes Spielverzeichnis
- ✅ **Download-Fortschritt** & Konsolen-Log beim Starten
- ✅ **Auto-Updater** — prüft beim Start auf neue Versionen, lädt & installiert in-App
- ✅ **Installer (.exe)** mit Deinstaller, Desktop-Shortcut, Startmenü-Eintrag
- ✅ **GitHub Actions** — baut automatisch Windows/macOS/Linux bei jedem Tag-Push

---

## Schnellstart (lokal)

```bash
npm install
npm start          # Entwicklung
npm run start:dev  # Mit DevTools
```

---

## GitHub Actions Setup (einmalig)

### 1. Repository erstellen

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/DEIN_NAME/mc-launcher.git
git push -u origin main
```

### 2. GitHub Actions läuft automatisch

Die Datei `.github/workflows/build.yml` ist bereits konfiguriert.
**Kein weiteres Setup nötig** — `GITHUB_TOKEN` ist automatisch verfügbar.

---

## Release veröffentlichen

Jedes Mal wenn du ein **Git-Tag** pushst, baut GitHub Actions automatisch
`.exe`, `.dmg` und `.AppImage` und veröffentlicht sie als GitHub Release:

```bash
# Version erhöhen + Tag setzen
npm version patch   # 1.0.0 → 1.0.1
# oder minor / major

# Tag pushen → Build startet automatisch (~5-10 Min)
git push && git push --tags
```

Nach dem Build erscheint unter **Releases** auf GitHub:
- `MC Launcher Setup 1.0.1.exe` (Windows Installer mit Deinstaller)
- `MC Launcher-1.0.1.dmg` (macOS)
- `MC Launcher-1.0.1.AppImage` (Linux)

---

## Auto-Updater (in-App)

Der Launcher prüft 3 Sekunden nach dem Start automatisch auf neue Versionen.
Wenn ein Update verfügbar ist, erscheint ein grünes Banner:

- **Herunterladen** → lädt die neue Version im Hintergrund
- **Jetzt installieren** → beendet & installiert nach dem Download
- **Später** → Banner schließen

Manuell prüfen: **Einstellungen → Auf Updates prüfen**

> Der Auto-Updater funktioniert nur bei installierten Versionen (nicht im `npm start`-Modus).

---

## Microsoft-Login einrichten

1. [portal.azure.com](https://portal.azure.com) → **App-Registrierungen → Neue Registrierung**
2. Kontotyp: **Persönliche Microsoft-Konten**
3. Redirect URI: `https://login.microsoftonline.com/common/oauth2/nativeclient`
4. **Client-ID** kopieren
5. Im Launcher: **Einstellungen → Azure Client-ID** einfügen & speichern

---

## Projektstruktur

```
mc-launcher/
├── .github/
│   └── workflows/
│       └── build.yml          ← GitHub Actions (Build & Release)
├── src/
│   ├── main/
│   │   ├── main.js            ← Hauptprozess + Minecraft + Auto-Updater
│   │   └── preload.js         ← Sichere IPC-Brücke
│   └── renderer/
│       ├── index.html         ← Launcher-UI
│       └── renderer.js        ← Frontend-Logik + Update-UI
├── resources/
│   ├── icon.ico               ← Windows-Icon (optional, 256×256)
│   ├── icon.icns              ← macOS-Icon (optional)
│   └── icon.png               ← Linux-Icon (optional, 512×512)
├── package.json
└── README.md
```

---

## Icons hinzufügen (optional)

Für ein eigenes Icon: Dateien in `resources/` ablegen.
Kostenloser Konverter: [icoconvert.com](https://icoconvert.com)

---

## Lizenz

MIT 🎮
