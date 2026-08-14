import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideNextAction, generateInterviewBlueprint, generateInterviewReport } from '../../dist-server/services/interview/orchestrator.js'

const offlineConfig = { baseUrl: '', model: '', importModel: '', apiKey: '', requestTimeoutMs: 100 }

describe('interview orchestrator fallbacks', () => {
  it('builds a complete blueprint from a stored candidate project', async () => {
    const blueprint = await generateInterviewBlueprint({ candidateProfile: { candidate: { projects: [{ name: '面试助手' }] } } }, offlineConfig)
    assert.equal(blueprint.length, 6)
    assert.match(blueprint[1].question, /面试助手/)
    assert.deepEqual(blueprint.map((item) => item.stage), [
      'self_introduction',
      'project_experience',
      'knowledge',
      'scenario',
      'follow_up',
      'candidate_questions',
    ])
  })

  it('follows up on a weak answer and finishes after the last stage', async () => {
    const blueprint = await generateInterviewBlueprint({}, offlineConfig)
    assert.equal((await decideNextAction({ blueprint, currentIndex: 0 }, '不太清楚', offlineConfig)).action, 'follow_up')
    assert.equal((await decideNextAction({ blueprint, currentIndex: blueprint.length - 1 }, '我的问题是团队目标是什么？', offlineConfig)).action, 'finish')
  })

  it('returns an actionable report without a configured model', async () => {
    const blueprint = await generateInterviewBlueprint({}, offlineConfig)
    const report = await generateInterviewReport({ blueprint, profile: {} }, [], offlineConfig)
    assert.equal(typeof report.summary, 'string')
    assert.equal(report.suggestions.length > 0, true)
    assert.equal(report.nextQuestions.length, 3)
  })
})
