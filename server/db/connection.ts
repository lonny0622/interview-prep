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
database.exec('PRAGMA foreign_keys = ON;')

export { dataPath }
