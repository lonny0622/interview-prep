import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseStructuredProfile } from '../../dist-server/services/profile/parser.js'

describe('profile parser', () => {
  it('returns a bounded fallback profile when the model is not configured', async () => {
    const profile = await parseStructuredProfile(
      '张三\n技能：TypeScript React\n项目\n面试助手',
      '岗位：前端工程师',
      {},
      { baseUrl: '', model: '', importModel: '', apiKey: '' },
    )
    assert.equal(profile.candidate.name, '张三')
    assert.deepEqual(profile.candidate.skills, ['TypeScript', 'React'])
    assert.equal(profile.candidate.projects[0].name, '面试助手')
    assert.equal(profile.job.role, '岗位：前端工程师')
    assert.equal(profile.candidate.sourceText.length > 0, true)
  })
})
