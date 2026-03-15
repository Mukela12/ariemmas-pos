# Ariemmas POS System

**Point of Sale software for Ariemmas Shop — Independence Ave, Mongu, Zambia**

---

## Quick Access

| Platform | Link |
|----------|------|
| **Web App** (any browser) | [ariemmas-pos.netlify.app](https://ariemmas-pos.netlify.app) |
| **Windows Installer** (.exe) | [Download v1.0.0](https://github.com/Mukela12/ariemmas-pos/releases/download/v1.0.0/Ariemmas.POS.Setup.1.0.0.exe) |

---

## Table of Contents

- [Default Login](#default-login)
- [Web App (Online)](#web-app-online)
- [Desktop App (Offline + Online)](#desktop-app-offline--online)
- [How Offline Mode Works](#how-offline-mode-works)
- [How Sync Works](#how-sync-works)
- [Daily Workflow](#daily-workflow)
- [Features](#features)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Hardware Setup](#hardware-setup)
- [Developer Setup](#developer-setup)
- [Technical Architecture](#technical-architecture)
- [Environment Variables](#environment-variables)
- [Building & Deploying](#building--deploying)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)

---

## Default Login

| User | Username | PIN | Role |
|------|----------|-----|------|
| Administrator | `admin` | `1234` | Admin (full access) |
| Mary | `mary` | `5678` | Cashier |

> Change PINs after first login for security. After 3 failed PIN attempts, the account locks for 5 minutes.

---

## Web App (Online)

The web app runs in any browser — Chrome, Edge, Firefox, Safari — on any device (phone, tablet, computer).

1. Go to [ariemmas-pos.netlify.app](https://ariemmas-pos.netlify.app)
2. Log in with your username and PIN
3. Start making sales

The web app connects to the cloud database on Railway, so all data is live and shared. You can view reports, export Excel files, and manage products from anywhere with internet.

**What works on web:** Sales, reports, Excel export, product management, shifts, settings.

**What doesn't work on web:** Receipt printing, cash drawer (these need the physical hardware connected to the desktop app).

---

## Desktop App (Offline + Online)

The desktop app is designed for the shop's cash register computer. It works **with or without internet**.

### Installing on Windows

1. Download the installer: [Ariemmas.POS.Setup.1.0.0.exe](https://github.com/Mukela12/ariemmas-pos/releases/download/v1.0.0/Ariemmas.POS.Setup.1.0.0.exe)
2. Run the installer — choose your installation folder or accept the default
3. The installer creates a desktop shortcut and Start menu entry
4. Open **Ariemmas POS** from your desktop
5. Log in with your username and PIN

### First Launch

On first launch, the app creates a local SQLite database on the computer. This database stores everything locally so the app works without internet. It also seeds:

- Default admin and cashier accounts
- 25 sample products across 6 categories (Groceries, Meat & Fish, Beverages, Household, Clothing, Electronics)
- Default settings (shop name, VAT rate, currency, receipt text)

You can edit all of these from the Settings and Products pages.

---

## How Offline Mode Works

The desktop app uses a **local SQLite database** stored on the computer. Every sale, product change, shift, and setting is saved locally first. This means:

- **No internet required** — The app works completely offline. You can make sales, open/close shifts, manage products, and view reports without any internet connection.
- **No data loss** — If the power goes out or the computer crashes, all completed sales are already saved to the local database. The app recovers automatically on restart.
- **Fast performance** — Because everything is local, operations are instant. No waiting for a server response.

### Where is the data stored?

| Situation | Database Location |
|-----------|-------------------|
| Development mode | `ariemmas-pos.db` in the project folder |
| Installed app (production) | `ariemmas-pos.db` in the app's user data folder (e.g. `C:\Users\<name>\AppData\Roaming\Ariemmas POS\`) |

The database is a single `.db` file. You can back it up by simply copying this file.

---

## How Sync Works

When the computer has an internet connection, the desktop app automatically syncs all local data to the cloud database (PostgreSQL on Railway). Here's exactly what happens:

### The Sync Queue

Every time you do something in the app (make a sale, update a product, open a shift, etc.), two things happen:

1. The action is saved to the **local SQLite database** immediately
2. A copy of the action is added to a **sync queue** (a special table called `_sync_queue`)

### Automatic Background Sync

- The app checks for internet connectivity **every 30 seconds**
- If online and there are pending items in the sync queue, it sends them to the cloud server one by one
- Each item is marked as `synced` once the cloud confirms it received the data
- If a sync fails (server error, timeout), it retries up to **5 times** before marking it as `failed`

### What Gets Synced

| Data | Direction | When |
|------|-----------|------|
| Sales + line items | Desktop → Cloud | After every completed sale |
| Product changes | Desktop → Cloud | After create/edit |
| Shift open/close | Desktop → Cloud | After shift changes |
| User accounts | Desktop → Cloud | After new user created |
| Settings changes | Desktop → Cloud | After any setting updated |
| Categories | Desktop → Cloud | After category changes |

### Sync Status Indicator

In the top-right corner of the app, you'll see a sync indicator:

| Icon | Meaning |
|------|---------|
| Cloud icon (teal) | All synced — everything is up to date |
| Spinning arrow (amber) + number | Syncing — number shows pending items |
| Cloud with X (grey) | Offline — will sync when internet returns |

You can click the sync indicator to **force a sync** immediately instead of waiting for the next 30-second cycle.

### What Happens When Internet Returns

1. The app detects the connection is back (via Electron's `net.isOnline()`)
2. On the next 30-second cycle, it picks up all `pending` items from the sync queue
3. Each item is sent to the cloud server at `https://api-production-b925.up.railway.app`
4. The cloud server processes each item idempotently (if the data already exists, it skips it — no duplicates)
5. Successfully synced items are marked as `synced` in the queue
6. The sync indicator updates to show remaining pending items, then goes green when done

### Example Scenario

> Mary opens the shop at 8:00 AM. The internet is down.
>
> She opens a shift, makes 15 sales throughout the morning. All sales are saved locally and added to the sync queue (15 pending items).
>
> At 11:30 AM, the internet comes back. The sync indicator shows "15" with a spinning arrow. Within a minute, all 15 sales sync to the cloud. The indicator turns green.
>
> The shop owner checks the web app from their phone and sees all 15 sales in the reports.
>
> At 2:00 PM, the internet drops again. Mary continues making sales. They queue up locally. When internet returns later, they sync automatically.

---

## Daily Workflow

### Start of Day
1. Turn on the computer, open **Ariemmas POS**
2. Log in with your username and PIN
3. Click the **"No Shift"** indicator (amber, pulsing) in the top bar
4. Count the cash in the drawer and enter the **Opening Cash** amount
5. Click **Open Shift** — the indicator turns green ("Shift Open")

### Making Sales
1. **Scan a barcode** — the product appears in the cart automatically
2. Or press **F1** to search by product name, then click to add
3. Adjust quantities with the **+/-** buttons or type a number
4. When ready, click **Charge K XX.XX** (or press **F12**)
5. Choose **Cash** or **Mobile Money**
6. For cash: enter the amount tendered, the app calculates change
7. For mobile money: enter the transaction reference
8. Click **Complete Sale** — receipt prints, cash drawer opens (if cash)

### End of Day
1. Go to **Reports** tab to review the day's sales
2. Click **Export Excel** to download a spreadsheet of all sales
3. Click the **"Shift Open"** indicator in the top bar
4. Count the cash in the drawer and enter the **Closing Cash** amount
5. The app shows the expected cash vs actual — any variance is recorded
6. Add any notes (optional) and click **Close Shift**
7. Log out

---

## Features

### For Cashiers
- **Quick Sale** — Scan barcodes or search products by name
- **Cash & Mobile Money** — Accept cash (with automatic change calculation) or mobile money
- **Shift Management** — Open/close shifts with cash counts and variance tracking
- **Receipt Printing** — Automatic thermal receipt printing (desktop only)
- **Cash Drawer** — Opens automatically on cash payments (desktop only)
- **Stock Protection** — Cannot sell more than what's in stock

### For Managers & Admin
- **Sales Reports** — Daily sales totals, payment breakdowns, tax summaries
- **Excel Export** — Download daily sales as a formatted Excel spreadsheet (both web and desktop)
- **Product Management** — Add, edit, and manage products with stock levels
- **User Management** — Create cashier and manager accounts
- **Settings** — Shop name, VAT rate, receipt header/footer, and more

### System
- **Offline-First** — Desktop app works without internet
- **Automatic Cloud Sync** — Data syncs when internet is available
- **VAT Compliance** — 16% Zambian VAT on applicable products (some products are zero-rated)
- **Real-Time Stock** — Stock levels update instantly on every sale
- **Audit Log** — Every sale and action is recorded
- **Account Security** — PIN-based auth with brute-force lockout (3 attempts → 5 min lock)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **F1** | Focus search bar |
| **F2** | Clear cart |
| **F12** | Charge (open payment) |
| **Barcode scan** | Auto-adds product to cart |

---

## Hardware Setup

The desktop app supports three peripherals via USB:

### Barcode Scanner
- **Recommended:** Netum NT-1228BL or Honeywell Voyager 1200g
- **Connection:** USB — plug and play, no drivers needed
- The scanner acts as a keyboard — when you scan a barcode, it "types" the number and the app automatically looks up the product

### Thermal Receipt Printer
- **Recommended:** Xprinter XP-Q200 (80mm, USB)
- **Protocol:** ESC/POS (standard thermal printer protocol)
- **Setup:** Install the printer driver, then set `PRINTER_INTERFACE` in the `.env` file to the printer port (e.g., `COM1` on Windows)
- Receipts include: shop header, items with prices, subtotal, VAT, total, payment method, change, and footer

### Cash Drawer
- **Connection:** RJ11 cable from the cash drawer to the thermal printer
- The drawer opens automatically when a cash payment is completed — the printer sends a kick pulse through the RJ11 port
- No separate driver or configuration needed

### Recommended Hardware Budget

| Device | Est. Cost (USD) |
|--------|----------------|
| Windows PC (4GB+ RAM) | $200–400 |
| Barcode Scanner | $20–80 |
| Thermal Receipt Printer (80mm) | $40–60 |
| Cash Drawer | $30–50 |
| UPS Backup Power (600–1000VA) | $40–80 |
| **Total** | **~$330–670** |

---

## Developer Setup

### Prerequisites
- Node.js 20+
- npm 10+

### Install & Run

```bash
# Clone the repo
git clone https://github.com/Mukela12/ariemmas-pos.git
cd ariemmas-pos

# Install dependencies
npm install

# Run the desktop app in development mode
npm run dev

# Run the Express backend (for web app development)
npm run dev:server
```

The desktop app starts with a local SQLite database by default — no external database needed for development.

### Project Structure

```
ariemmas-pos/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── database/            # DB adapters (SQLite, PostgreSQL, MSSQL)
│   │   │   ├── adapter.ts       # Unified DbAdapter interface
│   │   │   ├── connection.ts    # Database factory (picks engine from env)
│   │   │   ├── sqliteAdapter.ts # SQLite implementation
│   │   │   ├── postgresAdapter.ts
│   │   │   ├── mssqlAdapter.ts
│   │   │   └── migrations.ts    # Schema migrations (auto-run on startup)
│   │   ├── services/            # Business logic
│   │   │   ├── sales.ts         # Sale completion, receipt numbers
│   │   │   ├── exportExcel.ts   # Desktop Excel export (Electron dialog)
│   │   │   └── syncService.ts   # Offline→cloud sync queue
│   │   ├── ipc.ts               # IPC handlers (main↔renderer bridge)
│   │   └── index.ts             # Electron app entry point
│   ├── preload/                 # Secure API bridge for renderer
│   │   ├── index.ts             # contextBridge.exposeInMainWorld
│   │   └── index.d.ts           # TypeScript types for window.api
│   ├── renderer/                # React frontend
│   │   └── src/
│   │       ├── pages/           # POS, Products, Reports, Settings, Login
│   │       ├── components/      # AppLayout, shared UI
│   │       ├── stores/          # Zustand stores (auth, sale, shift)
│   │       └── lib/             # Utilities, webApiClient, browserMock
│   ├── server/                  # Express backend (Railway)
│   │   └── index.ts             # All API routes + sync endpoints
│   └── shared/                  # Shared types, constants
│       ├── types.ts
│       └── constants.ts
├── electron-builder.yml         # Desktop app packaging config
├── electron.vite.config.ts      # Electron Vite build config
├── vite.web.config.ts           # Web-only Vite build config
├── .env.example                 # Environment variable template
└── package.json
```

---

## Technical Architecture

```
┌─────────────────────────────────────────────────┐
│                  DESKTOP APP                     │
│  ┌───────────┐    IPC     ┌──────────────────┐  │
│  │  React    │◄──────────►│  Electron Main   │  │
│  │  Frontend │            │  Process          │  │
│  │  (Vite)   │            │  ┌─────────────┐  │  │
│  └───────────┘            │  │  SQLite DB   │  │  │
│                           │  │  (local)     │  │  │
│                           │  └──────┬──────┘  │  │
│                           │         │         │  │
│                           │  ┌──────▼──────┐  │  │
│                           │  │ Sync Queue  │  │  │
│                           │  │ (30s cycle) │  │  │
│                           │  └──────┬──────┘  │  │
│                           └─────────┼─────────┘  │
└─────────────────────────────────────┼────────────┘
                                      │ HTTPS (when online)
                                      ▼
┌─────────────────────────────────────────────────┐
│              CLOUD (Railway)                     │
│  ┌──────────────┐      ┌─────────────────────┐  │
│  │  Express API │◄────►│  PostgreSQL          │  │
│  │  (Node.js)   │      │  (cloud database)    │  │
│  └──────────────┘      └─────────────────────┘  │
└─────────────────────────────────────▲────────────┘
                                      │ HTTPS
┌─────────────────────────────────────┼────────────┐
│              WEB APP (Netlify)       │            │
│  ┌───────────┐                      │            │
│  │  React    │──────────────────────┘            │
│  │  Frontend │  (calls API directly)             │
│  │  (Static) │                                   │
│  └───────────┘                                   │
└──────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Database Abstraction** — A unified `DbAdapter` interface means the same code works with SQLite, PostgreSQL, or MSSQL. Just change `DB_ENGINE` in `.env`.
- **Offline-First** — Local SQLite is the source of truth on desktop. Cloud is a sync target, not a dependency.
- **Idempotent Sync** — The cloud server skips data it already has, so duplicate syncs are safe.
- **Secure IPC** — The renderer (browser window) cannot access Node.js directly. All calls go through the preload script's `window.api` object.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database engine: sqlite (default) | mssql | postgres
DB_ENGINE=sqlite

# --- SQLite (default, no config needed) ---
# Database file created automatically

# --- PostgreSQL (for cloud/Railway) ---
DATABASE_URL=postgresql://user:pass@host:5432/ariemmas_pos
PG_SSL=true

# --- MSSQL (optional, for enterprise) ---
MSSQL_SERVER=localhost
MSSQL_DATABASE=ariemmas_pos
MSSQL_USER=sa
MSSQL_PASSWORD=YourPassword
MSSQL_PORT=1433

# Hardware
PRINTER_INTERFACE=COM1    # Thermal printer port
PRINTER_ENABLED=false     # Set to true when printer is connected

# Sync target (cloud API URL)
SYNC_API_URL=https://api-production-b925.up.railway.app

# Web frontend API URL (for browser builds)
VITE_API_URL=https://api-production-b925.up.railway.app
```

For development, the default `.env` with `DB_ENGINE=sqlite` is all you need. No external database setup required.

---

## Building & Deploying

### Desktop App

```bash
# Build for Windows (creates .exe installer in dist/)
npm run build:win

# Build for macOS (creates .dmg in dist/)
npm run build:mac

# Build for Linux (creates .AppImage in dist/)
npm run build:linux
```

The Windows installer is an NSIS package that:
- Lets the user choose the install directory
- Creates desktop and Start menu shortcuts
- Installs per-machine (all users)

### Web Frontend (Netlify)

```bash
# Build the web frontend
npm run build:web

# Deploy to Netlify
npx netlify deploy --prod --dir=dist-web
```

### Cloud Backend (Railway)

```bash
# Build the server
npm run build:server

# Railway auto-deploys from the main branch on GitHub
git push origin main
```

### Creating a New Release

```bash
# Build desktop installers
npm run build:win

# Create a GitHub release
gh release create v1.x.x dist/*.exe --title "v1.x.x" --notes "Release notes here"
```

---

## Database Schema

The app creates these tables automatically on first launch:

| Table | Purpose |
|-------|---------|
| `users` | Cashier, manager, admin accounts with hashed PINs |
| `products` | Inventory: barcode, name, price, cost, VAT rate, stock level |
| `categories` | Product groups (Groceries, Beverages, etc.) |
| `sales` | Completed transactions: receipt #, totals, payment method |
| `sale_items` | Individual items in each sale |
| `shifts` | Cash shifts: opening/closing cash, variance, totals |
| `settings` | Key-value config (shop name, VAT rate, receipt text) |
| `audit_log` | Record of every action for accountability |
| `draft_sales` | Saved incomplete carts (for power outage recovery) |
| `_sync_queue` | Pending items to sync to cloud |

All currency fields use decimal precision (12,2). VAT rates are stored as decimals (e.g., `0.16` for 16%).

---

## API Endpoints

The Express server (Railway) exposes these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | PIN-based authentication |
| `GET` | `/api/products` | List products (paginated) |
| `GET` | `/api/products/search?q=` | Search by name or barcode |
| `GET` | `/api/products/barcode/:barcode` | Lookup by barcode |
| `POST` | `/api/products` | Create product |
| `PUT` | `/api/products/:id` | Update product |
| `GET` | `/api/categories` | List categories |
| `POST` | `/api/sales` | Complete a sale |
| `GET` | `/api/sales/daily?date=` | Daily sales summary |
| `GET` | `/api/sales/export?date=` | Download Excel report |
| `POST` | `/api/shifts/open` | Open a shift |
| `POST` | `/api/shifts/close` | Close a shift |
| `GET` | `/api/shifts/current/:userId` | Get open shift |
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings/:key` | Update a setting |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/sync/sales` | Sync sale from desktop |
| `POST` | `/api/sync/products` | Sync product from desktop |
| `POST` | `/api/sync/shifts` | Sync shift from desktop |
| `POST` | `/api/sync/users` | Sync user from desktop |
| `POST` | `/api/sync/categories` | Sync category from desktop |

---

## Currency

All amounts are in **Zambian Kwacha (ZMW)**, displayed as **K 0.00**.

VAT is **16%** (standard Zambian rate). Some essential products (mealie meal, bread, cooking oil) are zero-rated.

---

## Support

For any issues, contact **Mukela Katungu**.

---

## License

Private — Built for Ariemmas Shop, Mongu, Zambia.

### Developer

Mukela Katungu
