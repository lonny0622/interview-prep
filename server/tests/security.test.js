import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { requestClientAddress } from '../../dist-server/http/security.js'

describe('proxy client address handling', () => {
  it('uses the nearest valid forwarded address instead of a client-prepended value', () => {
    const request = {
      headers: { 'x-forwarded-for': '198.51.100.23, garbage, 203.0.113.9' },
      socket: { remoteAddress: '10.0.0.2' },
    }
    assert.equal(requestClientAddress(request, true), '203.0.113.9')
  })

  it('ignores forwarded headers when the proxy is not trusted', () => {
    const request = {
      headers: { 'x-forwarded-for': '198.51.100.23' },
      socket: { remoteAddress: '127.0.0.1' },
    }
    assert.equal(requestClientAddress(request, false), '127.0.0.1')
  })
})
