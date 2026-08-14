import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appConfig } from './config/env.js'
import { readBody } from './http/body.js'
import { jsonResponse } from './http/response.js'
import { errorMessage } from './http/errors.js'
import { completeChat } from './services/llm/client.js'
import { extractJsonArray } from './services/llm/json.js'
import { handleProfileRoutes } from './routes/profile.routes.js'
import { handleQuestionRoutes } from './routes/questions.routes.js'
import { handleInterviewRoutes } from './routes/interview.routes.js'
import { handleStudyRoutes } from './routes/study.routes.js'
import { handleLlmRoutes } from './routes/llm.routes.js'
import { handleMediaRoutes } from './routes/media.routes.js'
import { extractResumeText as extractResumeTextFile } from './services/media/document.js'
import { transcribeAudio as transcribeAudioFile } from './services/media/speech.js'
import { parseStructuredProfile as parseStructuredProfileService } from './services/profile/parser.js'
import { decideNextAction as decideNextActionService, generateInterviewBlueprint as generateInterviewBlueprintService, generateInterviewReport as generateInterviewReportService } from './services/interview/orchestrator.js'

const { rootDir, provider, baseUrl, model, importModel, apiKey, sttProvider, sttBaseUrl, sttModel, sttApiKey, ffmpegPath, port, requestTimeoutMs } = appConfig

const questionSchema = '[{"title":"问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"答案","explanation":"解析","interviewAnswer":"建议回答","followUps":["追问"]}]'
const enrichedQuestionSchema = '[{"title":"必须原样保留的问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"Markdown 格式的正确答案","explanation":"Markdown 格式的详细解析，必须包含 ## 核心结论、## 详细解析、## 速记 三个小节","interviewAnswer":"不超过 120 字、适合面试现场直接说的回答","followUps":["发散问题 1","发散问题 2"]}]'
const scoreSchema = '{"score":0,"dimensions":{"correctness":0,"structure":0,"clarity":0,"relevance":0},"strengths":["优点"],"gaps":["缺口"],"betterAnswer":"更好的回答"}'

const parseStructuredProfile = (resumeText: string, jdText: string, existing: Record<string, any>) => parseStructuredProfileService(resumeText, jdText, existing, { baseUrl, model, importModel, apiKey })
const generateInterviewBlueprint = (profile: any) => generateInterviewBlueprintService(profile, { baseUrl, model, importModel, apiKey })
const decideNextAction = (session: any, answer: string) => decideNextActionService(session, answer, { baseUrl, model, importModel, apiKey })
const generateInterviewReport = (session: any, turns: any[]) => generateInterviewReportService(session, turns, { baseUrl, model, importModel, apiKey })

function normalizeDrafts(value: any) {
  if (!Array.isArray(value)) throw new Error('模型返回的题目不是数组。')
  return value.map((item: any) => ({
    title: String(item.title ?? item.question ?? '').trim(),
    category: String(item.category ?? '未分类').trim(),
    difficulty: ['简单', '中等', '困难'].includes(item.difficulty) ? item.difficulty : '中等',
    importance: Math.min(5, Math.max(1, Number(item.importance) || 3)),
    answer: String(item.answer ?? item.answer_md ?? '').trim(),
    explanation: String(item.explanation ?? item.explanation_md ?? '').trim(),
    interviewAnswer: String(item.interviewAnswer ?? item.interview_answer ?? '').trim(),
    followUps: Array.isArray(item.followUps ?? item.follow_up_questions) ? (item.followUps ?? item.follow_up_questions).map(String).filter(Boolean) : [],
  })).filter((item) => item.title)
}

function normalizeQuestionOutline(value: any, category: string) {
  if (!Array.isArray(value) || !value.length) throw new Error('questions 必须是非空数组。')
  return value.map((item: any) => ({
    title: String(item.title || item.question || '').trim(),
    difficulty: ['简单', '中等', '困难'].includes(item.difficulty) ? item.difficulty : '中等',
    category: String(category || item.category || '未分类').trim() || '未分类',
  })).filter((item) => item.title).slice(0, 50)
}

async function callModel(source: string) {
  const content = await completeChat({
      model: importModel,
      temperature: 0.1,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: `你是面试题库整理助手。只输出 JSON 数组，不要代码围栏。字段结构：${questionSchema}。缺失字段填空或默认值，保留事实，不编造经历。答案和解析保持简洁。` },
        { role: 'user', content: source },
      ],
    })
  return normalizeDrafts(extractJsonArray(content, '模型返回的题目不是有效 JSON。'))
}

async function callEnrichmentModel(outlines: any[], category: string) {
  if (!baseUrl || !importModel || !apiKey) throw new Error('LLM Gateway 配置不完整，请检查 .env.local。')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  let response
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: importModel,
        temperature: 0.15,
        max_tokens: Math.min(8_000, Math.max(2_000, outlines.length * 1_150)),
        messages: [
          { role: 'system', content: `你是一名资深 React Native 面试教练和题库编辑。只输出 JSON 数组，不要代码围栏。字段结构：${enrichedQuestionSchema}。技术背景以当前主流 React Native + TypeScript 为准，覆盖 React Native 0.7x/0.8x、Hermes、新架构 Fabric/TurboModules/JSI 等能力时必须说明版本或适用边界，不能把已经废弃的方案当成唯一正确答案。答案必须准确，解析要让初学者能理解，并解释为什么；解析必须使用 Markdown 且严格包含“## 核心结论”“## 详细解析”“## 速记”三个小节。建议回答要短、自然、可直接在面试中复述，抓住定义、原理和一个关键取舍。每道题生成 2-4 个发散问题。严格按照输入题目顺序返回，title 必须原样保留，不得漏题、合并题目或虚构与题目无关的内容。` },
          { role: 'user', content: JSON.stringify({ category, questions: outlines }) },
        ],
      }),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`模型请求超过 ${Math.round(requestTimeoutMs / 1000)} 秒，已自动停止。`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || `上游模型请求失败（${response.status}）。`)
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('上游模型没有返回文本内容。')
  const value = extractJsonArray<any>(content, '模型返回的题目不是有效 JSON。')
  if (!Array.isArray(value) || value.length !== outlines.length) throw new Error(`模型返回 ${Array.isArray(value) ? value.length : 0} 道题，预期 ${outlines.length} 道。`)
  return outlines.map((outline, index) => {
    const item = value[index] || {}
    const answer = String(item.answer ?? item.answer_md ?? '').trim()
    const explanation = String(item.explanation ?? item.explanation_md ?? '').trim()
    const interviewAnswer = String(item.interviewAnswer ?? item.interview_answer ?? '').trim()
    if (!answer || !explanation || !interviewAnswer) throw new Error(`题目“${outline.title}”生成内容不完整。`)
    if (!/速记/.test(explanation)) throw new Error(`题目“${outline.title}”的解析缺少速记小节。`)
    return {
      title: outline.title,
      category,
      difficulty: outline.difficulty,
      importance: Math.min(5, Math.max(1, Number(item.importance) || 3)),
      answer,
      explanation,
      interviewAnswer,
      followUps: Array.isArray(item.followUps ?? item.follow_up_questions) ? (item.followUps ?? item.follow_up_questions).map(String).filter(Boolean).slice(0, 4) : [],
    }
  })
}

async function enrichQuestionBatch(outlines: any[], category: string) {
  const chunks = []
  for (let index = 0; index < outlines.length; index += 6) chunks.push(outlines.slice(index, index + 6))
  const results = await Promise.all(chunks.map(async (chunk) => {
    let lastError
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await callEnrichmentModel(chunk, category)
      } catch (error) {
        lastError = error
        if (attempt === 0 && !/配置不完整|请求超过/.test(errorMessage(error))) await new Promise((resolveRetry) => setTimeout(resolveRetry, 250))
        else break
      }
    }
    throw lastError
  }))
  return results.flat()
}

async function scoreAnswer(question: any, answer: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 1200, messages: [
        { role: 'system', content: `你是面试回答教练。只输出 JSON，不要代码围栏。结构：${scoreSchema}。所有分数为 0 到 100 的整数，评价要基于题目和回答，不要假装知道回答之外的事实。` },
        { role: 'user', content: `题目：${question.title}\n参考答案：${question.answer}\n用户回答：${answer}` },
      ] }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error?.message || `评分请求失败（${response.status}）。`)
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('评分模型没有返回文本内容。')
    const candidate = content.match(/\{[\s\S]*\}/)?.[0]
    if (!candidate) throw new Error('评分结果不是有效 JSON。')
    return JSON.parse(candidate)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`评分请求超过 ${Math.round(requestTimeoutMs / 1000)} 秒，已自动停止。`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function fallbackScore(question: any, answer: string) {
  const normalized = answer.trim()
  const lengthScore = Math.min(40, Math.round(normalized.length / 5))
  const keywordScore = question.answer.split(/[，。；、\s]+/).filter((word: string) => word.length > 1 && normalized.includes(word)).length * 10
  const score = Math.min(85, Math.max(10, lengthScore + Math.min(50, keywordScore)))
  return { score, dimensions: { correctness: score, structure: normalized.length > 40 ? 70 : 35, clarity: normalized.length > 20 ? 65 : 30, relevance: keywordScore ? 75 : 35 }, strengths: normalized.length > 40 ? ['回答包含了一定展开'] : ['已经开始组织答案'], gaps: keywordScore ? ['可以补充边界条件和具体例子'] : ['回答过短，缺少关键概念'], betterAnswer: question.interviewAnswer || question.answer, source: 'fallback' }
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
    response.end()
    return
  }
  if (await handleLlmRoutes(request, response, { baseUrl, model, importModel, apiKey, provider }, { callModel, normalizeQuestionOutline, enrichQuestionBatch, scoreAnswer, fallbackScore })) return
  if (await handleMediaRoutes(request, response, { sttBaseUrl, sttModel, sttApiKey, sttProvider }, {
    extractResumeText: (binary, fileName, mimeType) => extractResumeTextFile(binary, fileName, mimeType, rootDir),
    transcribeAudio: (audioBase64, mimeType) => transcribeAudioFile(audioBase64, mimeType, { baseUrl: sttBaseUrl, model: sttModel, apiKey: sttApiKey, ffmpegPath }),
  })) return
  if (await handleProfileRoutes(request, response)) return
  if (request.method === 'POST' && request.url === '/api/profile/parse') {
    try {
      const body = JSON.parse(await readBody(request, 1_500_000))
      const resumeText = String(body.resumeText || '')
      const jdText = String(body.jdText || '')
      if (!resumeText.trim() && !jdText.trim()) return jsonResponse(response, 400, { error: 'resumeText 或 jdText 至少填写一项。' })
      const profile = await parseStructuredProfile(resumeText, jdText, body.existing || {})
      return jsonResponse(response, 200, { profile, fallback: !baseUrl || !model || !apiKey })
    } catch (error) {
      return jsonResponse(response, 400, { error: errorMessage(error, '资料解析失败。') })
    }
  }
  if (await handleInterviewRoutes(request, response, { parseStructuredProfile, generateInterviewBlueprint, scoreAnswer, decideNextAction, generateInterviewReport })) return
  if (await handleStudyRoutes(request, response)) return
  if (await handleQuestionRoutes(request, response)) return
  jsonResponse(response, 404, { error: 'Not Found' })
}

createServer((request, response) => handle(request, response).catch((error) => jsonResponse(response, 500, { error: errorMessage(error) }))).listen(port, '127.0.0.1', () => {
  console.log(`InterviewPrep LLM Gateway listening on http://127.0.0.1:${port}`)
})
