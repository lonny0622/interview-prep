import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, it } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'interviewprep-auth-test-'))
globalThis.process.env.INTERVIEWPREP_DATA_DIR = dataDir

after(() => rmSync(dataDir, { recursive: true, force: true }))

it('persists login lockouts across limiter instances', async () => {
  const { LoginAttemptLimiter } = await import('../../dist-server/auth/rate-limiter.js')
  const { authAttemptStore } = await import('../../dist-server/db/repositories/auth.repository.js')
  const first = new LoginAttemptLimiter(2, 60_000, 300_000, authAttemptStore)

  assert.equal(first.consume('ip:203.0.113.1', 1_000).allowed, true)
  assert.equal(first.consume('ip:203.0.113.1', 1_001).allowed, true)
  assert.equal(first.consume('ip:203.0.113.1', 1_002).allowed, false)

  const restarted = new LoginAttemptLimiter(2, 60_000, 300_000, authAttemptStore)
  assert.equal(restarted.consume('ip:203.0.113.1', 2_000).allowed, false)
})

it('keeps exactly one active session and invalidates the previous one', async () => {
  const { clearActiveSession, isActiveSession, setActiveSession } = await import('../../dist-server/db/repositories/auth.repository.js')
  const now = 10_000

  setActiveSession('session-one', now + 60_000, now)
  assert.equal(isActiveSession('session-one', now + 1), true)

  setActiveSession('session-two', now + 60_000, now + 2)
  assert.equal(isActiveSession('session-one', now + 3), false)
  assert.equal(isActiveSession('session-two', now + 3), true)

  clearActiveSession('session-two')
  assert.equal(isActiveSession('session-two', now + 4), false)
})
