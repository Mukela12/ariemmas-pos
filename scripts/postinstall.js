// postinstall: rebuild native modules (better-sqlite3) for Electron's ABI so the
// desktop app works. This is ONLY needed for the desktop build — the Railway
// server uses Postgres and never loads Electron or better-sqlite3, and running
// electron-builder on Railway's headless Linux builder hangs/fails the build.
// So skip it on Railway/CI; local + the desktop release build still run it.
const onRailway = Object.keys(process.env).some((k) => k.startsWith('RAILWAY_'))
const skip = onRailway || process.env.SKIP_ELECTRON_REBUILD

if (skip) {
  console.log('[postinstall] Railway/CI detected — skipping electron-builder install-app-deps')
  process.exit(0)
}

const { execSync } = require('child_process')
execSync('electron-builder install-app-deps', { stdio: 'inherit' })
