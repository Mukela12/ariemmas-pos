// postinstall: rebuild native modules (better-sqlite3) for Electron's ABI so the
// desktop app works. This is ONLY needed for the desktop build — the Railway
// server uses Postgres and never loads Electron or better-sqlite3, and running
// electron-builder on Railway's headless Linux builder hangs/fails the build.
// So skip it on Railway/CI; local + the desktop release build still run it.
// RAILWAY_* vars aren't reliably injected during Railway's *build* phase, so we
// also key off ELECTRON_SKIP_BINARY_DOWNLOAD — set as a build variable on the
// Railway service. When Electron's binary download is skipped, running
// electron-builder here would fail anyway (it needs Electron), so skip it.
const onRailway = Object.keys(process.env).some((k) => k.startsWith('RAILWAY_'))
const skip =
  onRailway ||
  process.env.ELECTRON_SKIP_BINARY_DOWNLOAD ||
  process.env.SKIP_ELECTRON_REBUILD

if (skip) {
  console.log('[postinstall] server/CI build detected — skipping electron-builder install-app-deps')
  process.exit(0)
}

const { execSync } = require('child_process')
execSync('electron-builder install-app-deps', { stdio: 'inherit' })
