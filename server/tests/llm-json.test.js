import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractJsonArray, extractJsonObject } from '../../dist-server/services/llm/json.js'

describe('LLM JSON extraction', () => {
  it('extracts arrays from a markdown code fence', () => {
    assert.deepEqual(extractJsonArray('结果如下：\n```json\n[{"title":"题目"}]\n```'), [{ title: '题目' }])
  })

  it('extracts the first object-shaped result', () => {
    assert.deepEqual(extractJsonObject('解释：{"action":"finish"}'), { action: 'finish' })
  })

  it('reports malformed model output', () => {
    assert.throws(() => extractJsonArray('没有 JSON'), /不是有效 JSON/)
    assert.throws(() => extractJsonObject('没有对象'), /不是有效 JSON/)
  })
})
