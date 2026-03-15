# Deployment Guide

## 1. Overview

The POS app is developed on macOS and deployed to a Windows PC at the shop. The deployment produces a single `.exe` installer that sets up everything.

```
┌─────────────┐   electron-builder   ┌─────────────────┐   install   ┌──────────────┐
│  macOS Dev  │ ─────────────────► │  .exe Installer  │ ──────────► │  Windows PC  │
│  Machine    │   (or GitHub CI)     │  (NSIS format)   │            │  at Shop     │
└─────────────┘                      └─────────────────┘            └──────────────┘
```

## 2. Build Configuration

### electron-builder.yml

```yaml
appId: com.ariemmas.pos
productName: Ariemmas POS
copyright: Copyright 2026 Mukela Katungu

directories:
  output: dist
  buildResources: assets

files:
  - "!docs/**/*"
  - "!reference/**/*"
  - "!scripts/**/*"
  - "!.env*"

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: assets/icon.ico
  artifactName: "AriemmasPOS-Setup-${version}.${ext}"

nsis:
  oneClick: false
  perMachine: true
  allowToChangeInstallationDirectory: true
  installerIcon: assets/icon.ico
  uninstallerIcon: assets/icon.ico
  installerHeaderIcon: assets/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Ariemmas POS
  license: null

mac:
  target:
    - target: dmg
      arch:
        - arm64
        - x64
  icon: assets/icon.png
  category: public.app-category.business

publish:
  provider: github
  owner: mukelakatungu
  repo: ariemmas-pos
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac",
    "build:linux": "npm run build && electron-builder --linux",
    "postinstall": "electron-builder install-app-deps"
  }
}
```

## 3. Building for Windows from macOS

### Option A: Local Build (Quick)

```bash
# Install Wine (needed to build Windows .exe on macOS)
brew install --cask wine-stable

# Build
npm run build:win

# Output: dist/AriemmasPOS-Setup-1.0.0.exe
```

**Note:** Wine on Apple Silicon (M1/M2/M3) can be slow. Use GitHub Actions for production builds.

### Option B: GitHub Actions CI/CD (Recommended for Releases)

```yaml
# .github/workflows/build.yml
name: Build & Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build:win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ariemmas-pos-windows
          path: dist/*.exe

  release:
    needs: build-windows
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/')
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          files: ariemmas-pos-windows/*.exe
          draft: false
          prerelease: false
```

**To release:**
```bash
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions builds the .exe and creates a release
```

## 4. Auto-Update

The app checks for updates on startup using `electron-updater`:

```typescript
// src/main/updater.ts
import { autoUpdater } from 'electron-updater';

export function initAutoUpdater() {
  autoUpdater.autoDownload = false;  // ask user first

  autoUpdater.on('update-available', (info) => {
    // Notify renderer: "Update available (v1.1.0). Download?"
    mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', () => {
    // Notify renderer: "Update ready. Restart to apply?"
    mainWindow.webContents.send('update-downloaded');
  });

  // Check on startup (with 10-second delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 10000);
}
```

Updates are downloaded from GitHub Releases automatically. The shop PC just needs internet when an update is available.

## 5. Windows Installation Procedure

### Pre-Install (One-Time Setup)

1. **Windows PC Requirements:**
   - Windows 10 or 11 (64-bit)
   - 4GB RAM minimum (8GB recommended)
   - 500MB free disk space
   - 2+ USB ports (scanner + printer)

2. **Install SQL Server Express (if using SQL Server):**
   - Download SQL Server 2022 Express from Microsoft
   - Run installer → Choose "Basic" → Accept defaults
   - Note the connection string: `Server=localhost\SQLEXPRESS`
   - Install SSMS (SQL Server Management Studio) for administration

3. **Install Printer Driver:**
   - Download USB driver from printer manufacturer website
   - For Xprinter: download from xprinter.net → Support → Downloads
   - Install driver, plug in printer, verify it appears in Devices & Printers

### Install the POS App

1. Copy `AriemmasPOS-Setup-1.0.0.exe` to the PC (USB drive or download)
2. Run the installer → Choose install location → Click Install
3. Desktop shortcut "Ariemmas POS" is created
4. Launch the app

### First Run Configuration

On first launch, the app will:
1. Create the SQLite database with default schema
2. Create default admin user (username: `admin`, PIN: `1234`)
3. Show a setup wizard:
   - Confirm shop details (name, address, phone)
   - Enter TIN (Tax Identification Number)
   - Configure printer (auto-detect or manual port selection)
   - Test print a sample receipt
   - Test cash drawer open
   - Change admin PIN
4. Ready for use

### Post-Install Checklist

- [ ] Printer test page prints correctly
- [ ] Cash drawer opens on command
- [ ] Barcode scanner scans into the POS sale screen
- [ ] Admin user can log in
- [ ] Created cashier accounts for staff
- [ ] Entered initial product catalog (manually or CSV import)
- [ ] Set correct VAT rate (16%)
- [ ] Configured backup location (local + USB)
- [ ] Connected UPS and verified battery backup works
- [ ] Trained cashier on basic sale flow

## 6. Offline Deployment

Since internet at the shop may be unreliable, the entire deployment can be done offline:

1. Build the `.exe` on your Mac
2. Copy to a USB drive
3. Bring USB to the shop
4. Install from USB
5. All subsequent use is fully offline

Updates can also be delivered via USB if internet is not available:
1. Build new version on your Mac
2. Copy `.exe` to USB
3. Run installer on shop PC (overwrites previous version, database is preserved)

## 7. Database Location

| OS | Database Path |
|----|--------------|
| Windows | `C:\Users\{user}\AppData\Roaming\ariemmas-pos\pos.db` |
| macOS (dev) | `~/Library/Application Support/ariemmas-pos/pos.db` |

Backups are stored alongside:
```
C:\Users\{user}\AppData\Roaming\ariemmas-pos\
├── pos.db                          # Main database
├── pos.db-wal                      # WAL journal
├── pos.db-shm                      # Shared memory
└── backups/
    ├── pos_20260313_180000.db      # Daily backups
    ├── pos_20260314_180000.db
    └── ...
```

## 8. Troubleshooting

| Issue | Solution |
|-------|----------|
| App won't start | Check Windows Event Viewer for errors. Try running as Administrator. |
| "Database locked" error | Close any other programs accessing the DB. Restart the app. |
| Printer not found | Reinstall printer USB driver. Check Devices & Printers. |
| Scanner not working | Unplug and replug USB. Test in Notepad first. |
| Slow performance | Check available RAM. Close unnecessary programs. |
| Update failed | Download `.exe` manually and reinstall. Database is preserved. |
| Power outage recovery | App auto-recovers draft sales on restart. Check UPS battery. |

## 9. Remote Support

For remote maintenance from your Mac:

- **TeamViewer** or **AnyDesk** — install on the shop PC for remote desktop access
- **ngrok** or **Tailscale** — for secure tunnel to the shop PC if needed
- Requires internet at the shop (mobile hotspot is sufficient)
