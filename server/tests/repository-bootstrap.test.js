import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, it } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'interviewprep-bootstrap-test-'))
globalThis.process.env.INTERVIEWPREP_DATA_DIR = dataDir

after(() => rmSync(dataDir, { recursive: true, force: true }))

it('initializes a fresh database before repositories prepare statements', async () => {
  const repository = await import('../../dist-server/db/repositories/question.repository.js')
  assert.deepEqual(repository.listQuestions(), [])
  assert.deepEqual(repository.listCategories(), [])
})
