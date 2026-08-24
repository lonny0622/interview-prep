import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { enrichQuestionBatchStream, normalizeQuestionOutline, sanitizeEnrichedAnswer } from '../../dist-server/services/llm/questions.js'
import { fallbackScore } from '../../dist-server/services/llm/scoring.js'

describe('question generation input', () => {
  it('normalizes titles, difficulty and category', () => {
    assert.deepEqual(normalizeQuestionOutline([
      { question: '  React key 有什么作用？  ', difficulty: '未知', category: 'React' },
      { title: '' },
    ], '前端基础'), [{ title: 'React key 有什么作用？', difficulty: '中等', category: '前端基础' }])
  })

  it('rejects an empty question batch', () => {
    assert.throws(() => normalizeQuestionOutline([], 'React'), /questions 必须是非空数组/)
  })

  it('keeps only the core conclusion when answer repeats the full explanation', () => {
    const answer = '## 核心结论\n直接答案。\n\n## 详细解析\n很长的展开。\n\n## 速记\n口诀。'
    assert.equal(sanitizeEnrichedAnswer(answer), '直接答案。')
    assert.equal(sanitizeEnrichedAnswer('直接答案。\n\n## 详细解析\n重复内容。'), '直接答案。')
  })

  it('streams bounded chunks in source order', async () => {
    const outlines = Array.from({ length: 7 }, (_, index) => ({ title: `Q${index + 1}`, difficulty: '中等', category: 'React' }))
    const calls = []
    const chunks = []
    const enrich = async (items, category) => {
      calls.push(items.map((item) => item.title))
      return items.map((item) => ({
        ...item,
        category,
        importance: 3,
        answer: 'answer',
        explanation: '## 速记',
        interviewAnswer: 'interview answer',
        followUps: [],
      }))
    }

    for await (const chunk of enrichQuestionBatchStream(outlines, 'React', 'test-model', enrich)) chunks.push(chunk)

    assert.deepEqual(calls, [['Q1', 'Q2', 'Q3'], ['Q4', 'Q5', 'Q6'], ['Q7']])
    assert.deepEqual(chunks.flat().map((item) => item.title), outlines.map((item) => item.title))
  })

  it('falls back to single-question retries and continues after a batch timeout', async () => {
    const outlines = Array.from({ length: 5 }, (_, index) => ({ title: `Q${index + 1}`, difficulty: '中等', category: 'React' }))
    const calls = []
    let q2Attempts = 0
    const enrich = async (items, category) => {
      calls.push(items.map((item) => item.title))
      if (items.length > 1 && items[0].title === 'Q1') throw new Error('模型请求超过 60 秒，已自动停止。')
      if (items[0].title === 'Q2' && q2Attempts++ === 0) throw new Error('模型请求超过 60 秒，已自动停止。')
      return items.map((item) => ({
        ...item, category, importance: 3, answer: 'answer', explanation: '## 速记', interviewAnswer: 'interview answer', followUps: [],
      }))
    }
    const chunks = []

    for await (const chunk of enrichQuestionBatchStream(outlines, 'React', 'test-model', enrich)) chunks.push(chunk)

    assert.deepEqual(calls, [['Q1', 'Q2', 'Q3'], ['Q1'], ['Q2'], ['Q2'], ['Q3'], ['Q4', 'Q5']])
    assert.deepEqual(chunks.flat().map((item) => item.title), outlines.map((item) => item.title))
  })
})

describe('answer scoring fallback', () => {
  it('rewards reference-answer keywords and keeps scores bounded', () => {
    const weak = fallbackScore({ answer: '稳定身份 协调', interviewAnswer: '参考回答' }, '不知道')
    const relevant = fallbackScore({ answer: '稳定身份 协调', interviewAnswer: '参考回答' }, 'key 提供稳定身份，帮助 React 协调列表节点。')
    assert.equal(relevant.score > weak.score, true)
    assert.equal(relevant.score <= 85, true)
    assert.equal(relevant.betterAnswer, '参考回答')
  })
})
