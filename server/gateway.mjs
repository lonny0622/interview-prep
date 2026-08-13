import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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
const port = Number(env('LLM_GATEWAY_PORT', '8787'))
const requestTimeoutMs = Number(env('LLM_REQUEST_TIMEOUT_MS', '90000'))

const questionSchema = '[{"title":"问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"答案","explanation":"解析","interviewAnswer":"建议回答","followUps":["追问"]}]'

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) reject(new Error('请求内容超过 1MB 限制。'))
    })
    request.on('end', () => resolveBody(body))
    request.on('error', reject)
  })
}

function extractJson(content) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = fenced || content.trim()
  const first = candidate.indexOf('[')
  const last = candidate.lastIndexOf(']')
  return JSON.parse(first >= 0 && last > first ? candidate.slice(first, last + 1) : candidate)
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
