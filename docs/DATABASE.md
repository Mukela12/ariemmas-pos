# Database Schema

## 1. Overview

The system uses a **dual-database strategy**:

- **SQLite** (local, on-device) — Primary database for all operations. Works offline. Zero setup.
- **SQL Server Express** (production, Windows) — Used when deploying to the shop for better concurrency and backup options. The app can be configured to use either.

During development, SQLite is the default. The schema is designed to be compatible with both SQLite and SQL Server.

## 2. Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   users      │     │   shifts     │     │   categories     │
├──────────────┤     ├──────────────┤     ├──────────────────┤
│ id (PK)      │◄────│ user_id (FK) │     │ id (PK)          │
│ username     │     │ id (PK)      │     │ name             │
│ display_name │     │ opening_cash │     │ description      │
│ pin_hash     │     │ closing_cash │     └────────┬─────────┘
│ role         │     │ status       │              │
│ active       │     └──────┬───────┘              │
└──────┬───────┘            │              ┌───────┴──────────┐
       │                    │              │   products       │
       │                    │              ├──────────────────┤
       │              ┌─────┴──────┐       │ id (PK)          │
       │              │   sales    │       │ barcode (UNIQUE)  │
       └──────────────┤            │       │ name             │
                      ├────────────┤       │ category_id (FK) │
                      │ id (PK)    │       │ price            │
                      │ user_id    │       │ cost_price       │
                      │ shift_id   │       │ vat_rate         │
                      │ receipt_no │       │ stock_quantity   │
                      │ total      │       │ min_stock_level  │
                      │ vat_total  │       └───────┬──────────┘
                      │ payment    │               │
                      │ status     │       ┌───────┴──────────┐
                      └─────┬──────┘       │   sale_items     │
                            │              ├──────────────────┤
                            └──────────────│ sale_id (FK)     │
                                           │ product_id (FK)  │
                                           │ quantity         │
                                           │ unit_price       │
                                           │ line_total       │
                                           └──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌───────────────────┐
│   audit_log      │    │   sync_queue     │    │   settings        │
├──────────────────┤    ├──────────────────┤    ├───────────────────┤
│ id (PK)          │    │ id (PK)          │    │ key (PK)          │
│ user_id (FK)     │    │ entity_type      │    │ value             │
│ action           │    │ entity_id        │    │ updated_at        │
│ entity_type      │    │ action           │    └───────────────────┘
│ entity_id        │    │ payload          │
│ details          │    │ attempts         │
│ created_at       │    │ created_at       │
└──────────────────┘    └──────────────────┘
```

## 3. Table Definitions

### 3.1 users

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    pin_hash      TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('cashier', 'manager', 'admin')),
    active        INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default admin user (PIN: 1234, change on first login)
-- PIN hash generated at seed time
```

### 3.2 categories

```sql
CREATE TABLE categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.3 products

```sql
CREATE TABLE products (
    id              TEXT PRIMARY KEY,
    barcode         TEXT UNIQUE,
    name            TEXT NOT NULL,
    category_id     TEXT,
    price           REAL NOT NULL,              -- selling price (VAT inclusive)
    cost_price      REAL DEFAULT 0,             -- purchase/buying price
    vat_rate        REAL NOT NULL DEFAULT 0.16, -- 16% standard Zambian VAT
    stock_quantity  INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 5,
    unit            TEXT NOT NULL DEFAULT 'each', -- 'each', 'kg', 'litre', 'pack'
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category_id);
```

### 3.4 sales

```sql
CREATE TABLE sales (
    id              TEXT PRIMARY KEY,
    receipt_number  TEXT NOT NULL UNIQUE,
    user_id         TEXT NOT NULL,
    shift_id        TEXT,
    subtotal        REAL NOT NULL,              -- total before VAT
    vat_total       REAL NOT NULL,              -- total VAT amount
    discount_total  REAL NOT NULL DEFAULT 0,
    total           REAL NOT NULL,              -- final amount due
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'split')),
    amount_tendered REAL,                       -- cash given by customer
    change_given    REAL,                       -- change returned
    mobile_ref      TEXT,                       -- mobile money reference number
    status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'refunded')),
    void_reason     TEXT,
    void_by         TEXT,                       -- user_id of manager who voided
    zra_fiscal_code TEXT,                       -- ZRA verification code (Phase 2)
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (shift_id) REFERENCES shifts(id),
    FOREIGN KEY (void_by) REFERENCES users(id)
);

CREATE INDEX idx_sales_receipt ON sales(receipt_number);
CREATE INDEX idx_sales_date ON sales(created_at);
CREATE INDEX idx_sales_user ON sales(user_id);
CREATE INDEX idx_sales_shift ON sales(shift_id);
```

### 3.5 sale_items

```sql
CREATE TABLE sale_items (
    id            TEXT PRIMARY KEY,
    sale_id       TEXT NOT NULL,
    product_id    TEXT NOT NULL,
    product_name  TEXT NOT NULL,         -- denormalized: preserved for receipt reprinting
    barcode       TEXT,                  -- denormalized: preserved for records
    quantity      REAL NOT NULL,
    unit_price    REAL NOT NULL,         -- price at time of sale (VAT inclusive)
    vat_rate      REAL NOT NULL,
    vat_amount    REAL NOT NULL,         -- VAT portion of this line
    discount_amount REAL NOT NULL DEFAULT 0,
    line_total    REAL NOT NULL,         -- quantity * unit_price - discount
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
```

### 3.6 shifts

```sql
CREATE TABLE shifts (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    opening_cash  REAL NOT NULL,         -- counted cash at shift start
    closing_cash  REAL,                  -- counted cash at shift end
    expected_cash REAL,                  -- calculated: opening + cash sales - cash refunds
    variance      REAL,                  -- closing - expected (positive = over, negative = short)
    total_sales   REAL DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    total_vat     REAL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes         TEXT,                  -- cashier notes on close
    opened_at     TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at     TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_shifts_user ON shifts(user_id);
CREATE INDEX idx_shifts_status ON shifts(status);
```

### 3.7 audit_log

```sql
CREATE TABLE audit_log (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    -- Actions: 'login', 'logout', 'sale', 'void', 'refund', 'drawer_open',
    --          'discount', 'price_change', 'product_create', 'product_edit',
    --          'shift_open', 'shift_close', 'user_create', 'settings_change'
    entity_type TEXT,                   -- 'sale', 'product', 'user', 'shift', 'drawer'
    entity_id   TEXT,
    details     TEXT,                   -- JSON with context (before/after values, reason, etc.)
    ip_address  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_date ON audit_log(created_at);
CREATE INDEX idx_audit_user ON audit_log(user_id);
```

### 3.8 draft_sales (power outage recovery)

```sql
CREATE TABLE draft_sales (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    items       TEXT NOT NULL,           -- JSON array of sale items in progress
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.9 stock_receipts (incoming inventory)

```sql
CREATE TABLE stock_receipts (
    id          TEXT PRIMARY KEY,
    supplier    TEXT,
    reference   TEXT,                   -- supplier invoice number
    notes       TEXT,
    received_by TEXT NOT NULL,          -- user_id
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE stock_receipt_items (
    id                TEXT PRIMARY KEY,
    stock_receipt_id  TEXT NOT NULL,
    product_id        TEXT NOT NULL,
    quantity          INTEGER NOT NULL,
    cost_price        REAL,             -- unit cost for this delivery
    FOREIGN KEY (stock_receipt_id) REFERENCES stock_receipts(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### 3.10 sync_queue (cloud sync - Phase 2)

```sql
CREATE TABLE sync_queue (
    id              TEXT PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    action          TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    payload         TEXT NOT NULL,       -- JSON
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 10,
    last_attempt_at TEXT,
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_queue_status ON sync_queue(attempts, created_at);
```

### 3.11 settings

```sql
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default settings
INSERT INTO settings (key, value) VALUES
    ('shop_name', 'Ariemmas'),
    ('shop_address', 'Independence Ave Mongu'),
    ('shop_phone', '097 4542233'),
    ('shop_tin', ''),
    ('vat_rate', '0.16'),
    ('currency_symbol', 'K'),
    ('currency_code', 'ZMW'),
    ('printer_interface', 'usb'),
    ('printer_port', ''),
    ('paper_width', '80'),
    ('receipt_footer', 'Thank you for shopping at Ariemmas!'),
    ('auto_logout_minutes', '15'),
    ('low_stock_alert', '1'),
    ('backup_enabled', '1'),
    ('backup_path', ''),
    ('receipt_counter', '0');
```

## 4. Receipt Number Generation

Sequential receipt numbers per day: `YYYYMMDD-NNNN`

Example: `20260313-0142` = 142nd receipt on March 13, 2026

```sql
-- Atomic increment in SQLite
UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'receipt_counter';
SELECT value FROM settings WHERE key = 'receipt_counter';
```

The counter resets daily (checked on first sale of each day).

## 5. Migration Strategy

Migrations are numbered SQL files executed in order:

```
src/main/database/migrations/
├── 001_initial_schema.sql      -- All tables above
├── 002_seed_default_data.sql   -- Default settings, admin user, categories
├── 003_sample_products.sql     -- Optional: test products for development
└── ...                         -- Future schema changes
```

Migration tracking table:

```sql
CREATE TABLE _migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## 6. SQL Server Compatibility Notes

When switching from SQLite to SQL Server for production:

| SQLite | SQL Server Equivalent |
|--------|----------------------|
| `TEXT` for IDs | `NVARCHAR(36)` (UUIDs) |
| `TEXT` for dates | `DATETIME2` |
| `REAL` | `DECIMAL(18,2)` for money, `DECIMAL(5,4)` for rates |
| `INTEGER` | `INT` or `BIT` (for booleans) |
| `datetime('now')` | `GETUTCDATE()` |
| `AUTOINCREMENT` | `IDENTITY(1,1)` |

A database abstraction layer in the app will handle these differences transparently.

## 7. Backup Strategy

- **Automatic local backup**: Daily at midnight (or on app close), copy `pos.db` to `backups/pos_YYYYMMDD_HHMMSS.db`
- **USB backup**: Weekly manual export to USB drive
- **Retention**: Keep 30 days of local backups, delete older
- **Recovery**: Replace `pos.db` with any backup file to restore
