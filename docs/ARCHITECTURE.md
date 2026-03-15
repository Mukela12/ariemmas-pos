# System Architecture

## 1. High-Level Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     ELECTRON APPLICATION                      │
│                                                               │
│  ┌─────────────────────┐    ┌──────────────────────────────┐ │
│  │    MAIN PROCESS      │    │      RENDERER PROCESS        │ │
│  │    (Node.js)         │    │      (React + TypeScript)     │ │
│  │                      │    │                               │ │
│  │  ┌────────────────┐  │    │  ┌─────────────────────────┐ │ │
│  │  │  Hardware       │  │    │  │  Login Screen           │ │ │
│  │  │  Manager        │  │    │  │  Sale Screen (POS)      │ │ │
│  │  │  - Printer      │  │    │  │  Product Management     │ │ │
│  │  │  - Cash Drawer  │  │    │  │  Reports Dashboard      │ │ │
│  │  │  - Scanner cfg  │  │    │  │  Settings               │ │ │
│  │  └────────────────┘  │    │  │  Shift Management        │ │ │
│  │                      │    │  └─────────────────────────┘ │ │
│  │  ┌────────────────┐  │    │                               │ │
│  │  │  Database       │◄─┼────┼─── IPC (contextBridge)      │ │
│  │  │  Manager        │  │    │                               │ │
│  │  │  - SQLite       │  │    └──────────────────────────────┘ │
│  │  │  - Migrations   │  │                                     │
│  │  │  - Backup       │  │                                     │
│  │  └────────────────┘  │                                     │
│  │                      │                                     │
│  │  ┌────────────────┐  │                                     │
│  │  │  Sync Engine   │  │─── (when online) ──► Cloud / ZRA   │
│  │  │  (optional)    │  │                                     │
│  │  └────────────────┘  │                                     │
│  └─────────────────────┘                                     │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐  ┌───────────────┐  ┌──────────────────┐
│  SQLite Database  │  │ Receipt       │  │ Cash Drawer      │
│  (pos.db)         │  │ Printer (USB) │  │ (via printer)    │
└──────────────────┘  └───────────────┘  └──────────────────┘
```

## 2. Process Architecture

### Main Process (Node.js)

The Electron main process handles everything that needs direct system access:

| Module | Responsibility |
|--------|---------------|
| `main/index.ts` | App lifecycle, window management, IPC registration |
| `main/database.ts` | SQLite connection, query execution, migrations |
| `main/printer.ts` | ESC/POS receipt formatting and printing |
| `main/cash-drawer.ts` | Cash drawer open commands (via printer) |
| `main/scanner.ts` | Scanner configuration and mode detection |
| `main/backup.ts` | Database backup scheduling and execution |
| `main/sync.ts` | Cloud sync engine (Phase 2) |
| `main/updater.ts` | Auto-update via electron-updater |

### Renderer Process (React)

The frontend UI — a single-page React app:

| Module | Responsibility |
|--------|---------------|
| `renderer/App.tsx` | Root component, routing, global state |
| `renderer/pages/Login.tsx` | Authentication screen |
| `renderer/pages/POS.tsx` | Main sale/checkout screen |
| `renderer/pages/Products.tsx` | Product CRUD management |
| `renderer/pages/Reports.tsx` | Sales and inventory reports |
| `renderer/pages/Settings.tsx` | App configuration |
| `renderer/pages/Shifts.tsx` | Shift open/close/reports |
| `renderer/hooks/` | Custom React hooks (useScanner, usePrinter, etc.) |
| `renderer/components/` | Reusable UI components |
| `renderer/store/` | Zustand state management |

### IPC Communication

Main ↔ Renderer communication uses Electron's `contextBridge` + `ipcRenderer`/`ipcMain`:

```typescript
// preload.ts — exposes safe API to renderer
contextBridge.exposeInMainWorld('posAPI', {
  // Database
  getProduct: (barcode: string) => ipcRenderer.invoke('db:getProduct', barcode),
  searchProducts: (query: string) => ipcRenderer.invoke('db:searchProducts', query),
  completeSale: (sale: Sale) => ipcRenderer.invoke('db:completeSale', sale),

  // Hardware
  printReceipt: (receipt: Receipt) => ipcRenderer.invoke('hw:printReceipt', receipt),
  openCashDrawer: () => ipcRenderer.invoke('hw:openCashDrawer'),

  // Auth
  login: (username: string, pin: string) => ipcRenderer.invoke('auth:login', username, pin),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Reports
  getDailySales: (date: string) => ipcRenderer.invoke('report:dailySales', date),
  getShiftReport: (shiftId: string) => ipcRenderer.invoke('report:shift', shiftId),
});
```

## 3. Data Flow

### Sale Transaction Flow

```
[Cashier scans barcode]
        │
        ▼
[Renderer: keypress event detected]
        │
        ▼
[Renderer: invoke 'db:getProduct' via IPC]
        │
        ▼
[Main: SQLite query → SELECT * FROM products WHERE barcode = ?]
        │
        ▼
[Renderer: product added to sale state (Zustand)]
        │
        ▼
[Renderer: UI updates — item in list, total recalculated]
        │
        ▼
[Cashier clicks PAY, enters cash amount]
        │
        ▼
[Renderer: invoke 'db:completeSale' via IPC]
        │
        ▼
[Main: BEGIN TRANSACTION]
  ├── INSERT INTO sales (...)
  ├── INSERT INTO sale_items (...) × N
  ├── UPDATE products SET stock_quantity = stock_quantity - qty × N
  ├── INSERT INTO audit_log (...)
  └── COMMIT
        │
        ▼
[Renderer: invoke 'hw:printReceipt' via IPC]
        │
        ▼
[Main: format ESC/POS receipt → send to printer → kick cash drawer]
        │
        ▼
[Renderer: clear sale state, ready for next customer]
```

### Power Failure Recovery

```
[App starts]
    │
    ▼
[Check for draft_sales in SQLite]
    │
    ├── Found → Show recovery dialog: "Resume interrupted sale?"
    │              ├── Yes → Load items back into POS screen
    │              └── No  → Delete draft, start fresh
    │
    └── None → Normal startup
```

## 4. State Management

Using **Zustand** (lightweight, no boilerplate):

```
Global Store
├── auth: { user, role, isLoggedIn }
├── sale: { items[], total, subtotal, vat, paymentMethod }
├── shift: { id, openedAt, openingCash, status }
└── settings: { shopName, printerPort, vatRate, ... }
```

Each page also manages local UI state (modals, form inputs, search queries) via React `useState`.

## 5. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Electron | Dev on macOS, deploy on Windows. Full Node.js API access for hardware. |
| Frontend | React + TypeScript | Widely known, large ecosystem, type safety |
| CSS | Tailwind CSS | Rapid UI development, consistent design, small bundle |
| State management | Zustand | Simple, performant, minimal boilerplate vs Redux |
| Local database | SQLite (better-sqlite3) | Zero setup, offline-first, crash-resistant, fast |
| Production database | SQL Server Express | Client requirement. Free. Handles multi-terminal if needed later. |
| Receipt printing | node-thermal-printer | Mature Node.js ESC/POS library, supports Epson/Star/Xprinter |
| Barcode scanning | Native keyboard events | USB scanners emulate keyboards. No library needed. |
| Packaging | electron-builder | Cross-platform builds, NSIS installer for Windows |
| Auto-update | electron-updater | Seamless updates from GitHub Releases or S3 |

## 6. Directory Structure (Detailed)

```
ariemmas-pos/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts                  # Vite for renderer bundling
├── .env.example
├── .gitignore
│
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # Entry point, app lifecycle
│   │   ├── window.ts               # BrowserWindow creation
│   │   ├── ipc.ts                  # IPC handler registration
│   │   ├── database/
│   │   │   ├── connection.ts       # SQLite connection setup
│   │   │   ├── migrations/         # Schema migration files
│   │   │   │   ├── 001_initial.sql
│   │   │   │   ├── 002_seed_data.sql
│   │   │   │   └── ...
│   │   │   └── queries/            # Prepared query modules
│   │   │       ├── products.ts
│   │   │       ├── sales.ts
│   │   │       ├── users.ts
│   │   │       ├── shifts.ts
│   │   │       └── reports.ts
│   │   ├── hardware/
│   │   │   ├── printer.ts          # Receipt formatting + printing
│   │   │   ├── cash-drawer.ts      # Drawer open command
│   │   │   └── scanner-config.ts   # Scanner detection/config
│   │   ├── services/
│   │   │   ├── auth.ts             # Login, PIN hashing, sessions
│   │   │   ├── sales.ts            # Sale completion logic
│   │   │   ├── inventory.ts        # Stock management
│   │   │   ├── shifts.ts           # Shift open/close logic
│   │   │   ├── backup.ts           # Database backup
│   │   │   └── sync.ts             # Cloud sync (Phase 2)
│   │   └── utils/
│   │       ├── currency.ts         # ZMW formatting
│   │       ├── vat.ts              # VAT calculations
│   │       ├── receipt-number.ts   # Sequential receipt numbering
│   │       └── uuid.ts             # UUID generation
│   │
│   ├── renderer/                   # React Frontend
│   │   ├── index.html
│   │   ├── main.tsx                # React entry point
│   │   ├── App.tsx                 # Root component + router
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── POS.tsx             # Main checkout screen
│   │   │   ├── Products.tsx        # Product management
│   │   │   ├── Reports.tsx         # Reports dashboard
│   │   │   ├── Settings.tsx        # Configuration
│   │   │   └── Shifts.tsx          # Shift management
│   │   ├── components/
│   │   │   ├── ui/                 # Base components (Button, Input, etc.)
│   │   │   ├── SaleItemList.tsx
│   │   │   ├── PaymentDialog.tsx
│   │   │   ├── ProductSearch.tsx
│   │   │   ├── ReceiptPreview.tsx
│   │   │   ├── ShiftSummary.tsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useScanner.ts       # Barcode scanner input hook
│   │   │   ├── usePOS.ts           # Sale state management
│   │   │   └── useAuth.ts          # Auth state hook
│   │   ├── store/
│   │   │   ├── authStore.ts
│   │   │   ├── saleStore.ts
│   │   │   ├── settingsStore.ts
│   │   │   └── shiftStore.ts
│   │   ├── lib/
│   │   │   └── api.ts              # Typed wrapper around window.posAPI
│   │   └── styles/
│   │       └── globals.css         # Tailwind imports + custom styles
│   │
│   ├── preload/
│   │   └── index.ts                # contextBridge API exposure
│   │
│   └── shared/                     # Shared between main & renderer
│       ├── types.ts                # TypeScript interfaces (Product, Sale, etc.)
│       └── constants.ts            # VAT_RATE, CURRENCY, app config
│
├── assets/
│   ├── icon.png                    # App icon (512x512)
│   ├── icon.ico                    # Windows icon
│   └── logo.png                    # Receipt header logo (optional)
│
├── scripts/
│   ├── seed-products.ts            # Import initial product catalog
│   └── generate-test-data.ts       # Generate test sales data
│
├── reference/
│   └── POS Software.xlsx           # Original requirements mockup
│
└── docs/
    └── ...                         # Documentation files
```

## 7. Security Architecture

```
┌─────────────────────────────────────────┐
│            Security Layers               │
│                                          │
│  1. App-Level Auth                       │
│     └── PIN-based login                  │
│     └── Role-based access control        │
│     └── Auto-logout on idle              │
│                                          │
│  2. Data-Level Security                  │
│     └── SQLCipher encrypted database     │
│     └── Bcrypt-hashed PINs              │
│     └── Audit trail on all mutations     │
│                                          │
│  3. Network-Level Security               │
│     └── HTTPS for all cloud sync         │
│     └── No open ports on POS machine     │
│     └── Sync auth via API key + JWT      │
│                                          │
│  4. Physical Security                    │
│     └── Cash drawer requires auth        │
│     └── Drawer-open events logged        │
│     └── Shift cash reconciliation        │
└─────────────────────────────────────────┘
```
