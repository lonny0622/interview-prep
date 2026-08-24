import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { streamChat } from '../../dist-server/services/llm/client.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('LLM token streaming', () => {
  it('parses SSE delta content and ignores finish markers', async () => {
    const encoder = new globalThis.TextEncoder()
    globalThis.fetch = async () => new globalThis.Response(new globalThis.ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"第二段"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }), { status: 200 })

    const chunks = []
    for await (const chunk of streamChat({ model: 'test-model', messages: [{ role: 'user', content: 'hello' }] }, { baseUrl: 'https://llm.example.test', apiKey: 'key', requestTimeoutMs: 1000 })) chunks.push(chunk)

    assert.deepEqual(chunks, ['第一段', '第二段'])
  })
})
