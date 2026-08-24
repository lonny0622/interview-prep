import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dataPath = resolve(
  process.env.INTERVIEWPREP_DATA_DIR || resolve(dirname(new URL(import.meta.url).pathname), '../../data'),
  'interviewprep.sqlite',
)

mkdirSync(dirname(dataPath), { recursive: true })

/** 单例数据库连接；schema/migration 在业务 repository 加载前执行。 */
export const database = new DatabaseSync(dataPath)
database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

export function databaseIsReady(): boolean {
  try {
    return Number((database.prepare('SELECT 1 AS ok').get() as { ok?: number } | undefined)?.ok) === 1
  } catch {
    return false
  }
}

export function closeDatabase(): void {
  try { database.close() } catch { /* already closed */ }
}

export { dataPath }
