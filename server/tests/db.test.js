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
})

describe('profile repository', () => {
  it('creates a job and assigns its first resume as default', () => {
    const job = db.createJobProfile('高级前端工程师')
    const resume = db.createResume(job.id, { fileName: 'resume.txt', text: 'candidate profile' })
    assert.equal(resume.isDefault, true)
    assert.equal(db.listJobProfiles().find((item) => item.id === job.id).resumes.length, 1)
  })
})
