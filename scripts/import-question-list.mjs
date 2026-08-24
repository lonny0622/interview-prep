/* global console, fetch, process, TextDecoder */
import { readFile } from 'node:fs/promises'

const sourcePath = process.argv[2]
const contextPath = process.argv[3]
const gateway = process.env.INTERVIEWPREP_GATEWAY || 'http://127.0.0.1:8787'

if (!sourcePath) throw new Error('用法：node scripts/import-question-list.mjs <题目文本> [项目上下文]')

const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const keyOf = (category, title) => `${normalize(category)}\n${normalize(title)}`

function parseGroups(source) {
  const groups = []
  let current = null
  let difficulty = '中等'
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const heading = line.match(/^[一二三四五六七八九十百]+、(.+)$/)
    if (heading) {
      current = { category: heading[1].trim(), questions: [] }
      groups.push(current)
      difficulty = '中等'
      continue
    }
    if (/^[⭐★]+/.test(line)) {
      const level = Number(line.match(/Level\s*(\d+)/i)?.[1] || line.match(/([1-5])\s*[～~-]/)?.[1] || line.match(/([1-5])/u)?.[1] || line.match(/^[⭐★]+/)?.[0].length || 2)
      difficulty = level <= 1 ? '简单' : level === 2 ? '中等' : '困难'
      continue
    }
    if (current && /[？?]$/.test(line)) current.questions.push({ title: line, difficulty })
  }
  return groups.filter((group) => group.questions.length)
}

async function requestJson(path, init) {
  const response = await fetch(`${gateway}${path}`, init)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`)
  return payload
}

async function streamDrafts(group, questions, context, onDrafts) {
  const response = await fetch(`${gateway}/api/llm/enrich-questions/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ category: group.category, questions, ...(context ? { context } : {}) }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `生成请求失败（${response.status}）`)
  }
  if (!response.body) throw new Error('流式响应不可读。')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamError = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line)
      if (event.type === 'progress') await onDrafts(event.drafts)
      if (event.type === 'error') streamError = event.error
    }
    if (done) break
  }
  if (buffer.trim()) {
    const event = JSON.parse(buffer)
    if (event.type === 'progress') await onDrafts(event.drafts)
    if (event.type === 'error') streamError = event.error
  }
  if (streamError) throw new Error(streamError)
}

const source = await readFile(sourcePath, 'utf8')
const projectContext = contextPath ? await readFile(contextPath, 'utf8') : ''
const groups = parseGroups(source)
const existingPayload = await requestJson('/api/questions')
const known = new Set(existingPayload.questions.map((question) => keyOf(question.category, question.title)))
const requestedTotal = groups.reduce((sum, group) => sum + group.questions.length, 0)
let importedTotal = 0

console.log(`[import] 识别 ${groups.length} 个分类、${requestedTotal} 道题；题库已有 ${known.size} 道题。`)

for (const group of groups) {
  let pending = group.questions.filter((question) => !known.has(keyOf(group.category, question.title)))
  let failuresWithoutProgress = 0
  const useProjectContext = /经验额外高频.*追问/.test(group.category)
  if (useProjectContext && !projectContext) {
    console.log(`[skip] ${group.category}: 需要项目上下文授权，暂不处理 ${pending.length} 道。`)
    continue
  }
  console.log(`[category] ${group.category}: 待生成 ${pending.length}/${group.questions.length}`)

  while (pending.length) {
    const before = pending.length
    try {
      await streamDrafts(group, pending, useProjectContext ? projectContext : '', async (drafts) => {
        const fresh = drafts
          .map((draft) => ({ ...draft, category: group.category }))
          .filter((draft) => !known.has(keyOf(group.category, draft.title)))
        if (!fresh.length) return
        const payload = await requestJson('/api/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: fresh }),
        })
        for (const question of payload.questions) known.add(keyOf(question.category, question.title))
        importedTotal += payload.questions.length
        console.log(`[progress] ${group.category}: +${payload.questions.length}，本次累计 ${importedTotal}`)
      })
    } catch (error) {
      console.warn(`[retry] ${group.category}: ${error instanceof Error ? error.message : String(error)}`)
    }
    pending = group.questions.filter((question) => !known.has(keyOf(group.category, question.title)))
    failuresWithoutProgress = pending.length < before ? 0 : failuresWithoutProgress + 1
    if (failuresWithoutProgress >= 3) throw new Error(`${group.category} 连续 3 次没有新进度，剩余 ${pending.length} 道；可稍后重新运行脚本续传。`)
  }
}

const remainingTotal = groups.reduce((sum, group) => sum + group.questions.filter((question) => !known.has(keyOf(group.category, question.title))).length, 0)
console.log(`[done] 本次新增 ${importedTotal} 道；清单已完成 ${requestedTotal - remainingTotal}/${requestedTotal}，剩余 ${remainingTotal} 道。`)
