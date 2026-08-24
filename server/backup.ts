import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { logEvent } from './http/logger.js'

await import('./db/schema.js')
const { closeDatabase, database, dataPath } = await import('./db/connection.js')

const backupDir = resolve(process.env.INTERVIEWPREP_BACKUP_DIR || resolve(process.env.INTERVIEWPREP_DATA_DIR || './data', 'backups'))
const retention = positiveInteger(process.env.INTERVIEWPREP_BACKUP_RETENTION, 7)
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const destination = resolve(backupDir, `interviewprep-${timestamp}.sqlite`)

mkdirSync(backupDir, { recursive: true })

try {
  const pages = await backup(database, destination, { rate: 100 })
  const verification = new DatabaseSync(destination, { readOnly: true })
  const integrity = verification.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined
  verification.close()
  if (integrity?.integrity_check !== 'ok') throw new Error(`备份完整性检查失败：${integrity?.integrity_check || 'unknown'}`)
  rotateBackups(backupDir, retention)
  logEvent('info', 'database_backup_completed', { source: dataPath, destination, pages })
} catch (error) {
  rmSync(destination, { force: true })
  logEvent('error', 'database_backup_failed', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
} finally {
  closeDatabase()
}

function rotateBackups(directory: string, keep: number): void {
  const files = readdirSync(directory).filter((name) => /^interviewprep-.*\.sqlite$/.test(name)).sort().reverse()
  for (const name of files.slice(keep)) rmSync(resolve(directory, name), { force: true })
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
