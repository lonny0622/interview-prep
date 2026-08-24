import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'
import { handleLlmRoutes } from '../../dist-server/routes/llm.routes.js'

function createRequest(body) {
  const request = new EventEmitter()
  request.method = 'POST'
  request.url = '/api/llm/enrich-questions/stream'
  request.headers = {}
  request.destroyed = false
  request.setEncoding = () => {}
  globalThis.queueMicrotask(() => {
    request.emit('data', JSON.stringify(body))
    request.emit('end')
    // Node 可能在请求体消费完成后销毁 IncomingMessage；响应仍应继续流式写入。
    request.destroyed = true
  })
  return request
}

function createResponse() {
  const events = new EventEmitter()
  return {
    body: '',
    destroyed: false,
    writableEnded: false,
    headersSent: false,
    statusCode: 0,
    headers: {},
    once: events.once.bind(events),
    off: events.off.bind(events),
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
      this.headersSent = true
    },
    write(chunk) {
      this.body += chunk
      return true
    },
    end(chunk = '') {
      this.body += chunk
      this.writableEnded = true
    },
  }
}

describe('LLM streaming route', () => {
  it('writes start, ordered progress and completion events as NDJSON', async () => {
    const questions = ['Q1', 'Q2', 'Q3', 'Q4'].map((title) => ({ title, difficulty: '中等', category: 'React' }))
    const request = createRequest({ category: 'React', questions })
    const response = createResponse()
    const services = {
      callModel: async () => [],
      normalizeQuestionOutline: (value) => value,
      enrichQuestionBatch: async () => [],
      enrichQuestionBatchStream: async function* () {
        yield questions.slice(0, 3)
        yield questions.slice(3)
      },
      scoreAnswer: async () => ({}),
      fallbackScore: () => ({}),
    }

    const handled = await handleLlmRoutes(request, response, {
      baseUrl: 'https://llm.example.test', model: 'test-model', importModel: 'test-import-model', apiKey: 'key', provider: 'test',
    }, services)
    const events = response.body.trim().split('\n').map((line) => JSON.parse(line))

    assert.equal(handled, true)
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['Content-Type'], 'application/x-ndjson; charset=utf-8')
    assert.deepEqual(events.map((event) => event.type), ['start', 'progress', 'progress', 'complete'])
    assert.deepEqual(events.filter((event) => event.type === 'progress').map((event) => event.completed), [3, 4])
    assert.equal(events.at(-1).total, 4)
  })

  it('streams selected-concept explanation deltas with question context', async () => {
    const request = createRequest({
      question: { title: 'React key', category: 'React', difficulty: '中等', answer: '身份标识', explanation: '用于协调', interviewAnswer: '稳定 key', followUps: [] },
      selectedText: '稳定身份',
      prompt: '这句话是什么意思？',
      history: [],
    })
    request.url = '/api/llm/explain-selection/stream'
    const response = createResponse()
    const services = {
      callModel: async () => [],
      normalizeQuestionOutline: (value) => value,
      enrichQuestionBatch: async () => [],
      enrichQuestionBatchStream: async function* () {},
      explainSelectionStream: async function* (input) {
        assert.equal(input.selectedText, '稳定身份')
        assert.equal(input.question.title, 'React key')
        yield '“稳定身份”指的是组件在列表中的唯一标识。'
        yield '\n\n它帮助 React 判断节点是否可以复用。'
      },
      scoreAnswer: async () => ({}),
      fallbackScore: () => ({}),
    }

    const handled = await handleLlmRoutes(request, response, { baseUrl: 'https://llm.example.test', model: 'test-model', importModel: 'test-import-model', apiKey: 'key', provider: 'test' }, services)
    const events = response.body.trim().split('\n').map((line) => JSON.parse(line))

    assert.equal(handled, true)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(events.map((event) => event.type), ['start', 'delta', 'delta', 'complete'])
    assert.equal(events.filter((event) => event.type === 'delta').map((event) => event.content).join(''), '“稳定身份”指的是组件在列表中的唯一标识。\n\n它帮助 React 判断节点是否可以复用。')
  })
})
