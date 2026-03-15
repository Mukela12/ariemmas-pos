# Development Setup Guide

## 1. Prerequisites

### Required Software

| Software | Version | Purpose | Install |
|----------|---------|---------|---------|
| Node.js | 20 LTS+ | Runtime | `brew install node` or [nodejs.org](https://nodejs.org) |
| npm | 10+ | Package manager | Comes with Node.js |
| Git | Latest | Version control | `brew install git` |
| Docker Desktop | Latest | SQL Server on macOS | [docker.com](https://docker.com) |
| VS Code | Latest | Code editor | [code.visualstudio.com](https://code.visualstudio.com) |

### Optional (for Windows Testing)

| Software | Purpose | Install |
|----------|---------|---------|
| UTM | Run Windows VM on macOS | `brew install --cask utm` |
| Wine | Build Windows .exe on macOS | `brew install --cask wine-stable` |
| Parallels | Faster Windows VM (paid) | [parallels.com](https://parallels.com) |

### VS Code Extensions

```
# Recommended extensions
dbaeumer.vscode-eslint
esbenp.prettier-vscode
bradlc.vscode-tailwindcss
ms-vscode.vscode-typescript-next
```

## 2. Project Setup

### Clone and Install

```bash
cd ~/ariemmas-pos
git init
npm init -y

# Install Electron + Vite tooling
npm install -D electron electron-builder electron-vite
npm install -D vite @vitejs/plugin-react

# Install React + TypeScript
npm install react react-dom react-router-dom
npm install -D typescript @types/react @types/react-dom @types/node

# Install Tailwind CSS
npm install -D tailwindcss @tailwindcss/vite

# Install SQLite
npm install better-sqlite3
npm install -D @types/better-sqlite3

# Install state management
npm install zustand

# Install hardware libraries
npm install node-thermal-printer
npm install -D @types/node-thermal-printer

# Install utilities
npm install uuid bcrypt dayjs
npm install -D @types/uuid @types/bcrypt

# Install SQL Server driver (for production mode)
npm install mssql
npm install -D @types/mssql
```

### Project Configuration Files

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**electron.vite.config.ts:**
```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
      },
    },
  },
});
```

## 3. SQL Server Setup (macOS Development)

### Using Docker

```bash
# Pull SQL Server 2022 image (works on Apple Silicon via Rosetta)
docker pull mcr.microsoft.com/mssql/server:2022-latest

# Start SQL Server container
docker run --platform linux/amd64 \
  -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=P0S_Dev_2026!" \
  -p 1433:1433 \
  --name ariemmas-sqlserver \
  -v ariemmas-sql-data:/var/opt/mssql \
  -d mcr.microsoft.com/mssql/server:2022-latest

# Verify it's running
docker ps

# Check logs if issues
docker logs ariemmas-sqlserver
```

### Database Management

Install **Azure Data Studio** (free, works on macOS):
```bash
brew install --cask azure-data-studio
```

Connection settings:
```
Server: localhost,1433
Authentication: SQL Login
User: sa
Password: P0S_Dev_2026!
```

Create the development database:
```sql
CREATE DATABASE AriemmasPOS;
GO
```

### Useful Docker Commands

```bash
# Start (if stopped)
docker start ariemmas-sqlserver

# Stop
docker stop ariemmas-sqlserver

# View logs
docker logs --tail 50 ariemmas-sqlserver

# Connect via CLI
docker exec -it ariemmas-sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P 'P0S_Dev_2026!' -C
```

## 4. SQLite (Default Development Database)

For day-to-day development, SQLite is the default — no Docker needed:

```bash
# The app creates pos.db automatically on first run
# Located at: ~/Library/Application Support/ariemmas-pos/pos.db

# To inspect manually:
brew install sqlite
sqlite3 ~/Library/Application\ Support/ariemmas-pos/pos.db
```

## 5. Environment Variables

Create `.env` file (never commit this):

```bash
# .env
NODE_ENV=development

# Database mode: 'sqlite' or 'mssql'
DB_MODE=sqlite

# SQL Server (only needed if DB_MODE=mssql)
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_USER=sa
MSSQL_PASSWORD=P0S_Dev_2026!
MSSQL_DATABASE=AriemmasPOS

# Printer (leave empty to disable during dev)
PRINTER_INTERFACE=
PRINTER_ENABLED=false

# ZRA (Phase 2)
ZRA_API_URL=
ZRA_API_KEY=
ZRA_DEVICE_ID=
```

Create `.env.example` (committed to repo) with the same structure but no real values.

## 6. Running in Development

```bash
# Start the app in dev mode (hot reload)
npm run dev

# This starts:
# - Electron main process (watches for changes)
# - Vite dev server for React renderer (HMR)
# - SQLite database auto-created if not exists
```

### Simulating Hardware in Development

Since you don't have a receipt printer or cash drawer on your Mac:

**Receipt Printer:** Set `PRINTER_ENABLED=false` in `.env`. Receipts will be logged to console and saved as text files in a `dev-receipts/` folder.

**Barcode Scanner:** Type barcodes manually in the search field, or use the keyboard to simulate scanner input.

**Cash Drawer:** Drawer-open events are logged to console. No physical action.

## 7. Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --grep "sale"
```

### Test Data

The seed script populates test products:

```bash
# Seed sample products and users
npm run seed

# This creates:
# - Admin user (admin / 1234)
# - Test cashier (mary / 5678)
# - 50 sample products with barcodes
# - Sample categories (Groceries, Meat, Clothing, Household)
```

## 8. Building for Windows

### From macOS (requires Wine)

```bash
# Install Wine (one-time)
brew install --cask wine-stable

# Build Windows installer
npm run build:win

# Output: dist/AriemmasPOS-Setup-{version}.exe
```

### Via GitHub Actions (recommended)

Push a version tag to trigger CI build:

```bash
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions builds the .exe
# Download from GitHub Releases page
```

## 9. Project Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `electron-vite dev` | Start in development mode |
| `npm run build` | `electron-vite build` | Build for production |
| `npm run build:win` | `electron-vite build && electron-builder --win` | Build Windows installer |
| `npm run build:mac` | `electron-vite build && electron-builder --mac` | Build macOS app |
| `npm run seed` | `tsx scripts/seed-products.ts` | Seed test data |
| `npm test` | `vitest` | Run tests |
| `npm run test:watch` | `vitest --watch` | Tests in watch mode |
| `npm run lint` | `eslint src/` | Lint code |
| `npm run typecheck` | `tsc --noEmit` | Type check |

## 10. Git Workflow

```bash
# Branch naming
main              # production releases
develop           # integration branch
feature/pos-sale  # feature branches
fix/printer-bug   # bug fix branches

# Commit messages
feat: add barcode scanner input detection
fix: receipt total calculation rounding error
docs: update hardware integration guide
```

`.gitignore`:
```
node_modules/
dist/
out/
*.db
*.db-wal
*.db-shm
.env
dev-receipts/
```
