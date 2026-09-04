import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EXPLANATION_SYSTEM_PROMPT } from '../../dist-server/services/llm/explanation.js'
import { enrichQuestionBatchStream, FOLLOW_UP_ANSWER_INSTRUCTION, normalizeQuestionOutline, QUESTION_CATEGORY_GROUNDING_INSTRUCTION, QUESTION_IMPORTANCE_RUBRIC, sanitizeEnrichedAnswer } from '../../dist-server/services/llm/questions.js'
import { fallbackScore } from '../../dist-server/services/llm/scoring.js'

describe('selection explanation prompt', () => {
  it('treats the question as context instead of a knowledge boundary', () => {
    assert.match(EXPLANATION_SYSTEM_PROMPT, /不是你的知识边界/)
    assert.match(EXPLANATION_SYSTEM_PROMPT, /通用技术知识/)
    assert.match(EXPLANATION_SYSTEM_PROMPT, /不能因为题目没有写明就拒绝回答/)
    assert.doesNotMatch(EXPLANATION_SYSTEM_PROMPT, /请只基于题目内容/)
    assert.match(EXPLANATION_SYSTEM_PROMPT, /节点 ID 只使用 ASCII 字母和数字/)
    assert.match(EXPLANATION_SYSTEM_PROMPT, /检查箭头、括号与引号是否闭合/)
  })
})

describe('question generation input', () => {
  it('treats category as the authoritative semantic domain', () => {
    assert.match(QUESTION_CATEGORY_GROUNDING_INSTRUCTION, /category 是每道题不可更改的首要专业语境/)
    assert.match(QUESTION_CATEGORY_GROUNDING_INSTRUCTION, /不得因为其他领域存在同名概念就切换语境/)
    assert.match(QUESTION_CATEGORY_GROUNDING_INSTRUCTION, /必须直接回应 title/)
  })

  it('defines an independent 1-5 importance rubric instead of copying the schema example', () => {
    assert.match(QUESTION_IMPORTANCE_RUBRIC, /5=核心高频且必须掌握/)
    assert.match(QUESTION_IMPORTANCE_RUBRIC, /1=非常边缘/)
    assert.match(QUESTION_IMPORTANCE_RUBRIC, /不能照抄 JSON 示例/)
    assert.match(QUESTION_IMPORTANCE_RUBRIC, /不能简单等同于 difficulty/)
  })

  it('keeps follow-up answers short and easy to remember', () => {
    assert.match(FOLLOW_UP_ANSWER_INSTRUCTION, /与同一道题的主答案保持口径一致/)
    assert.match(FOLLOW_UP_ANSWER_INSTRUCTION, /1 句结论/)
    assert.match(FOLLOW_UP_ANSWER_INSTRUCTION, /2-4 个最关键/)
    assert.match(FOLLOW_UP_ANSWER_INSTRUCTION, /150-300 个中文字符/)
    assert.match(FOLLOW_UP_ANSWER_INSTRUCTION, /复杂问题可以适当增加/)
    assert.match(FOLLOW_UP_ANSWER_INSTRUCTION, /不要主动展开大段背景/)
    assert.match(FOLLOW_UP_ANSWER_INSTRUCTION, /除非追问明确要求/)
  })

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
