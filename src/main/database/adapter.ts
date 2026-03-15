export interface DbAdapter {
  // Run a query that returns rows
  query<T = any>(sql: string, params?: any[]): Promise<T[]>
  // Run a query that returns one row or null
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  // Run a statement (INSERT, UPDATE, DELETE) — returns nothing
  run(sql: string, params?: any[]): Promise<void>
  // Run raw SQL (for migrations) — may contain multiple statements
  exec(sql: string): Promise<void>
  // Run multiple operations in a transaction
  transaction<T>(fn: () => Promise<T>): Promise<T>
  // Close the connection
  close(): Promise<void>
  // The database engine type
  readonly engine: 'sqlite' | 'mssql' | 'postgres'
}

// SQL dialect helpers — each engine uses different syntax for common operations
export function now(engine: DbAdapter['engine']): string {
  switch (engine) {
    case 'sqlite': return "datetime('now')"
    case 'mssql': return 'GETDATE()'
    case 'postgres': return 'NOW()'
  }
}

export function dateOf(column: string, engine: DbAdapter['engine']): string {
  switch (engine) {
    case 'sqlite': return `date(${column})`
    case 'mssql': return `CAST(${column} AS DATE)`
    case 'postgres': return `${column}::date`
  }
}

export function placeholder(index: number, engine: DbAdapter['engine']): string {
  switch (engine) {
    case 'sqlite': return '?'
    case 'mssql': return `@p${index}`
    case 'postgres': return `$${index}`
  }
}

export function placeholders(count: number, engine: DbAdapter['engine']): string {
  return Array.from({ length: count }, (_, i) => placeholder(i + 1, engine)).join(', ')
}

export function boolVal(val: boolean, engine: DbAdapter['engine']): any {
  switch (engine) {
    case 'sqlite': return val ? 1 : 0
    case 'mssql': return val ? 1 : 0
    case 'postgres': return val
  }
}
