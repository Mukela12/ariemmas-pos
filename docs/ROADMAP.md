# Project Roadmap

## Phase Overview

```
Phase 1: Foundation          ░░░░░░░░░░░░░░░░░░░░░░░░
Phase 2: Core POS            ░░░░░░░░░░░░░░░░░░░░░░░░░░░░
Phase 3: Hardware            ░░░░░░░░░░░░░░░░░░
Phase 4: Management          ░░░░░░░░░░░░░░░░░░░░░░░░
Phase 5: Reporting           ░░░░░░░░░░░░░░░░░░
Phase 6: Polish & Deploy     ░░░░░░░░░░░░░░░░░░░░░░░░
Phase 7: ZRA Integration     ░░░░░░░░░░░░░░░░░░ (after deployment)
```

---

## Phase 1: Foundation

**Goal:** Electron app running with React, SQLite database, and basic navigation.

### Tasks

- [ ] Initialize Electron + Vite + React + TypeScript project
- [ ] Configure Tailwind CSS
- [ ] Set up SQLite with better-sqlite3
- [ ] Create database migration system
- [ ] Run initial schema migration (all tables)
- [ ] Seed default data (admin user, categories, settings)
- [ ] Create preload script with IPC bridge (contextBridge)
- [ ] Set up Zustand stores (auth, sale, settings)
- [ ] Build basic router (react-router-dom)
- [ ] Create placeholder pages (Login, POS, Products, Reports, Settings)

### Deliverable
App launches, shows login screen, and navigates between placeholder pages.

---

## Phase 2: Core POS (Sale Flow)

**Goal:** Complete checkout workflow — scan, add items, pay, clear.

### Tasks

- [ ] Build Login screen with PIN authentication
- [ ] Implement auth service (bcrypt PIN hashing, role checking)
- [ ] Build POS sale screen layout (header, item list, totals, buttons)
- [ ] Implement barcode scanner hook (useScanner — keyboard event detection)
- [ ] Implement product lookup by barcode (IPC → SQLite query)
- [ ] Implement manual product search (name/SKU search)
- [ ] Add item to sale (state management)
- [ ] Remove item from sale
- [ ] Update item quantity
- [ ] Real-time total/VAT calculation
- [ ] Build Payment dialog (cash payment)
  - Cash amount input
  - Quick amount buttons
  - Change calculation
  - Complete sale button
- [ ] Sale completion flow:
  - Save sale + sale_items to database (transaction)
  - Decrement product stock
  - Write audit log entry
  - Clear sale state
- [ ] Mobile money payment option
- [ ] Power outage protection (draft_sales auto-save/recovery)

### Deliverable
Full checkout flow working: scan → add items → pay → sale saved → screen cleared. No printing yet.

---

## Phase 3: Hardware Integration

**Goal:** Receipt printing and cash drawer working.

### Tasks

- [ ] Install and configure node-thermal-printer
- [ ] Build receipt formatter (ESC/POS layout matching design spec)
- [ ] Test with simulated printer output (dev mode → file/console)
- [ ] Implement cash drawer open command (via printer)
- [ ] Add printer status checking (connected/disconnected)
- [ ] Wire up sale completion → print receipt → open drawer
- [ ] Reprint last receipt feature
- [ ] Add status bar showing hardware status
- [ ] Printer configuration in settings (port, paper width)

### Deliverable
After payment: receipt prints on thermal printer, cash drawer opens. Hardware status visible in UI.

---

## Phase 4: Management Features

**Goal:** User management, product CRUD, shift management.

### Tasks

- [ ] **User Management** (Admin only)
  - Create user (username, display name, PIN, role)
  - Edit user
  - Activate/deactivate user
  - Reset PIN
  - List all users

- [ ] **Product Management** (Manager/Admin)
  - Add product (name, barcode, price, cost, category, VAT rate, stock)
  - Edit product
  - Deactivate product
  - Product list with search and category filter
  - Pagination
  - Low stock indicator

- [ ] **Shift Management**
  - Open shift dialog (enter opening cash count)
  - Close shift dialog (enter closing cash count, shows variance)
  - Enforce: must have open shift to process sales
  - X-report (mid-day summary, doesn't close shift)
  - Z-report (end-of-day, closes shift)

- [ ] **Stock Receiving**
  - Record incoming stock (supplier, items, quantities)
  - Auto-update product stock quantities

- [ ] **Void/Refund** (Manager approval)
  - Void a completed sale (requires manager PIN + reason)
  - Refund (creates negative sale entry)

### Deliverable
Full management suite: users, products, shifts, stock receiving, void/refund.

---

## Phase 5: Reporting

**Goal:** Daily sales reports, export capability.

### Tasks

- [ ] Daily sales summary (total sales, VAT, transaction count)
- [ ] Sales by product (top sellers)
- [ ] Sales by cashier
- [ ] Sales by payment method
- [ ] Sales by hour (bar chart)
- [ ] Inventory status (current stock levels, low stock alerts)
- [ ] Profit margins (if cost prices entered)
- [ ] Date range selector for reports
- [ ] Print reports (formatted for thermal printer or A4)
- [ ] Export to CSV

### Deliverable
Reports dashboard with daily summaries, charts, and export functionality.

---

## Phase 6: Polish & Deploy

**Goal:** Production-ready app deployed at the shop.

### Tasks

- [ ] **Polishing**
  - Error handling on all IPC calls
  - Loading states and skeleton screens
  - Toast notifications (item added, sale complete, errors)
  - Sound effects (scan beep, sale complete, error)
  - Keyboard shortcut system (F2 search, F8 remove, F12 pay)
  - Auto-logout on idle

- [ ] **Database**
  - Automated daily backup
  - Backup to USB on demand
  - Database integrity checks on startup

- [ ] **Settings Page**
  - Shop details (name, address, phone, TIN)
  - Printer configuration
  - Receipt customization
  - Backup settings
  - About / version info

- [ ] **Build & Package**
  - Configure electron-builder for Windows NSIS installer
  - Test build on macOS → install on Windows VM
  - Create GitHub Actions CI for automated builds
  - Test auto-update mechanism

- [ ] **First Run Wizard**
  - Guide through shop details, printer setup, admin PIN change
  - Test print and drawer test

- [ ] **Deployment at Shop**
  - Install on Windows PC
  - Connect and test barcode scanner
  - Connect and test receipt printer
  - Connect and test cash drawer
  - Set up UPS
  - Enter initial product catalog
  - Train staff
  - Monitor first week of operation

### Deliverable
App installed and running at Ariemmas in Mongu. Staff trained. All hardware working.

---

## Phase 7: ZRA Integration (Post-Deployment)

**Goal:** Comply with Zambia Revenue Authority fiscal requirements.

### Tasks

- [ ] Contact ZRA / local consultant for Smart Invoice integration
- [ ] Obtain API credentials and documentation
- [ ] Implement ZRA API client
- [ ] Add fiscal code to receipt template
- [ ] Add QR code printing to receipts
- [ ] Implement offline queue for ZRA submissions
- [ ] Test against ZRA sandbox environment
- [ ] Apply for production certification
- [ ] Go live with fiscal reporting
- [ ] Add monthly VAT summary export for accountant

### Deliverable
All sales reported to ZRA. Receipts include fiscal verification codes. VAT returns data exportable.

---

## Future Enhancements (Not Planned Yet)

These may be added based on business needs:

- [ ] SQL Server migration (if multi-terminal needed)
- [ ] Multi-terminal support (2+ cash registers)
- [ ] Cloud dashboard (owner checks sales remotely via phone)
- [ ] Customer loyalty program
- [ ] Barcode label printing
- [ ] Bulk product import from Excel/CSV
- [ ] Employee time tracking
- [ ] Supplier management
- [ ] Purchase orders
- [ ] Integration with accounting software

---

## Version Numbering

```
v1.0.0  — Phase 1-6 complete. First shop deployment.
v1.1.0  — Phase 7 (ZRA integration)
v1.2.0  — Bug fixes and improvements from first month of use
v2.0.0  — Multi-terminal / cloud features (if needed)
```
