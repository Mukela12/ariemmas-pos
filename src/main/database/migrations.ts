import type { DbAdapter } from './adapter'

interface TableDef {
  name: string
  cols: string
}

function getCreateSchemaSQL(engine: DbAdapter['engine']): string {
  const NOW = engine === 'sqlite' ? "DEFAULT (datetime('now'))" :
              engine === 'mssql' ? 'DEFAULT GETDATE()' :
              'DEFAULT NOW()'

  const TEXT = engine === 'mssql' ? 'NVARCHAR(255)' : 'TEXT'
  const TEXT_PK = engine === 'mssql' ? 'NVARCHAR(50)' : 'TEXT'
  const LONGTEXT = engine === 'mssql' ? 'NVARCHAR(MAX)' : 'TEXT'
  const REAL = engine === 'mssql' ? 'DECIMAL(12,2)' : engine === 'postgres' ? 'NUMERIC(12,2)' : 'REAL'
  const REAL_RATE = engine === 'mssql' ? 'DECIMAL(5,4)' : engine === 'postgres' ? 'NUMERIC(5,4)' : 'REAL'
  const INT = 'INTEGER'

  const tables: TableDef[] = [
    { name: 'users', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      username ${TEXT} NOT NULL UNIQUE,
      display_name ${TEXT} NOT NULL,
      pin_hash ${TEXT} NOT NULL,
      role ${TEXT} NOT NULL,
      active ${INT} NOT NULL DEFAULT 1,
      failed_attempts ${INT} NOT NULL DEFAULT 0,
      locked_until ${TEXT},
      created_at ${TEXT} ${NOW},
      updated_at ${TEXT} ${NOW}
    `},
    { name: 'categories', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      name ${TEXT} NOT NULL UNIQUE,
      description ${TEXT},
      sort_order ${INT} NOT NULL DEFAULT 0,
      active ${INT} NOT NULL DEFAULT 1,
      created_at ${TEXT} ${NOW}
    `},
    { name: 'products', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      barcode ${TEXT} UNIQUE,
      name ${TEXT} NOT NULL,
      category_id ${TEXT_PK},
      price ${REAL} NOT NULL,
      cost_price ${REAL} DEFAULT 0,
      vat_rate ${REAL_RATE} NOT NULL DEFAULT 0.16,
      stock_quantity ${INT} NOT NULL DEFAULT 0,
      min_stock_level ${INT} NOT NULL DEFAULT 5,
      unit ${TEXT} NOT NULL DEFAULT 'each',
      active ${INT} NOT NULL DEFAULT 1,
      created_at ${TEXT} ${NOW},
      updated_at ${TEXT} ${NOW},
      FOREIGN KEY (category_id) REFERENCES categories(id)
    `},
    { name: 'sales', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      receipt_number ${TEXT} NOT NULL UNIQUE,
      user_id ${TEXT_PK} NOT NULL,
      shift_id ${TEXT_PK},
      subtotal ${REAL} NOT NULL,
      vat_total ${REAL} NOT NULL,
      discount_total ${REAL} NOT NULL DEFAULT 0,
      total ${REAL} NOT NULL,
      payment_method ${TEXT} NOT NULL,
      amount_tendered ${REAL},
      change_given ${REAL},
      mobile_ref ${TEXT},
      status ${TEXT} NOT NULL DEFAULT 'completed',
      void_reason ${TEXT},
      void_by ${TEXT_PK},
      zra_fiscal_code ${TEXT},
      created_at ${TEXT} ${NOW},
      FOREIGN KEY (user_id) REFERENCES users(id)
    `},
    { name: 'sale_items', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      sale_id ${TEXT_PK} NOT NULL,
      product_id ${TEXT_PK} NOT NULL,
      product_name ${TEXT} NOT NULL,
      barcode ${TEXT},
      quantity ${REAL} NOT NULL,
      unit_price ${REAL} NOT NULL,
      vat_rate ${REAL_RATE} NOT NULL,
      vat_amount ${REAL} NOT NULL,
      discount_amount ${REAL} NOT NULL DEFAULT 0,
      line_total ${REAL} NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    `},
    { name: 'shifts', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      user_id ${TEXT_PK} NOT NULL,
      opening_cash ${REAL} NOT NULL,
      closing_cash ${REAL},
      expected_cash ${REAL},
      variance ${REAL},
      total_sales ${REAL} DEFAULT 0,
      total_transactions ${INT} DEFAULT 0,
      total_vat ${REAL} DEFAULT 0,
      status ${TEXT} NOT NULL DEFAULT 'open',
      notes ${LONGTEXT},
      opened_at ${TEXT} ${NOW},
      closed_at ${TEXT},
      FOREIGN KEY (user_id) REFERENCES users(id)
    `},
    { name: 'audit_log', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      user_id ${TEXT_PK} NOT NULL,
      action ${TEXT} NOT NULL,
      entity_type ${TEXT},
      entity_id ${TEXT_PK},
      details ${LONGTEXT},
      created_at ${TEXT} ${NOW},
      FOREIGN KEY (user_id) REFERENCES users(id)
    `},
    { name: 'draft_sales', cols: `
      id ${TEXT_PK} PRIMARY KEY,
      user_id ${TEXT_PK} NOT NULL,
      items ${LONGTEXT} NOT NULL,
      created_at ${TEXT} ${NOW},
      updated_at ${TEXT} ${NOW}
    `},
    { name: 'settings', cols: `
      key ${TEXT} PRIMARY KEY,
      value ${TEXT} NOT NULL,
      updated_at ${TEXT} ${NOW}
    `}
  ]

  if (engine === 'mssql') {
    return tables.map(t =>
      `IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${t.name}')\nCREATE TABLE ${t.name} (${t.cols});`
    ).join('\n')
  }

  return tables.map(t =>
    `CREATE TABLE IF NOT EXISTS ${t.name} (${t.cols});`
  ).join('\n')
}

function getSeedDataSQL(engine: DbAdapter['engine']): string {
  if (engine === 'mssql') {
    // MSSQL: use MERGE or IF NOT EXISTS for idempotent inserts
    const rows = [
      { table: 'settings', keycol: '[key]', keyval: "'shop_name'", cols: '([key], value)', vals: "('shop_name', 'Ariemmas')" },
      { table: 'settings', keycol: '[key]', keyval: "'shop_address'", cols: '([key], value)', vals: "('shop_address', 'Independence Ave Mongu')" },
      { table: 'settings', keycol: '[key]', keyval: "'shop_phone'", cols: '([key], value)', vals: "('shop_phone', '097 4542233')" },
      { table: 'settings', keycol: '[key]', keyval: "'shop_tpin'", cols: '([key], value)', vals: "('shop_tpin', '')" },
      { table: 'settings', keycol: '[key]', keyval: "'vat_rate'", cols: '([key], value)', vals: "('vat_rate', '0.16')" },
      { table: 'settings', keycol: '[key]', keyval: "'currency_symbol'", cols: '([key], value)', vals: "('currency_symbol', 'K')" },
      { table: 'settings', keycol: '[key]', keyval: "'currency_code'", cols: '([key], value)', vals: "('currency_code', 'ZMW')" },
      { table: 'settings', keycol: '[key]', keyval: "'receipt_header'", cols: '([key], value)', vals: "('receipt_header', 'Welcome to Ariemmas!')" },
      { table: 'settings', keycol: '[key]', keyval: "'receipt_footer'", cols: '([key], value)', vals: "('receipt_footer', 'Thank you for shopping at Ariemmas!')" },
      { table: 'settings', keycol: '[key]', keyval: "'auto_logout_minutes'", cols: '([key], value)', vals: "('auto_logout_minutes', '15')" },
      { table: 'settings', keycol: '[key]', keyval: "'receipt_counter'", cols: '([key], value)', vals: "('receipt_counter', '0')" },
      { table: 'settings', keycol: '[key]', keyval: "'receipt_date'", cols: '([key], value)', vals: "('receipt_date', '')" },
      { table: 'categories', keycol: 'id', keyval: "'cat-groceries'", cols: '(id, name, sort_order)', vals: "('cat-groceries', 'Groceries', 1)" },
      { table: 'categories', keycol: 'id', keyval: "'cat-meat'", cols: '(id, name, sort_order)', vals: "('cat-meat', 'Meat & Fish', 2)" },
      { table: 'categories', keycol: 'id', keyval: "'cat-beverages'", cols: '(id, name, sort_order)', vals: "('cat-beverages', 'Beverages', 3)" },
      { table: 'categories', keycol: 'id', keyval: "'cat-household'", cols: '(id, name, sort_order)', vals: "('cat-household', 'Household', 4)" },
      { table: 'categories', keycol: 'id', keyval: "'cat-clothing'", cols: '(id, name, sort_order)', vals: "('cat-clothing', 'Clothing', 5)" },
      { table: 'categories', keycol: 'id', keyval: "'cat-electronics'", cols: '(id, name, sort_order)', vals: "('cat-electronics', 'Electronics', 6)" },
      { table: 'categories', keycol: 'id', keyval: "'cat-other'", cols: '(id, name, sort_order)', vals: "('cat-other', 'Other', 99)" },
    ]
    return rows.map(r =>
      `IF NOT EXISTS (SELECT 1 FROM ${r.table} WHERE ${r.keycol} = ${r.keyval}) INSERT INTO ${r.table} ${r.cols} VALUES ${r.vals};`
    ).join('\n')
  }

  const INSERT_IGNORE = engine === 'sqlite' ? 'INSERT OR IGNORE INTO' : 'INSERT INTO'
  const ON_CONFLICT = engine === 'postgres' ? ' ON CONFLICT DO NOTHING' : ''

  return `
    ${INSERT_IGNORE} settings (key, value) VALUES ('shop_name', 'Ariemmas')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('shop_address', 'Independence Ave Mongu')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('shop_phone', '097 4542233')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('shop_tpin', '')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('vat_rate', '0.16')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('currency_symbol', 'K')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('currency_code', 'ZMW')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('receipt_header', 'Welcome to Ariemmas!')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('receipt_footer', 'Thank you for shopping at Ariemmas!')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('auto_logout_minutes', '15')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('receipt_counter', '0')${ON_CONFLICT};
    ${INSERT_IGNORE} settings (key, value) VALUES ('receipt_date', '')${ON_CONFLICT};

    ${INSERT_IGNORE} categories (id, name, sort_order) VALUES ('cat-groceries', 'Groceries', 1)${ON_CONFLICT};
    ${INSERT_IGNORE} categories (id, name, sort_order) VALUES ('cat-meat', 'Meat & Fish', 2)${ON_CONFLICT};
    ${INSERT_IGNORE} categories (id, name, sort_order) VALUES ('cat-beverages', 'Beverages', 3)${ON_CONFLICT};
    ${INSERT_IGNORE} categories (id, name, sort_order) VALUES ('cat-household', 'Household', 4)${ON_CONFLICT};
    ${INSERT_IGNORE} categories (id, name, sort_order) VALUES ('cat-clothing', 'Clothing', 5)${ON_CONFLICT};
    ${INSERT_IGNORE} categories (id, name, sort_order) VALUES ('cat-electronics', 'Electronics', 6)${ON_CONFLICT};
    ${INSERT_IGNORE} categories (id, name, sort_order) VALUES ('cat-other', 'Other', 99)${ON_CONFLICT};
  `
}

export interface Migration {
  name: string
  getSql: (engine: DbAdapter['engine']) => string
}

function getSyncQueueSQL(engine: DbAdapter['engine']): string {
  const TEXT = engine === 'mssql' ? 'NVARCHAR(255)' : 'TEXT'
  const LONGTEXT = engine === 'mssql' ? 'NVARCHAR(MAX)' : 'TEXT'
  const NOW = engine === 'sqlite' ? "DEFAULT (datetime('now'))" :
              engine === 'mssql' ? 'DEFAULT GETDATE()' :
              'DEFAULT NOW()'
  const INT = 'INTEGER'

  if (engine === 'mssql') {
    return `
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '_sync_queue')
      CREATE TABLE _sync_queue (
        id ${INT} IDENTITY(1,1) PRIMARY KEY,
        operation ${TEXT} NOT NULL,
        entity_type ${TEXT} NOT NULL,
        entity_id ${TEXT} NOT NULL,
        payload ${LONGTEXT} NOT NULL,
        status ${TEXT} NOT NULL DEFAULT 'pending',
        attempts ${INT} NOT NULL DEFAULT 0,
        error ${LONGTEXT},
        created_at ${TEXT} ${NOW},
        synced_at ${TEXT}
      );
    `
  }

  if (engine === 'postgres') {
    return `
      CREATE TABLE IF NOT EXISTS _sync_queue (
        id SERIAL PRIMARY KEY,
        operation TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        synced_at TIMESTAMP
      );
    `
  }

  return `
    CREATE TABLE IF NOT EXISTS _sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT
    );
  `
}

function getCashAlertSettingsSQL(engine: DbAdapter['engine']): string {
  if (engine === 'mssql') {
    return `
      IF COL_LENGTH('shifts', 'cash_alert_sent_at') IS NULL
        ALTER TABLE shifts ADD cash_alert_sent_at NVARCHAR(255) NULL;

      IF NOT EXISTS (SELECT 1 FROM settings WHERE [key] = 'opening_cash_limit')
        INSERT INTO settings ([key], value) VALUES ('opening_cash_limit', '1000');
      IF NOT EXISTS (SELECT 1 FROM settings WHERE [key] = 'cash_alert_threshold')
        INSERT INTO settings ([key], value) VALUES ('cash_alert_threshold', '2000');
      IF NOT EXISTS (SELECT 1 FROM settings WHERE [key] = 'cash_alert_email')
        INSERT INTO settings ([key], value) VALUES ('cash_alert_email', '');
    `
  }

  if (engine === 'postgres') {
    return `
      ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_alert_sent_at TEXT;

      INSERT INTO settings (key, value) VALUES ('opening_cash_limit', '1000') ON CONFLICT DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('cash_alert_threshold', '2000') ON CONFLICT DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('cash_alert_email', '') ON CONFLICT DO NOTHING;
    `
  }

  return `
    ALTER TABLE shifts ADD COLUMN cash_alert_sent_at TEXT;

    INSERT OR IGNORE INTO settings (key, value) VALUES ('opening_cash_limit', '1000');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('cash_alert_threshold', '2000');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('cash_alert_email', '');
  `
}

function getWeightedAndTerminalSQL(engine: DbAdapter['engine']): string {
  if (engine === 'mssql') {
    return `
      IF COL_LENGTH('products', 'is_weighted') IS NULL
        ALTER TABLE products ADD is_weighted INT NOT NULL DEFAULT 0;
      IF COL_LENGTH('sales', 'terminal_id') IS NULL
        ALTER TABLE sales ADD terminal_id NVARCHAR(255) NULL;
      IF NOT EXISTS (SELECT 1 FROM settings WHERE [key] = 'terminal_id')
        INSERT INTO settings ([key], value) VALUES ('terminal_id', '');
      IF NOT EXISTS (SELECT 1 FROM settings WHERE [key] = 'terminal_name')
        INSERT INTO settings ([key], value) VALUES ('terminal_name', 'Terminal');
    `
  }

  if (engine === 'postgres') {
    return `
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_weighted INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS terminal_id TEXT;
      INSERT INTO settings (key, value) VALUES ('terminal_id', '') ON CONFLICT DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('terminal_name', 'Terminal') ON CONFLICT DO NOTHING;
    `
  }

  return `
    ALTER TABLE products ADD COLUMN is_weighted INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN terminal_id TEXT;
    INSERT OR IGNORE INTO settings (key, value) VALUES ('terminal_id', '');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('terminal_name', 'Terminal');
  `
}

export const MIGRATIONS: Migration[] = [
  {
    name: '001_initial_schema',
    getSql: (engine) => getCreateSchemaSQL(engine)
  },
  {
    name: '002_seed_data',
    getSql: (engine) => getSeedDataSQL(engine)
  },
  {
    name: '003_sync_queue',
    getSql: (engine) => getSyncQueueSQL(engine)
  },
  {
    name: '004_cash_alert_settings',
    getSql: (engine) => getCashAlertSettingsSQL(engine)
  },
  {
    name: '005_weighted_and_terminal',
    getSql: (engine) => getWeightedAndTerminalSQL(engine)
  },
  {
    name: '006_shifts_cashier_name',
    getSql: (engine) => {
      if (engine === 'mssql') {
        return `IF COL_LENGTH('shifts', 'cashier_name') IS NULL ALTER TABLE shifts ADD cashier_name NVARCHAR(255) NULL;`
      }
      if (engine === 'postgres') {
        return `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cashier_name TEXT;`
      }
      return `ALTER TABLE shifts ADD COLUMN cashier_name TEXT;`
    }
  },
  {
    // Weighted (butchery) items sell fractional quantities (e.g. 0.450 kg), so
    // stock must hold decimals. Postgres/MSSQL declared stock_quantity as
    // INTEGER, which rejects a fractional decrement and 500s the sale. Widen to
    // a numeric type. SQLite is dynamically typed and already stores decimals.
    name: '007_stock_quantity_numeric',
    getSql: (engine) => {
      if (engine === 'mssql') {
        return `ALTER TABLE products ALTER COLUMN stock_quantity DECIMAL(12,3) NOT NULL;`
      }
      if (engine === 'postgres') {
        return `ALTER TABLE products ALTER COLUMN stock_quantity TYPE NUMERIC(12,3);`
      }
      return `SELECT 1;` // sqlite: no-op, column already holds reals
    }
  },
  {
    // Product images. image_filename = locally cached file on the POS (served
    // offline via the posimg:// protocol). image_url = the Cloudinary URL used
    // online and to pull the image down on sync.
    name: '008_product_images',
    getSql: (engine) => {
      if (engine === 'mssql') {
        return `
          IF COL_LENGTH('products', 'image_filename') IS NULL ALTER TABLE products ADD image_filename NVARCHAR(255) NULL;
          IF COL_LENGTH('products', 'image_url') IS NULL ALTER TABLE products ADD image_url NVARCHAR(1024) NULL;
        `
      }
      if (engine === 'postgres') {
        return `
          ALTER TABLE products ADD COLUMN IF NOT EXISTS image_filename TEXT;
          ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
        `
      }
      return `
        ALTER TABLE products ADD COLUMN image_filename TEXT;
        ALTER TABLE products ADD COLUMN image_url TEXT;
      `
    }
  },
  {
    // Readable copy of each PIN so an admin can view current cashier logins in
    // the Cashiers screen (PINs are otherwise one-way bcrypt-hashed). Admin-only;
    // never returned by the public web API.
    name: '009_user_pin_plain',
    getSql: (engine) => {
      if (engine === 'mssql') {
        return `IF COL_LENGTH('users', 'pin_plain') IS NULL ALTER TABLE users ADD pin_plain NVARCHAR(255) NULL;`
      }
      if (engine === 'postgres') {
        return `ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_plain TEXT;`
      }
      return `ALTER TABLE users ADD COLUMN pin_plain TEXT;`
    }
  },
  {
    // Inventory audit trail: one row per stock change (a sale line, a restock,
    // or a manual correction) so the admin can see how stock moved over time.
    name: '010_stock_movements',
    getSql: (engine) => {
      const num = engine === 'mssql' ? 'DECIMAL(12,3)' : engine === 'postgres' ? 'NUMERIC(12,3)' : 'REAL'
      const txt = engine === 'mssql' ? 'NVARCHAR(255)' : 'TEXT'
      const pk = engine === 'mssql' ? 'NVARCHAR(50)' : 'TEXT'
      const created = engine === 'sqlite' ? "TEXT DEFAULT (datetime('now'))"
        : engine === 'mssql' ? 'DATETIME2 DEFAULT GETDATE()'
        : 'TIMESTAMPTZ DEFAULT NOW()'
      const cols = `(
        id ${pk} PRIMARY KEY,
        product_id ${pk},
        type ${txt},
        quantity_change ${num},
        balance_after ${num},
        reason ${txt},
        user_id ${pk},
        terminal_id ${txt},
        created_at ${created}
      )`
      if (engine === 'mssql') {
        return `IF OBJECT_ID('stock_movements','U') IS NULL CREATE TABLE stock_movements ${cols};`
      }
      return `CREATE TABLE IF NOT EXISTS stock_movements ${cols};`
    }
  },
  {
    // Scale PLU: links a product to its number on the label-printing scale, so a
    // scanned scale label (EAN-13 flag 2) can be matched to this product.
    name: '011_product_scale_plu',
    getSql: (engine) => {
      if (engine === 'mssql') {
        return `IF COL_LENGTH('products', 'scale_plu') IS NULL ALTER TABLE products ADD scale_plu INT NULL;`
      }
      if (engine === 'postgres') {
        // lock_timeout so this fails fast instead of hanging when another
        // connection holds a lock on products — e.g. the previous deploy during
        // Railway's zero-downtime overlap. The server boot (src/server/index.ts)
        // catches the failure, starts serving anyway, and retries in the
        // background; once the old container is stopped the lock clears and the
        // retry adds the column.
        return `SET lock_timeout = '5s'; ALTER TABLE products ADD COLUMN IF NOT EXISTS scale_plu INTEGER; RESET lock_timeout;`
      }
      return `ALTER TABLE products ADD COLUMN scale_plu INTEGER;`
    }
  },
  {
    // One-time backlog recovery. The shop's first day ran on an older build whose
    // sync silently failed yet still marked sales 'synced' in the local queue —
    // so those sales never reached the cloud and the till won't re-send them.
    // Reset sale + shift queue rows to pending so they re-upload on the next sync.
    // The cloud sync is now idempotent (INSERT ... ON CONFLICT DO NOTHING), so
    // re-sending an already-synced row is a harmless no-op. No effect on the cloud
    // itself — only tills push, and a freshly-synced till just re-confirms its rows.
    name: '012_requeue_orphaned_sales',
    getSql: () =>
      `UPDATE _sync_queue SET status = 'pending', attempts = 0 WHERE entity_type IN ('sale', 'shift') AND status = 'synced';`
  }
]

export function getMigrationTableSQL(engine: DbAdapter['engine']): string {
  if (engine === 'mssql') {
    return `
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '_migrations')
      CREATE TABLE _migrations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT GETDATE()
      )
    `
  }
  if (engine === 'postgres') {
    return `
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `
  }
  return `
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
}

export async function runMigrations(db: DbAdapter): Promise<void> {
  const migrationTableSql = getMigrationTableSQL(db.engine)
  await db.exec(migrationTableSql)

  const applied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM _migrations')).map(r => r.name)
  )

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.name)) {
      const sql = migration.getSql(db.engine)
      await db.exec(sql)
      await db.run('INSERT INTO _migrations (name) VALUES (?)', [migration.name])
    }
  }
}
