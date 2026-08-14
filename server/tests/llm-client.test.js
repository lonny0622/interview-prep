import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { completeChat } from '../../dist-server/services/llm/client.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('LLM client', () => {
  it('uses injected endpoint and authentication settings', async () => {
    let request
    globalThis.fetch = async (url, init) => {
      request = { url, init }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'model output' } }] }) }
    }

    const content = await completeChat(
      { model: 'test-model', messages: [{ role: 'user', content: 'hello' }] },
      { baseUrl: 'https://llm.example.test', apiKey: 'test-key', requestTimeoutMs: 100 },
    )

    assert.equal(content, 'model output')
    assert.equal(request.url, 'https://llm.example.test/v1/chat/completions')
    assert.equal(request.init.headers.Authorization, 'Bearer test-key')
    assert.equal(JSON.parse(request.init.body).model, 'test-model')
  })
})
