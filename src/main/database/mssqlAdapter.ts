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
  private dbName: string

  constructor(cfg: MssqlConfig) {
    this.dbName = cfg.database
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

  async ensureDatabase(): Promise<void> {
    // Connect to master to create the database if it doesn't exist
    const masterConfig = { ...this.config, database: 'master' }
    const masterPool = await new sql.ConnectionPool(masterConfig).connect()
    try {
      const result = await masterPool.request().query(
        `SELECT DB_ID('${this.dbName}') AS id`
      )
      if (!result.recordset[0]?.id) {
        await masterPool.request().batch(`CREATE DATABASE [${this.dbName}]`)
        console.log(`[MSSQL] Created database: ${this.dbName}`)
      }
    } finally {
      await masterPool.close()
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

  // Convert LIMIT ? OFFSET ? to MSSQL's OFFSET...FETCH syntax
  // Also handles LIMIT ? without OFFSET
  private convertLimitOffset(sqlStr: string, params: any[]): { sql: string; params: any[] } {
    // Pattern: ORDER BY ... LIMIT ? OFFSET ?
    const limitOffsetMatch = sqlStr.match(/\bLIMIT\s+\?\s+OFFSET\s+\?/i)
    if (limitOffsetMatch) {
      // In SQLite/Postgres: LIMIT limit OFFSET offset
      // In MSSQL: OFFSET offset ROWS FETCH NEXT limit ROWS ONLY
      // The params order is [limit, offset] → need to swap to [offset, limit]
      const idx = sqlStr.indexOf(limitOffsetMatch[0])
      const before = sqlStr.substring(0, idx)
      const after = sqlStr.substring(idx + limitOffsetMatch[0].length)

      // Need ORDER BY for OFFSET/FETCH in MSSQL
      const hasOrderBy = /ORDER\s+BY\s+/i.test(before)
      const orderClause = hasOrderBy ? '' : 'ORDER BY (SELECT NULL) '

      // Find the param positions for LIMIT and OFFSET
      const placeholdersBefore = (before.match(/\?/g) || []).length
      const limitParamIdx = placeholdersBefore
      const offsetParamIdx = placeholdersBefore + 1

      const newParams = [...params]
      const limitVal = newParams[limitParamIdx]
      const offsetVal = newParams[offsetParamIdx]

      // Replace with MSSQL syntax — swap offset and limit in params
      newParams[limitParamIdx] = offsetVal
      newParams[offsetParamIdx] = limitVal

      return {
        sql: `${before}${orderClause}OFFSET ? ROWS FETCH NEXT ? ROWS ONLY${after}`,
        params: newParams
      }
    }

    // Pattern: LIMIT ? (without OFFSET)
    const limitOnlyMatch = sqlStr.match(/\bLIMIT\s+\?/i)
    if (limitOnlyMatch) {
      const idx = sqlStr.indexOf(limitOnlyMatch[0])
      const before = sqlStr.substring(0, idx)
      const after = sqlStr.substring(idx + limitOnlyMatch[0].length)

      // Convert SELECT ... LIMIT ? to SELECT TOP (?) ...
      // But it's easier to use OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY
      const hasOrderBy = /ORDER\s+BY\s+/i.test(before)
      const orderClause = hasOrderBy ? '' : 'ORDER BY (SELECT NULL) '

      // Add a 0 param for OFFSET before the LIMIT param
      const placeholdersBefore = (before.match(/\?/g) || []).length
      const newParams = [...params]
      newParams.splice(placeholdersBefore, 0, 0)

      return {
        sql: `${before}${orderClause}OFFSET ? ROWS FETCH NEXT ? ROWS ONLY${after}`,
        params: newParams
      }
    }

    // Pattern: LIMIT <number> (hardcoded, e.g., LIMIT 50)
    const limitHardcoded = sqlStr.match(/\bLIMIT\s+(\d+)/i)
    if (limitHardcoded) {
      const limit = parseInt(limitHardcoded[1])
      const idx = sqlStr.indexOf(limitHardcoded[0])
      const before = sqlStr.substring(0, idx)
      const after = sqlStr.substring(idx + limitHardcoded[0].length)
      const hasOrderBy = /ORDER\s+BY\s+/i.test(before)
      const orderClause = hasOrderBy ? '' : 'ORDER BY (SELECT NULL) '
      return {
        sql: `${before}${orderClause}OFFSET 0 ROWS FETCH NEXT ${limit} ROWS ONLY${after}`,
        params
      }
    }

    return { sql: sqlStr, params }
  }

  async query<T = any>(sqlStr: string, params: any[] = []): Promise<T[]> {
    const pool = await this.getPool()
    const request = pool.request()
    const { sql: adaptedSql, params: adaptedParams } = this.convertLimitOffset(sqlStr, params)
    const converted = this.convertPlaceholders(adaptedSql)
    adaptedParams.forEach((val, i) => request.input(`p${i + 1}`, val))
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
    const { sql: adaptedSql, params: adaptedParams } = this.convertLimitOffset(sqlStr, params)
    const converted = this.convertPlaceholders(adaptedSql)
    adaptedParams.forEach((val, i) => request.input(`p${i + 1}`, val))
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
