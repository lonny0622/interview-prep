import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { errorMessage } from '../http/errors.js'

type LlmServices = {
  callModel: (source: string) => Promise<any[]>
  normalizeQuestionOutline: (questions: unknown, category: string) => any[]
  enrichQuestionBatch: (questions: any[], category: string) => Promise<any[]>
  scoreAnswer: (question: any, answer: string) => Promise<any>
  fallbackScore: (question: any, answer: string) => any
}

type LlmConfig = { baseUrl: string; model: string; importModel: string; apiKey: string; provider: string }
const pathOf = (request: IncomingMessage) => request.url?.split('?')[0] || ''
const is = (request: IncomingMessage, method: string, path: string) => request.method === method && pathOf(request) === path

/** LLM 上游健康检查、题目导入和评分路由。具体 prompt/解析函数通过依赖注入提供。 */
export async function handleLlmRoutes(request: IncomingMessage, response: ServerResponse, config: LlmConfig, services: LlmServices): Promise<boolean> {
  if (is(request, 'GET', '/api/llm/health')) {
    if (!config.baseUrl || !config.model || !config.apiKey) { jsonResponse(response, 503, { ok: false, configured: false, provider: config.provider, model: config.model }); return true }
    try {
      const upstream = await fetch(`${config.baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${config.apiKey}` } })
      const payload = await upstream.json().catch(() => ({}))
      jsonResponse(response, upstream.ok ? 200 : 502, { ok: upstream.ok, configured: true, provider: config.provider, model: config.model, modelCount: Array.isArray(payload.data) ? payload.data.length : 0, error: payload.error?.message }); return true
    } catch (error) { jsonResponse(response, 502, { ok: false, configured: true, provider: config.provider, model: config.model, error: errorMessage(error) }); return true }
  }
  if (is(request, 'POST', '/api/llm/parse-questions')) {
    try {
      const body = await readJson<{ source?: string }>(request)
      if (typeof body.source !== 'string' || !body.source.trim()) { jsonResponse(response, 400, { error: 'source 不能为空。' }); return true }
      jsonResponse(response, 200, { drafts: await services.callModel(body.source), model: config.importModel }); return true
    } catch (error) { jsonResponse(response, 502, { error: errorMessage(error, 'LLM 解析失败。') }); return true }
  }
  if (is(request, 'POST', '/api/llm/enrich-questions')) {
    try {
      const body = await readJson<{ category?: string; questions?: unknown[] }>(request, 2_000_000)
      const category = String(body.category || '未分类').trim() || '未分类'
      const outlines = services.normalizeQuestionOutline(body.questions, category)
      if (!outlines.length) { jsonResponse(response, 400, { error: '没有可生成的题目。' }); return true }
      const drafts = await services.enrichQuestionBatch(outlines, category)
      jsonResponse(response, 200, { drafts, category, count: drafts.length, model: config.importModel }); return true
    } catch (error) { jsonResponse(response, 502, { error: errorMessage(error, '题目内容生成失败。') }); return true }
  }
  if (is(request, 'POST', '/api/score-answer')) {
    try {
      const body = await readJson<{ question?: any; answer?: string }>(request)
      if (!body.question || typeof body.answer !== 'string' || !body.answer.trim()) { jsonResponse(response, 400, { error: 'question 和 answer 必填。' }); return true }
      let score
      try { score = { ...(await services.scoreAnswer(body.question, body.answer)), source: 'llm' } } catch (error) { score = { ...services.fallbackScore(body.question, body.answer), fallbackReason: errorMessage(error) } }
      jsonResponse(response, 200, { score, model: config.model }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '评分失败。') }); return true }
  }
  return false
}
