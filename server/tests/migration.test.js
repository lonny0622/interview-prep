import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, it } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'interviewprep-migration-test-'))
const dataPath = join(dataDir, 'interviewprep.sqlite')
const legacy = new DatabaseSync(dataPath)
legacy.exec(`
  CREATE TABLE questions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, difficulty TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 3, mastery TEXT NOT NULL DEFAULT '未学习', answer TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '', interview_answer TEXT NOT NULL DEFAULT '', follow_ups TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  INSERT INTO questions VALUES ('legacy-question', '保留旧题目', '迁移测试', '中等', 3, '熟悉', '答案', '解析', '回答', '[]', '2026-01-01', '2026-01-01');
`)
legacy.close()

globalThis.process.env.INTERVIEWPREP_DATA_DIR = dataDir
after(() => rmSync(dataDir, { recursive: true, force: true }))

it('migrates a pre-versioned database without losing existing questions', async () => {
  await import('../../dist-server/db/schema.js')
  const { closeDatabase, database } = await import('../../dist-server/db/connection.js')

  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 4)
  assert.equal(database.prepare('SELECT title FROM questions WHERE id = ?').get('legacy-question').title, '保留旧题目')
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('auth_login_attempts', 'auth_sessions')").get().count, 2)
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'auth_active_session'").get().count, 0)
  closeDatabase()
})
