import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { scryptSync } from 'node:crypto'
import { describe, it } from 'node:test'
import { DEFAULT_AUTH_SESSION_TTL_SECONDS } from '../../dist-server/config/env.js'
import { constantTimeTextEqual, verifyPassword } from '../../dist-server/auth/password.js'
import { LoginAttemptLimiter } from '../../dist-server/auth/rate-limiter.js'
import { createSessionToken, parseCookies, sessionCookie, verifySessionToken } from '../../dist-server/auth/session.js'

function testPasswordHash(password) {
  const salt = Buffer.from('0123456789abcdef01234567')
  const hash = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

describe('single-account authentication primitives', () => {
  it('uses a 30-day default session lifetime', () => {
    assert.equal(DEFAULT_AUTH_SESSION_TTL_SECONDS, 30 * 24 * 60 * 60)
  })

  it('verifies the configured scrypt password without leaking username equality', async () => {
    const encoded = testPasswordHash('a-long-random-password')
    assert.equal(await verifyPassword('a-long-random-password', encoded), true)
    assert.equal(await verifyPassword('wrong-password', encoded), false)
    assert.equal(constantTimeTextEqual('owner', 'owner'), true)
    assert.equal(constantTimeTextEqual('other', 'owner'), false)
  })

  it('rejects tampered and expired signed sessions', () => {
    const now = Date.UTC(2026, 7, 24)
    const hash = testPasswordHash('a-long-random-password')
    const token = createSessionToken('owner', 'test-session-id-that-is-long-enough', hash, 'a-session-secret-that-is-long-enough', 60, now)
    assert.equal(verifySessionToken(token, 'owner', hash, 'a-session-secret-that-is-long-enough', now)?.sub, 'owner')
    assert.equal(verifySessionToken(`${token}x`, 'owner', hash, 'a-session-secret-that-is-long-enough', now), null)
    assert.equal(verifySessionToken(token, 'owner', hash, 'a-session-secret-that-is-long-enough', now + 61_000), null)
    assert.equal(verifySessionToken(token, 'owner', `${hash}changed`, 'a-session-secret-that-is-long-enough', now), null)
  })

  it('creates strict HttpOnly cookies and parses encoded values', () => {
    const cookie = sessionCookie('header.payload', 120, true)
    assert.match(cookie, /^__Host-interviewprep_session=/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Strict/)
    assert.match(cookie, /Secure/)
    assert.match(cookie, /Max-Age=120/)
    assert.match(cookie, /Expires=/)
    assert.equal(parseCookies('one=1; encoded=hello%20world').encoded, 'hello world')
  })

  it('blocks attempts after the configured allowance and recovers after reset', () => {
    const limiter = new LoginAttemptLimiter(2, 60_000, 30_000)
    assert.equal(limiter.consume('ip', 1_000).allowed, true)
    assert.equal(limiter.consume('ip', 2_000).allowed, true)
    assert.equal(limiter.consume('ip', 3_000).allowed, false)
    limiter.reset('ip')
    assert.equal(limiter.consume('ip', 4_000).allowed, true)
  })
})
