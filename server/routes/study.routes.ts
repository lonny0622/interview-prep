import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { createLearningSession, createPracticeSession, getLearningStats, saveLearningProgress, savePracticeAnswer } from '../db/repositories/study.repository.js'

const pathOf = (request: IncomingMessage) => request.url?.split('?')[0] || ''
const is = (request: IncomingMessage, method: string, path: string) => request.method === method && pathOf(request) === path

/** 学习和刷题 session 的 HTTP 适配层。 */
export async function handleStudyRoutes(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (is(request, 'POST', '/api/learning-sessions')) {
    try {
      const body = await readJson<{ questionIds?: unknown[] }>(request)
      if (!Array.isArray(body.questionIds)) { jsonResponse(response, 400, { error: 'questionIds 不能为空数组。' }); return true }
      jsonResponse(response, 201, { session: createLearningSession(body.questionIds.map(String)) }); return true
    } catch (error) { jsonResponse(response, 400, { error: error.message || '学习 session 创建失败。' }); return true }
  }
  if (is(request, 'POST', '/api/learning-progress')) {
    try {
      const body = await readJson<{ questionId?: string; mastery?: string; sessionId?: string }>(request)
      if (!body.questionId || !['未学习', '了解', '熟悉', '掌握'].includes(body.mastery || '')) { jsonResponse(response, 400, { error: 'questionId 和合法的 mastery 必填。' }); return true }
      const progress = saveLearningProgress(body.questionId, body.mastery || '', body.sessionId)
      jsonResponse(response, progress ? 201 : 404, progress ? { progress } : { error: '题目不存在。' }); return true
    } catch (error) { jsonResponse(response, 400, { error: error.message || '学习记录保存失败。' }); return true }
  }
  if (is(request, 'GET', '/api/learning/stats')) { jsonResponse(response, 200, { stats: getLearningStats() }); return true }
  if (is(request, 'POST', '/api/practice-sessions')) {
    try {
      const body = await readJson<{ questionIds?: unknown[]; filters?: Record<string, unknown> }>(request)
      if (!Array.isArray(body.questionIds)) { jsonResponse(response, 400, { error: 'questionIds 不能为空数组。' }); return true }
      jsonResponse(response, 201, { session: createPracticeSession(body.questionIds.map(String), body.filters || {}) }); return true
    } catch (error) { jsonResponse(response, 400, { error: error.message || '刷题 session 创建失败。' }); return true }
  }
  if (is(request, 'POST', '/api/practice-answers')) {
    try {
      const body = await readJson<{ sessionId?: string; questionId?: string; answerText?: string; score?: unknown }>(request)
      if (!body.sessionId || !body.questionId || typeof body.answerText !== 'string') { jsonResponse(response, 400, { error: 'sessionId、questionId 和 answerText 必填。' }); return true }
      jsonResponse(response, 201, { answer: savePracticeAnswer(body.sessionId, body.questionId, body.answerText, body.score) }); return true
    } catch (error) { jsonResponse(response, 400, { error: error.message || '回答保存失败。' }); return true }
  }
  return false
}
