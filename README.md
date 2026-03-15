# Ariemmas POS System

**Point of Sale software for Ariemmas Shop — Independence Ave, Mongu, Zambia**

## Overview

A full-featured, offline-first Point of Sale system built for a retail shop in Mongu, Zambia. Designed to run on a Windows cash register computer with barcode scanner, thermal receipt printer, and cash drawer.

## Business Details

| Field | Value |
|-------|-------|
| **Shop Name** | Ariemmas |
| **Location** | Independence Ave, Mongu, Zambia |
| **Contact** | 097 4542233 |
| **Currency** | Zambian Kwacha (ZMW / K) |
| **VAT Rate** | 16% (standard) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop App** | Electron 33+ |
| **Frontend** | React 19 + TypeScript + Tailwind CSS |
| **Local Database** | SQLite (via better-sqlite3) — offline-first |
| **Production Database** | Microsoft SQL Server 2022 Express |
| **Receipt Printing** | node-thermal-printer (ESC/POS protocol) |
| **Barcode Scanning** | USB HID keyboard emulation (no driver needed) |
| **Cash Drawer** | Triggered via receipt printer RJ11 kick pulse |
| **Build/Package** | electron-builder (Windows .exe from macOS) |

## Hardware Requirements

| Device | Recommended Model | Est. Cost (USD) |
|--------|------------------|----------------|
| Windows PC / Cash Register | Any Windows 10/11 PC, 4GB+ RAM | $200-400 |
| Barcode Scanner | Netum NT-1228BL or Honeywell Voyager 1200g | $20-80 |
| Thermal Receipt Printer | Xprinter XP-Q200 (80mm, USB) | $40-60 |
| Cash Drawer | Standard RJ11-connected drawer | $30-50 |
| UPS (Backup Power) | APC 600VA-1000VA | $40-80 |
| **Total Setup** | | **~$330-670** |

## Key Features

- **Barcode Scanning** — Scan products at checkout, instant lookup
- **Receipt Printing** — Thermal receipts with shop header, items, totals, cashier info
- **Cash Drawer** — Auto-opens on cash payment
- **Offline-First** — Works without internet, syncs when connected
- **User Authentication** — PIN-based login, role-based access (cashier/manager/admin)
- **Shift Management** — Opening/closing cash counts, variance tracking
- **Inventory Management** — Stock levels, low-stock alerts, product CRUD
- **Sales Reporting** — Daily sales, X-reports (mid-day), Z-reports (end-of-day)
- **VAT Compliance** — 16% Zambian VAT calculated and displayed on receipts
- **ZRA Integration** — Smart Invoice / EFD fiscal reporting (Phase 2)
- **Multi-Payment** — Cash, mobile money (future: card)
- **Power Outage Recovery** — Auto-saves draft sales, recovers on restart

## Project Structure

```
ariemmas-pos/
├── README.md
├── docs/                          # Project documentation
│   ├── REQUIREMENTS.md            # Full requirements specification
│   ├── ARCHITECTURE.md            # System architecture & design
│   ├── DATABASE.md                # Database schema & migrations
│   ├── HARDWARE.md                # Peripheral integration guide
│   ├── UI-DESIGN.md               # Screen layouts & user flows
│   ├── DEPLOYMENT.md              # Build, packaging & deployment
│   ├── ZRA-COMPLIANCE.md          # Zambia tax & fiscal compliance
│   ├── DEVELOPMENT-SETUP.md       # Dev environment setup guide
│   └── ROADMAP.md                 # Phased build plan & milestones
├── src/                           # Source code (Phase 1+)
│   ├── main/                      # Electron main process
│   ├── renderer/                  # React frontend
│   ├── database/                  # DB schema, migrations, queries
│   ├── hardware/                  # Printer, scanner, drawer modules
│   ├── services/                  # Business logic (sales, inventory, tax)
│   └── shared/                    # Shared types, constants, utilities
├── assets/                        # Icons, images, fonts
├── scripts/                       # Build & utility scripts
├── reference/                     # Original Excel mockup & notes
├── package.json
├── tsconfig.json
├── electron-builder.yml
└── .env.example
```

## Development

```bash
# Prerequisites
node >= 20, npm >= 10, Docker (for SQL Server on macOS)

# Install dependencies
npm install

# Start SQL Server (macOS development)
docker run --platform linux/amd64 -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=YourStr0ngP@ssword" \
  -p 1433:1433 --name pos-sqlserver \
  -d mcr.microsoft.com/mssql/server:2022-latest

# Run in development mode
npm run dev

# Build for Windows
npm run build:win

# Build for macOS (testing)
npm run build:mac
```

## Documentation

See the `docs/` folder for comprehensive documentation:

| Document | Description |
|----------|-------------|
| [Requirements](docs/REQUIREMENTS.md) | What the system must do |
| [Architecture](docs/ARCHITECTURE.md) | How the system is designed |
| [Database](docs/DATABASE.md) | Tables, relationships, migrations |
| [Hardware](docs/HARDWARE.md) | Barcode scanner, printer, cash drawer |
| [UI Design](docs/UI-DESIGN.md) | Screen mockups and user flows |
| [Deployment](docs/DEPLOYMENT.md) | Building and installing on Windows |
| [ZRA Compliance](docs/ZRA-COMPLIANCE.md) | Zambia Revenue Authority integration |
| [Dev Setup](docs/DEVELOPMENT-SETUP.md) | Setting up your development environment |
| [Roadmap](docs/ROADMAP.md) | Build phases and milestones |

## License

Private — Built for Ariemmas Shop, Mongu, Zambia.

## Developer

Mukela Katungu
