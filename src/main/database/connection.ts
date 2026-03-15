import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { DbAdapter } from './adapter'
import { SqliteAdapter } from './sqliteAdapter'
import { runMigrations } from './migrations'
import { now, dateOf } from './adapter'

let db: DbAdapter

// Detect which database engine to use based on environment variables
// DB_ENGINE=mssql | postgres | sqlite (default)
export async function setupDatabase(): Promise<DbAdapter> {
  const engine = process.env.DB_ENGINE || 'sqlite'

  if (engine === 'mssql') {
    const { MssqlAdapter } = await import('./mssqlAdapter')
    const adapter = new MssqlAdapter({
      server: process.env.MSSQL_SERVER || 'localhost',
      database: process.env.MSSQL_DATABASE || 'ariemmas_pos',
      user: process.env.MSSQL_USER || 'sa',
      password: process.env.MSSQL_PASSWORD || '',
      port: parseInt(process.env.MSSQL_PORT || '1433'),
      options: {
        encrypt: process.env.MSSQL_ENCRYPT === 'true',
        trustServerCertificate: process.env.MSSQL_TRUST_CERT !== 'false'
      }
    })
    // Auto-create the database if it doesn't exist
    await adapter.ensureDatabase()
    db = adapter
  } else if (engine === 'postgres') {
    const { PostgresAdapter } = await import('./postgresAdapter')
    db = new PostgresAdapter({
      connectionString: process.env.DATABASE_URL,
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE || 'ariemmas_pos',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
    })
  } else {
    // Default: SQLite for development and fallback
    const isDev = !app.isPackaged
    const dbDir = isDev ? process.cwd() : app.getPath('userData')
    const dbPath = path.join(dbDir, 'ariemmas-pos.db')

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    db = new SqliteAdapter(dbPath)
  }

  await runMigrations(db)
  return db
}

export function getDb(): DbAdapter {
  if (!db) throw new Error('Database not initialized. Call setupDatabase() first.')
  return db
}

// Re-export dialect helpers for services to use
export { now, dateOf }
