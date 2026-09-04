import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson } from '../http/body.js'
import { jsonResponse } from '../http/response.js'
import { errorMessage } from '../http/errors.js'
import { matchesRoute } from '../http/routing.js'
import type { ExplainSelectionInput } from '../domain/explanation.js'
import { normalizeFollowUps, type FollowUpAnswerContext, type Question, type QuestionDraft, type QuestionOutline, type ScoreQuestion, type ScoreResult } from '../domain/question.js'

type LlmServices = {
  callModel: (source: string) => Promise<QuestionDraft[]>
  normalizeQuestionOutline: (questions: unknown, category: string) => QuestionOutline[]
  enrichQuestionBatch: (questions: QuestionOutline[], category: string, context?: string) => Promise<QuestionDraft[]>
  enrichQuestionBatchStream: (questions: QuestionOutline[], category: string, context?: string, signal?: AbortSignal) => AsyncIterable<QuestionDraft[]>
  generateFollowUpAnswer: (question: FollowUpAnswerContext, followUpQuestion: string, supplementalInfo: string) => Promise<string>
  explainSelectionStream?: (input: ExplainSelectionInput, signal?: AbortSignal) => AsyncIterable<string>
  scoreAnswer: (question: ScoreQuestion, answer: string) => Promise<ScoreResult>
  fallbackScore: (question: ScoreQuestion, answer: string) => ScoreResult
}

type LlmConfig = { baseUrl: string; model: string; importModel: string; apiKey: string; provider: string }

function writeStreamEvent(response: ServerResponse, payload: unknown): void {
  if (!response.destroyed) response.write(`${JSON.stringify(payload)}\n`)
}

/** LLM 上游健康检查、题目导入和评分路由。具体 prompt/解析函数通过依赖注入提供。 */
export async function handleLlmRoutes(request: IncomingMessage, response: ServerResponse, config: LlmConfig, services: LlmServices): Promise<boolean> {
  if (matchesRoute(request, 'GET', '/api/llm/health')) {
    if (!config.baseUrl || !config.model || !config.apiKey) { jsonResponse(response, 503, { ok: false, configured: false, provider: config.provider, model: config.model }); return true }
    try {
      const upstream = await fetch(`${config.baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(10_000) })
      const payload = await upstream.json().catch(() => ({}))
      jsonResponse(response, upstream.ok ? 200 : 502, { ok: upstream.ok, configured: true, provider: config.provider, model: config.model, modelCount: Array.isArray(payload.data) ? payload.data.length : 0, error: payload.error?.message }); return true
    } catch (error) { jsonResponse(response, 502, { ok: false, configured: true, provider: config.provider, model: config.model, error: errorMessage(error) }); return true }
  }
  if (matchesRoute(request, 'POST', '/api/llm/parse-questions')) {
    try {
      const body = await readJson<{ source?: string }>(request)
      if (typeof body.source !== 'string' || !body.source.trim()) { jsonResponse(response, 400, { error: 'source 不能为空。' }); return true }
      jsonResponse(response, 200, { drafts: await services.callModel(body.source), model: config.importModel }); return true
    } catch (error) { jsonResponse(response, 502, { error: errorMessage(error, 'LLM 解析失败。') }); return true }
  }
  if (matchesRoute(request, 'POST', '/api/llm/enrich-questions')) {
    try {
      const body = await readJson<{ category?: string; questions?: unknown[]; context?: string }>(request, 2_000_000)
      const category = String(body.category || '未分类').trim() || '未分类'
      const context = String(body.context || '').trim().slice(0, 16_000)
      const outlines = services.normalizeQuestionOutline(body.questions, category)
      if (!outlines.length) { jsonResponse(response, 400, { error: '没有可生成的题目。' }); return true }
      const drafts = await services.enrichQuestionBatch(outlines, category, context)
      jsonResponse(response, 200, { drafts, category, count: drafts.length, model: config.importModel }); return true
    } catch (error) { jsonResponse(response, 502, { error: errorMessage(error, '题目内容生成失败。') }); return true }
  }
  if (matchesRoute(request, 'POST', '/api/llm/enrich-questions/stream')) {
    let completed = 0
    let total = 0
    const controller = new AbortController()
    const abortUpstream = () => controller.abort()
    response.once('close', abortUpstream)
    try {
      const body = await readJson<{ category?: string; questions?: unknown[]; context?: string }>(request, 2_000_000)
      const category = String(body.category || '未分类').trim() || '未分类'
      const context = String(body.context || '').trim().slice(0, 16_000)
      const outlines = services.normalizeQuestionOutline(body.questions, category)
      if (!outlines.length) { jsonResponse(response, 400, { error: '没有可生成的题目。' }); return true }
      total = outlines.length
      response.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      })
      writeStreamEvent(response, { type: 'start', total, model: config.importModel })
      for await (const drafts of services.enrichQuestionBatchStream(outlines, category, context, controller.signal)) {
        // IncomingMessage 在请求体正常读取完成后也可能进入 destroyed 状态；这里只能
        // 根据响应端判断浏览器是否已断开，否则会吞掉首批结果并让连接永久悬挂。
        if (response.destroyed || response.writableEnded) return true
        completed += drafts.length
        writeStreamEvent(response, { type: 'progress', drafts, completed, total })
      }
      writeStreamEvent(response, { type: 'complete', completed, total })
      response.end()
      return true
    } catch (error) {
      const message = errorMessage(error, '题目内容生成失败。')
      if (!response.headersSent) jsonResponse(response, 502, { error: message })
      else {
        writeStreamEvent(response, { type: 'error', error: message, completed, total })
        response.end()
      }
      return true
    } finally {
      response.off('close', abortUpstream)
    }
  }
  if (matchesRoute(request, 'POST', '/api/llm/follow-up-answer')) {
    try {
      const body = await readJson<{ question?: Partial<Question>; followUpQuestion?: string; supplementalInfo?: string }>(request, 700_000)
      const source = body.question
      const followUpQuestion = String(body.followUpQuestion || '').trim().slice(0, 2_000)
      if (!source || !String(source.title || '').trim() || !String(source.category || '').trim() || !followUpQuestion) {
        jsonResponse(response, 400, { error: '完整主问题、分类和追问内容必填。' })
        return true
      }
      const question: FollowUpAnswerContext = {
        title: String(source.title || '').trim().slice(0, 4_000),
        category: String(source.category || '').trim().slice(0, 200),
        difficulty: source.difficulty === '简单' || source.difficulty === '困难' ? source.difficulty : '中等',
        answer: String(source.answer || '').slice(0, 10_000),
      }
      const answer = await services.generateFollowUpAnswer(question, followUpQuestion, String(body.supplementalInfo || '').trim().slice(0, 4_000))
      jsonResponse(response, 200, { answer, model: config.importModel })
      return true
    } catch (error) {
      jsonResponse(response, 502, { error: errorMessage(error, '追问答案生成失败。') })
      return true
    }
  }
  if (matchesRoute(request, 'POST', '/api/llm/explain-selection/stream')) {
    let started = false
    const controller = new AbortController()
    const abortUpstream = () => controller.abort()
    response.once('close', abortUpstream)
    try {
      if (!services.explainSelectionStream) { jsonResponse(response, 503, { error: '选区解释服务尚未配置。' }); return true }
      const body = await readJson<Partial<ExplainSelectionInput>>(request, 700_000)
      const question = body.question
      const selectedText = String(body.selectedText || '').trim()
      const prompt = String(body.prompt || '').trim()
      const history = Array.isArray(body.history) ? body.history : []
      if (!question || !selectedText || !prompt) { jsonResponse(response, 400, { error: 'question、selectedText 和 prompt 必填。' }); return true }
      response.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      })
      started = true
      writeStreamEvent(response, { type: 'start' })
      for await (const content of services.explainSelectionStream({
        question: {
          title: String(question.title || ''),
          category: String(question.category || ''),
          difficulty: String(question.difficulty || ''),
          answer: String(question.answer || '').slice(0, 8_000),
          explanation: String(question.explanation || '').slice(0, 12_000),
          interviewAnswer: String(question.interviewAnswer || '').slice(0, 6_000),
          followUps: normalizeFollowUps(question.followUps).map((item) => item.answer ? `${item.question}\n回答：${item.answer}` : item.question).slice(0, 10),
        },
        selectedText: selectedText.slice(0, 4_000),
        prompt: prompt.slice(0, 2_000),
        history: history.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const value = item as Record<string, unknown>
          return value.role === 'user' || value.role === 'assistant'
            ? [{ role: value.role as 'user' | 'assistant', content: String(value.content || '').slice(0, 6_000) }]
            : []
        }).slice(-10),
      }, controller.signal)) {
        if (response.destroyed || response.writableEnded) return true
        writeStreamEvent(response, { type: 'delta', content })
      }
      writeStreamEvent(response, { type: 'complete' })
      response.end()
      return true
    } catch (error) {
      const message = errorMessage(error, '选区解释失败。')
      if (!started && !response.headersSent) jsonResponse(response, 502, { error: message })
      else if (!response.writableEnded) { writeStreamEvent(response, { type: 'error', error: message }); response.end() }
      return true
    } finally {
      response.off('close', abortUpstream)
    }
  }
  if (matchesRoute(request, 'POST', '/api/score-answer')) {
    try {
      const body = await readJson<{ question?: ScoreQuestion; answer?: string }>(request)
      if (!body.question || typeof body.answer !== 'string' || !body.answer.trim()) { jsonResponse(response, 400, { error: 'question 和 answer 必填。' }); return true }
      let score
      try { score = { ...(await services.scoreAnswer(body.question, body.answer)), source: 'llm' } } catch (error) { score = { ...services.fallbackScore(body.question, body.answer), fallbackReason: errorMessage(error) } }
      jsonResponse(response, 200, { score, model: config.model }); return true
    } catch (error) { jsonResponse(response, 400, { error: errorMessage(error, '评分失败。') }); return true }
  }
  return false
}
