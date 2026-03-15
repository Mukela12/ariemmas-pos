# Ariemmas POS System

**Point of Sale software for Ariemmas Shop — Independence Ave, Mongu, Zambia**

---

## How to Access

| Platform | Link |
|----------|------|
| **Web App** (any browser) | [ariemmas-pos.netlify.app](https://ariemmas-pos.netlify.app) |
| **Windows Installer** (.exe) | [Download v1.0.0](https://github.com/Mukela12/ariemmas-pos/releases/download/v1.0.0/Ariemmas.POS.Setup.1.0.0.exe) |

### Web App
Open the link above in any browser (Chrome, Edge, Firefox) on any device — phone, tablet, or computer. Log in with your username and PIN.

### Desktop App (Windows)
1. Download the `.exe` installer from the link above
2. Run the installer — it will install automatically
3. Open "Ariemmas POS" from your desktop or Start menu
4. Log in with your username and PIN

---

## Default Login

| User | Username | PIN | Role |
|------|----------|-----|------|
| Administrator | `admin` | `1234` | Admin (full access) |
| Mary | `mary` | `5678` | Cashier |

> Change PINs after first login for security.

---

## Features

### For Cashiers
- **Quick Sale** — Scan barcodes or search products by name, add to cart, and charge
- **Cash & Mobile Money** — Accept cash (with change calculation) or mobile money payments
- **Shift Management** — Open a shift at the start of your day, close it at the end with a cash count
- **Receipt Printing** — Automatic thermal receipt printing (desktop app only)
- **Cash Drawer** — Opens automatically on cash payments (desktop app only)
- **Keyboard Shortcuts** — F1 (search), F2 (clear cart), F12 (charge) for fast checkout

### For Managers & Admin
- **Sales Reports** — View daily sales totals, payment breakdowns, and tax summaries
- **Excel Export** — Download daily sales as an Excel spreadsheet (works on both web and desktop)
- **Product Management** — Add, edit, and manage product inventory with stock levels
- **User Management** — Create cashier and manager accounts with PIN-based login
- **Settings** — Configure shop name, VAT rate, receipt header, and more

### System
- **Offline-First** — Desktop app works without internet, syncs data when connected
- **Cloud Sync** — All data syncs between desktop and web automatically
- **VAT Compliance** — 16% Zambian VAT calculated on applicable products
- **Stock Tracking** — Real-time stock levels, prevents overselling
- **Audit Log** — Every sale is recorded for accountability

---

## Daily Workflow

1. **Start of Day** — Log in, open a shift (count the cash in the drawer)
2. **Make Sales** — Scan or search items, confirm payment, receipt prints automatically
3. **End of Day** — Go to Reports to review sales, export Excel if needed, close your shift (count cash again)

---

## Currency

All amounts are in **Zambian Kwacha (ZMW)**, displayed as **K 0.00**.

---

## Support

For any issues, contact Mukela Katungu.

---

## Technical Details

| Layer | Technology |
|-------|-----------|
| Desktop App | Electron + React + TypeScript |
| Web Frontend | React 19 + Tailwind CSS (hosted on Netlify) |
| Backend API | Express + PostgreSQL (hosted on Railway) |
| Local Database | SQLite (offline-first on desktop) |
| Hardware | USB barcode scanner, thermal printer (ESC/POS), cash drawer |

### Developer

Mukela Katungu
