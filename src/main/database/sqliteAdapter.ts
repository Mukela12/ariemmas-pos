import Database from 'better-sqlite3'
import type { DbAdapter } from './adapter'

export class SqliteAdapter implements DbAdapter {
  readonly engine = 'sqlite' as const
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[]
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T) ?? null
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    this.db.prepare(sql).run(...params)
  }

  async execRaw(sql: string): Promise<void> {
    this.db.exec(sql)
  }

  // DbAdapter.exec — runs raw multi-statement SQL
  async exec(sql: string): Promise<void> {
    this.db.exec(sql)
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN')
    try {
      const result = await fn()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  async close(): Promise<void> {
    this.db.close()
  }

  getRawDb(): Database.Database {
    return this.db
  }
}
