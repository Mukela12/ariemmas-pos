import { Pool } from 'pg'
import type { DbAdapter } from './adapter'

export interface PostgresConfig {
  connectionString?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  ssl?: boolean | { rejectUnauthorized: boolean }
}

export class PostgresAdapter implements DbAdapter {
  readonly engine = 'postgres' as const
  private pool: Pool

  constructor(cfg: PostgresConfig) {
    this.pool = new Pool({
      connectionString: cfg.connectionString,
      host: cfg.host,
      port: cfg.port || 5432,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      ssl: cfg.ssl
    })
  }

  // Convert ? placeholders to $1, $2, ... for Postgres
  private convertPlaceholders(sql: string): string {
    let index = 0
    return sql.replace(/\?/g, () => `$${++index}`)
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const converted = this.convertPlaceholders(sql)
    const result = await this.pool.query(converted, params)
    return result.rows as T[]
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params)
    return rows[0] ?? null
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    const converted = this.convertPlaceholders(sql)
    await this.pool.query(converted, params)
  }

  // Run raw multi-statement SQL
  async exec(sql: string): Promise<void> {
    await this.pool.query(sql)
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn()
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
