import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeQuestionOutline } from '../../dist-server/services/llm/questions.js'
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
