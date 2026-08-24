import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { readBody, readJson } from '../../dist-server/http/body.js'

function requestFrom(chunks, headers = {}) {
  const request = Readable.from(chunks)
  request.headers = headers
  return request
}

describe('bounded HTTP body reader', () => {
  it('reads valid JSON and counts UTF-8 bytes', async () => {
    const request = requestFrom([Buffer.from('{"name":"穆"}')])
    assert.deepEqual(await readJson(request, 64), { name: '穆' })
  })

  it('rejects an oversized declared length before buffering', async () => {
    const request = requestFrom([Buffer.alloc(100)], { 'content-length': '100' })
    await assert.rejects(readBody(request, 10), /超过 10B 限制/)
  })

  it('stops retaining chunked data after the byte limit', async () => {
    const request = requestFrom([Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)])
    await assert.rejects(readBody(request, 10), /超过 10B 限制/)
    assert.equal(request.listenerCount('data'), 0)
  })
})
