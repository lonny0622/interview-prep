import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { completeInterviewSession, createInterviewSession, createQuestions, createLearningSession, createPracticeSession, editQuestion, getInterviewSession, listInterviewTurns, listQuestions, removeQuestion, saveInterviewTurn, savePracticeAnswer } from './db.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile() {
  const filePath = resolve(rootDir, '.env.local')
  if (!existsSync(filePath)) return {}
  return Object.fromEntries(readFileSync(filePath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return []
    const separator = trimmed.indexOf('=')
    if (separator < 1) return []
    return [[trimmed.slice(0, separator), trimmed.slice(separator + 1).replace(/^['"]|['"]$/g, '')]]
  }))
}

const fileEnv = loadEnvFile()
const env = (name, fallback = '') => process.env[name] || fileEnv[name] || fallback
const provider = env('VITE_LLM_PROVIDER', 'openai-compatible')
const baseUrl = env('VITE_LLM_BASE_URL').replace(/\/$/, '')
const model = env('VITE_LLM_MODEL')
const importModel = env('LLM_IMPORT_MODEL', model)
const apiKey = env('LLM_API_KEY')
const sttProvider = env('STT_PROVIDER')
const sttBaseUrl = env('STT_BASE_URL').replace(/\/$/, '')
const sttModel = env('STT_MODEL')
const sttApiKey = env('STT_API_KEY')
const ffmpegPath = env('STT_FFMPEG_PATH', 'ffmpeg')
const port = Number(env('LLM_GATEWAY_PORT', '8787'))
const requestTimeoutMs = Number(env('LLM_REQUEST_TIMEOUT_MS', '90000'))

const questionSchema = '[{"title":"问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"答案","explanation":"解析","interviewAnswer":"建议回答","followUps":["追问"]}]'
const scoreSchema = '{"score":0,"dimensions":{"correctness":0,"structure":0,"clarity":0,"relevance":0},"strengths":["优点"],"gaps":["缺口"],"betterAnswer":"更好的回答"}'
const interviewBlueprintSchema = '[{"stage":"self_introduction|project_experience|knowledge|scenario|follow_up|candidate_questions","kind":"自我介绍|简历项目题|八股题|场景题|发散追问|反问环节","question":"问题","focus":"考察点","followUps":["追问"]}]'

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function readBody(request, limit = 1_000_000) {
  return new Promise((resolveBody, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > limit) reject(new Error(`请求内容超过 ${Math.round(limit / 1_000_000)}MB 限制。`))
    })
    request.on('end', () => resolveBody(body))
    request.on('error', reject)
  })
}

function convertToWav(binary, mimeType) {
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav' || mimeType === 'audio/wave') return Promise.resolve(binary)
  return new Promise((resolveConversion, rejectConversion) => {
    const process = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'])
    const output = []
    const errors = []
    process.stdout.on('data', (chunk) => output.push(chunk))
    process.stderr.on('data', (chunk) => errors.push(chunk))
    process.on('error', (error) => rejectConversion(new Error(`音频格式转换失败，请确认已安装 ffmpeg（${error.message}）。`)))
    process.on('close', (code) => {
      if (code === 0 && output.length) return resolveConversion(Buffer.concat(output))
      rejectConversion(new Error(`音频格式转换失败：${Buffer.concat(errors).toString('utf8').trim() || `ffmpeg 退出码 ${code}`}。`))
    })
    process.stdin.end(binary)
  })
}

async function transcribeAudio(audioBase64, mimeType = 'audio/webm') {
  if (!sttBaseUrl || !sttModel || !sttApiKey) throw new Error('语音转写服务尚未配置。')
  const binary = Buffer.from(audioBase64, 'base64')
  if (!binary.length) throw new Error('录音内容为空。')
  const wav = await convertToWav(binary, mimeType)
  const form = new FormData()
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'answer.wav')
  form.append('model', sttModel)
  const response = await fetch(`${sttBaseUrl}/v1/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${sttApiKey}` }, body: form })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || `语音转写请求失败（${response.status}）。`)
  if (typeof payload.text !== 'string' || !payload.text.trim()) throw new Error('语音服务没有返回转写文本。')
  return payload.text.trim()
}

function extractJson(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = fenced || content.trim()
  const first = candidate.indexOf('[')
  const last = candidate.lastIndexOf(']')
  return JSON.parse(first >= 0 && last > first ? candidate.slice(first, last + 1) : candidate)
}

function extractObject(content) {
  const candidate = content.match(/\{[\s\S]*\}/)?.[0]
  if (!candidate) throw new Error('模型返回的复盘结果不是有效 JSON。')
  return JSON.parse(candidate)
}

function normalizeBlueprint(value) {
  if (!Array.isArray(value)) throw new Error('模型返回的问题蓝图不是数组。')
  const allowed = ['self_introduction', 'project_experience', 'knowledge', 'scenario', 'follow_up', 'candidate_questions']
  return value.map((item) => ({
    stage: allowed.includes(item.stage) ? item.stage : 'knowledge',
    kind: String(item.kind || '八股题').trim(),
    question: String(item.question || item.title || '').trim(),
    focus: String(item.focus || '').trim(),
    followUps: Array.isArray(item.followUps) ? item.followUps.map(String).filter(Boolean).slice(0, 3) : [],
  })).filter((item) => item.question).slice(0, 18)
}

function fallbackBlueprint(profile) {
  const project = profile.projects?.[0]?.name || '你简历中的核心项目'
  return [
    { stage: 'self_introduction', kind: '自我介绍', question: '请做一个 1-2 分钟的自我介绍，重点讲和这个岗位最相关的经历。', focus: '表达结构、岗位匹配度', followUps: ['为什么考虑这个岗位？'] },
    { stage: 'project_experience', kind: '简历项目题', question: `请介绍一下你在「${project}」项目中的职责、技术选型和最终结果。`, focus: '项目真实性、个人贡献、结果', followUps: ['当时最大的技术取舍是什么？'] },
    { stage: 'knowledge', kind: '八股题', question: '在前端应用中，你会如何定位一次明显的性能下降？', focus: '分析方法、指标和验证', followUps: ['如果优化没有收益，你会怎么排查？'] },
    { stage: 'scenario', kind: '场景题', question: '如果线上出现偶发的接口变慢和页面卡顿，你会如何组织定位和止损？', focus: '优先级、协作和落地', followUps: ['如何判断先处理前端还是后端？'] },
    { stage: 'follow_up', kind: '发散追问', question: '如果重新做一个类似项目，你会保留和改变哪些设计？', focus: '复盘能力、边界意识', followUps: [] },
    { stage: 'candidate_questions', kind: '反问环节', question: '面试接近尾声，你想向面试官了解哪些信息？', focus: '问题质量、岗位理解', followUps: [] },
  ]
}

async function generateInterviewBlueprint(profile) {
  if (!baseUrl || !model || !apiKey) return fallbackBlueprint(profile)
  const source = JSON.stringify(profile).slice(0, 30_000)
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: importModel, temperature: 0.3, max_tokens: 2200, messages: [
      { role: 'system', content: `你是资深面试官，依据候选人资料和 JD 生成一份可执行的模拟面试问题蓝图。必须覆盖自我介绍、简历项目题、八股题、场景题、发散追问、反问环节；项目题必须引用候选人资料中真实出现的项目，不能编造经历。只输出 JSON 数组，结构：${interviewBlueprintSchema}` },
      { role: 'user', content: source },
    ] }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error?.message || `面试问题生成失败（${response.status}）。`)
    return normalizeBlueprint(extractJson(payload.choices?.[0]?.message?.content || ''))
  } catch (error) {
    console.warn(`Interview blueprint fallback: ${error.message}`)
    return fallbackBlueprint(profile)
  }
}

async function generateInterviewReport(session, turns) {
  const fallback = { summary: '本次模拟面试已完成。建议结合每轮回答继续补充具体数据、个人贡献和复盘动作。', strengths: ['完成了完整面试流程'], risks: ['部分回答还可以增加背景、行动和结果'], suggestions: ['重新回答项目题并补充量化结果', '针对场景题练习先判断影响范围再制定方案'], nextQuestions: session.blueprint.slice(0, 3).map((item) => item.question) }
  if (!baseUrl || !model || !apiKey) return fallback
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: 1800, messages: [
      { role: 'system', content: '你是面试复盘教练。只输出 JSON 对象，字段为 summary、strengths（字符串数组）、risks（字符串数组）、suggestions（字符串数组）、nextQuestions（字符串数组）。评价必须基于实际回答，不要编造经历。' },
      { role: 'user', content: JSON.stringify({ profile: session.profile, turns }).slice(0, 40_000) },
    ] }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error?.message || `面试复盘失败（${response.status}）。`)
    return { ...fallback, ...extractObject(payload.choices?.[0]?.message?.content || '') }
  } catch (error) {
    console.warn(`Interview report fallback: ${error.message}`)
    return fallback
  }
}

function normalizeDrafts(value) {
  if (!Array.isArray(value)) throw new Error('模型返回的题目不是数组。')
  return value.map((item) => ({
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

async function callModel(source) {
  if (!baseUrl || !model || !apiKey) throw new Error('LLM Gateway 配置不完整，请检查 .env.local。')
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
      temperature: 0.1,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: `你是面试题库整理助手。只输出 JSON 数组，不要代码围栏。字段结构：${questionSchema}。缺失字段填空或默认值，保留事实，不编造经历。答案和解析保持简洁。` },
        { role: 'user', content: source },
      ],
    }),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`模型请求超过 ${Math.round(requestTimeoutMs / 1000)} 秒，已自动停止。`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || `上游模型请求失败（${response.status}）。`)
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('上游模型没有返回文本内容。')
  return normalizeDrafts(extractJson(content))
}

async function scoreAnswer(question, answer) {
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
    if (error.name === 'AbortError') throw new Error(`评分请求超过 ${Math.round(requestTimeoutMs / 1000)} 秒，已自动停止。`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function fallbackScore(question, answer) {
  const normalized = answer.trim()
  const lengthScore = Math.min(40, Math.round(normalized.length / 5))
  const keywordScore = question.answer.split(/[，。；、\s]+/).filter((word) => word.length > 1 && normalized.includes(word)).length * 10
  const score = Math.min(85, Math.max(10, lengthScore + Math.min(50, keywordScore)))
  return { score, dimensions: { correctness: score, structure: normalized.length > 40 ? 70 : 35, clarity: normalized.length > 20 ? 65 : 30, relevance: keywordScore ? 75 : 35 }, strengths: normalized.length > 40 ? ['回答包含了一定展开'] : ['已经开始组织答案'], gaps: keywordScore ? ['可以补充边界条件和具体例子'] : ['回答过短，缺少关键概念'], betterAnswer: question.interviewAnswer || question.answer, source: 'fallback' }
}

async function handle(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
    response.end()
    return
  }
  if (request.method === 'GET' && request.url === '/api/llm/health') {
    if (!baseUrl || !model || !apiKey) return jsonResponse(response, 503, { ok: false, configured: false, provider, model })
    try {
      const upstream = await fetch(`${baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
      const payload = await upstream.json().catch(() => ({}))
      return jsonResponse(response, upstream.ok ? 200 : 502, { ok: upstream.ok, configured: true, provider, model, modelCount: Array.isArray(payload.data) ? payload.data.length : 0, error: payload.error?.message })
    } catch (error) {
      return jsonResponse(response, 502, { ok: false, configured: true, provider, model, error: error.message })
    }
  }
  if (request.method === 'GET' && request.url === '/api/speech/health') {
    return jsonResponse(response, 200, { configured: Boolean(sttBaseUrl && sttModel && sttApiKey), provider: sttProvider || 'openai-compatible', model: sttModel || '' })
  }
  if (request.method === 'GET' && request.url.startsWith('/api/questions')) {
    const url = new URL(request.url, 'http://127.0.0.1')
    return jsonResponse(response, 200, { questions: listQuestions({ q: url.searchParams.get('q') || '', category: url.searchParams.get('category') || '', mastery: url.searchParams.get('mastery') || '' }) })
  }
  if (request.method === 'POST' && request.url === '/api/questions') {
    try {
      const body = JSON.parse(await readBody(request))
      if (!Array.isArray(body.questions) || !body.questions.length) return jsonResponse(response, 400, { error: 'questions 不能为空数组。' })
      return jsonResponse(response, 201, { questions: createQuestions(body.questions) })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '题目保存失败。' })
    }
  }
  if (request.method === 'PATCH' && request.url.startsWith('/api/questions/')) {
    const id = request.url.slice('/api/questions/'.length)
    try {
      const updated = editQuestion(id, JSON.parse(await readBody(request)))
      return updated ? jsonResponse(response, 200, { question: updated }) : jsonResponse(response, 404, { error: '题目不存在。' })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '题目更新失败。' })
    }
  }
  if (request.method === 'DELETE' && request.url.startsWith('/api/questions/')) {
    const id = request.url.slice('/api/questions/'.length)
    return removeQuestion(id) ? jsonResponse(response, 204, {}) : jsonResponse(response, 404, { error: '题目不存在。' })
  }
  if (request.method === 'POST' && request.url === '/api/learning-sessions') {
    try {
      const body = JSON.parse(await readBody(request))
      if (!Array.isArray(body.questionIds)) return jsonResponse(response, 400, { error: 'questionIds 不能为空数组。' })
      return jsonResponse(response, 201, { session: createLearningSession(body.questionIds) })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '学习 session 创建失败。' })
    }
  }
  if (request.method === 'POST' && request.url === '/api/practice-sessions') {
    try {
      const body = JSON.parse(await readBody(request))
      if (!Array.isArray(body.questionIds)) return jsonResponse(response, 400, { error: 'questionIds 不能为空数组。' })
      return jsonResponse(response, 201, { session: createPracticeSession(body.questionIds, body.filters || {}) })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '刷题 session 创建失败。' })
    }
  }
  if (request.method === 'POST' && request.url === '/api/practice-answers') {
    try {
      const body = JSON.parse(await readBody(request))
      if (!body.sessionId || !body.questionId || typeof body.answerText !== 'string') return jsonResponse(response, 400, { error: 'sessionId、questionId 和 answerText 必填。' })
      return jsonResponse(response, 201, { answer: savePracticeAnswer(body.sessionId, body.questionId, body.answerText, body.score) })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '回答保存失败。' })
    }
  }
  if (request.method === 'POST' && request.url === '/api/interview-sessions') {
    try {
      const body = JSON.parse(await readBody(request, 2_000_000))
      if (!body.profile || typeof body.profile !== 'object') return jsonResponse(response, 400, { error: 'profile 必须是对象。' })
      const blueprint = await generateInterviewBlueprint(body.profile)
      if (!blueprint.length) return jsonResponse(response, 502, { error: '没有生成有效的面试问题。' })
      return jsonResponse(response, 201, { session: createInterviewSession(body.profile, blueprint) })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '模拟面试创建失败。' })
    }
  }
  if (request.method === 'GET' && request.url.startsWith('/api/interview-sessions/')) {
    const id = request.url.slice('/api/interview-sessions/'.length).split('/')[0]
    const session = getInterviewSession(id)
    if (!session) return jsonResponse(response, 404, { error: '模拟面试不存在。' })
    return jsonResponse(response, 200, { session, turns: listInterviewTurns(id) })
  }
  if (request.method === 'POST' && request.url.match(/^\/api\/interview-sessions\/[^/]+\/turns$/)) {
    try {
      const id = request.url.split('/')[3]
      const body = JSON.parse(await readBody(request, 2_000_000))
      if (!body.question || typeof body.answerText !== 'string' || !body.answerText.trim()) return jsonResponse(response, 400, { error: 'question 和 answerText 必填。' })
      let score = null
      try { score = await scoreAnswer({ title: body.question, answer: body.referenceAnswer || '', interviewAnswer: body.referenceAnswer || '' }, body.answerText) } catch { score = null }
      return jsonResponse(response, 201, { turn: saveInterviewTurn(id, { stage: body.stage || 'knowledge', question: body.question, answerText: body.answerText }, score) })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '面试回答保存失败。' })
    }
  }
  if (request.method === 'POST' && request.url.match(/^\/api\/interview-sessions\/[^/]+\/complete$/)) {
    try {
      const id = request.url.split('/')[3]
      const session = getInterviewSession(id)
      if (!session) return jsonResponse(response, 404, { error: '模拟面试不存在。' })
      const turns = listInterviewTurns(id)
      const report = await generateInterviewReport(session, turns)
      return jsonResponse(response, 200, { session: completeInterviewSession(id, report), report })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '面试复盘失败。' })
    }
  }
  if (request.method === 'POST' && request.url === '/api/score-answer') {
    try {
      const body = JSON.parse(await readBody(request))
      if (!body.question || typeof body.answer !== 'string' || !body.answer.trim()) return jsonResponse(response, 400, { error: 'question 和 answer 必填。' })
      let score
      try {
        score = await scoreAnswer(body.question, body.answer)
        score.source = 'llm'
      } catch (error) {
        score = { ...fallbackScore(body.question, body.answer), fallbackReason: error.message }
      }
      return jsonResponse(response, 200, { score, model })
    } catch (error) {
      return jsonResponse(response, 400, { error: error.message || '评分失败。' })
    }
  }
  if (request.method === 'POST' && request.url === '/api/stt/transcribe') {
    try {
      const body = JSON.parse(await readBody(request, 15_000_000))
      if (typeof body.audioBase64 !== 'string' || !body.audioBase64.trim()) return jsonResponse(response, 400, { error: 'audioBase64 不能为空。' })
      const text = await transcribeAudio(body.audioBase64, body.mimeType)
      return jsonResponse(response, 200, { text, model: sttModel })
    } catch (error) {
      return jsonResponse(response, 502, { error: error.message || '语音转写失败。' })
    }
  }
  if (request.method === 'POST' && request.url === '/api/llm/parse-questions') {
    try {
      const body = JSON.parse(await readBody(request))
      if (typeof body.source !== 'string' || !body.source.trim()) return jsonResponse(response, 400, { error: 'source 不能为空。' })
      const drafts = await callModel(body.source)
      return jsonResponse(response, 200, { drafts, model: importModel })
    } catch (error) {
      return jsonResponse(response, 502, { error: error.message || 'LLM 解析失败。' })
    }
  }
  jsonResponse(response, 404, { error: 'Not Found' })
}

createServer((request, response) => handle(request, response).catch((error) => jsonResponse(response, 500, { error: error.message }))).listen(port, '127.0.0.1', () => {
  console.log(`InterviewPrep LLM Gateway listening on http://127.0.0.1:${port}`)
})
