import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import process from 'node:process'
import { after, it } from 'node:test'
import { DatabaseSync } from 'node:sqlite'

const execute = promisify(execFile)
const dataDir = mkdtempSync(join(tmpdir(), 'interviewprep-backup-test-'))
const backupDir = join(dataDir, 'backups')

after(() => rmSync(dataDir, { recursive: true, force: true }))

it('creates and verifies an application-aware SQLite backup', async () => {
  await execute(process.execPath, ['dist-server/backup.js'], {
    env: { ...process.env, INTERVIEWPREP_DATA_DIR: dataDir, INTERVIEWPREP_BACKUP_DIR: backupDir },
  })
  const files = readdirSync(backupDir).filter((name) => name.endsWith('.sqlite'))
  assert.equal(files.length, 1)
  const copy = new DatabaseSync(join(backupDir, files[0]), { readOnly: true })
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.equal(copy.prepare('PRAGMA user_version').get().user_version, 3)
  copy.close()
})
