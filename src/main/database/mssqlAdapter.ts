import sql from 'mssql'
import type { DbAdapter } from './adapter'

export interface MssqlConfig {
  server: string
  database: string
  user?: string
  password?: string
  port?: number
  options?: {
    encrypt?: boolean
    trustServerCertificate?: boolean
  }
}

export class MssqlAdapter implements DbAdapter {
  readonly engine = 'mssql' as const
  private pool: sql.ConnectionPool | null = null
  private config: sql.config

  constructor(cfg: MssqlConfig) {
    this.config = {
      server: cfg.server,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      port: cfg.port || 1433,
      options: {
        encrypt: cfg.options?.encrypt ?? false,
        trustServerCertificate: cfg.options?.trustServerCertificate ?? true
      }
    }
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (!this.pool) {
      this.pool = await new sql.ConnectionPool(this.config).connect()
    }
    return this.pool
  }

  // Convert ? placeholders to @p1, @p2, ... for MSSQL
  private convertPlaceholders(sqlStr: string): string {
    let index = 0
    return sqlStr.replace(/\?/g, () => `@p${++index}`)
  }

  async query<T = any>(sqlStr: string, params: any[] = []): Promise<T[]> {
    const pool = await this.getPool()
    const request = pool.request()
    const converted = this.convertPlaceholders(sqlStr)
    params.forEach((val, i) => request.input(`p${i + 1}`, val))
    const result = await request.query(converted)
    return result.recordset as T[]
  }

  async queryOne<T = any>(sqlStr: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sqlStr, params)
    return rows[0] ?? null
  }

  async run(sqlStr: string, params: any[] = []): Promise<void> {
    const pool = await this.getPool()
    const request = pool.request()
    const converted = this.convertPlaceholders(sqlStr)
    params.forEach((val, i) => request.input(`p${i + 1}`, val))
    await request.query(converted)
  }

  // Run raw multi-statement SQL via batch
  async exec(sqlStr: string): Promise<void> {
    const pool = await this.getPool()
    await pool.request().batch(sqlStr)
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const pool = await this.getPool()
    const trans = new sql.Transaction(pool)
    await trans.begin()
    try {
      const result = await fn()
      await trans.commit()
      return result
    } catch (err) {
      await trans.rollback()
      throw err
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close()
      this.pool = null
    }
  }
}
