import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

const dataDir = mkdtempSync(join(tmpdir(), 'interviewprep-test-'))
globalThis.process.env.INTERVIEWPREP_DATA_DIR = dataDir
const db = await import('../../dist-server/db.js')

after(() => rmSync(dataDir, { recursive: true, force: true }))

describe('question repository', () => {
  it('seeds and filters questions', () => {
    const questions = db.listQuestions({ category: 'React' })
    assert.ok(questions.length > 0)
    assert.equal(questions.every((question) => question.category === 'React'), true)
  })

  it('creates a question and keeps category counts in sync', () => {
    const [created] = db.createQuestions([{
      title: '测试题目', category: '测试分类', difficulty: '简单', importance: 2,
      answer: '答案', explanation: '解析', interviewAnswer: '建议回答', followUps: [],
    }])
    assert.equal(db.getQuestion(created.id).title, '测试题目')
    assert.equal(db.listCategories().find((category) => category.name === '测试分类').questionCount, 1)
    assert.equal(db.editQuestion(created.id, { mastery: '掌握' }).mastery, '掌握')
    assert.equal(db.removeQuestion(created.id), true)
  })

  it('keeps the fallback category reserved and moves all of its questions', () => {
    const target = db.createCategory('迁移目标分类')
    const [created] = db.createQuestions([{
      title: '待分类题目', category: '', difficulty: '简单', importance: 1,
      answer: '答案', explanation: '解析', interviewAnswer: '建议回答', followUps: [],
    }])
    const fallback = db.listCategories().find((category) => category.name === '未分类')

    assert.ok(fallback)
    assert.equal(fallback.questionCount, 1)
    assert.throws(() => db.updateCategory(fallback.id, '其他分类'), { code: 'CATEGORY_RESERVED' })
    assert.throws(() => db.deleteCategory(fallback.id), { code: 'CATEGORY_RESERVED' })

    const result = db.moveCategoryQuestions(fallback.id, target.id)
    assert.equal(result.moved, 1)
    assert.equal(result.source.questionCount, 0)
    assert.equal(result.target.questionCount, 1)
    assert.equal(db.getQuestion(created.id).category, target.name)

    assert.equal(db.removeQuestion(created.id), true)
    assert.equal(db.deleteCategory(target.id), true)
  })

  it('replaces generated content without changing question identity or classification', () => {
    const [created] = db.createQuestions([{
      title: '需要重新生成的题目', category: '重生成测试', difficulty: '困难', importance: 2,
      answer: '旧答案', explanation: '旧解析', interviewAnswer: '旧回答', followUps: [],
    }])
    const [updated] = db.replaceGeneratedQuestionContent([{
      id: created.id, importance: 5, answer: '新答案', explanation: '新解析', interviewAnswer: '新回答', followUps: ['新追问'],
    }])

    assert.equal(updated.title, created.title)
    assert.equal(updated.category, created.category)
    assert.equal(updated.difficulty, created.difficulty)
    assert.equal(updated.mastery, created.mastery)
    assert.equal(updated.answer, '新答案')
    assert.deepEqual(updated.followUps, ['新追问'])
    assert.equal(db.removeQuestion(created.id), true)
  })
})

describe('profile repository', () => {
  it('creates a job and assigns its first resume as default', () => {
    const job = db.createJobProfile('高级前端工程师')
    const resume = db.createResume(job.id, { fileName: 'resume.txt', text: 'candidate profile' })
    assert.equal(resume.isDefault, true)
    assert.equal(db.listJobProfiles().find((item) => item.id === job.id).resumes.length, 1)
  })
})
