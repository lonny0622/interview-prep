import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appConfig } from './config/env.js'
import { readBody } from './http/body.js'
import { jsonResponse } from './http/response.js'
import { completeChat } from './services/llm/client.js'
import { handleProfileRoutes } from './routes/profile.routes.js'
import { handleQuestionRoutes } from './routes/questions.routes.js'
import { handleInterviewRoutes } from './routes/interview.routes.js'
import { handleStudyRoutes } from './routes/study.routes.js'
import { handleLlmRoutes } from './routes/llm.routes.js'
import { handleMediaRoutes } from './routes/media.routes.js'

const { rootDir, provider, baseUrl, model, importModel, apiKey, sttProvider, sttBaseUrl, sttModel, sttApiKey, ffmpegPath, port, requestTimeoutMs } = appConfig

const questionSchema = '[{"title":"问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"答案","explanation":"解析","interviewAnswer":"建议回答","followUps":["追问"]}]'
const enrichedQuestionSchema = '[{"title":"必须原样保留的问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"Markdown 格式的正确答案","explanation":"Markdown 格式的详细解析，必须包含 ## 核心结论、## 详细解析、## 速记 三个小节","interviewAnswer":"不超过 120 字、适合面试现场直接说的回答","followUps":["发散问题 1","发散问题 2"]}]'
const scoreSchema = '{"score":0,"dimensions":{"correctness":0,"structure":0,"clarity":0,"relevance":0},"strengths":["优点"],"gaps":["缺口"],"betterAnswer":"更好的回答"}'
const interviewBlueprintSchema = '[{"stage":"self_introduction|project_experience|knowledge|scenario|follow_up|candidate_questions","kind":"自我介绍|简历项目题|八股题|场景题|发散追问|反问环节","question":"问题","focus":"考察点","referenceAnswer":"参考回答或评分要点","followUps":["追问"]}]'
const nextActionSchema = '{"action":"follow_up|advance_stage|finish","reason":"判断依据","question":"追问问题，可为空","kind":"发散追问|进入下一阶段|结束","focus":"考察点","referenceAnswer":"评分要点"}'
const profileSchema = '{"candidate":{"name":"","headline":"","yearsExperience":0,"skills":[""],"experiences":[{"company":"","title":"","period":"","responsibilities":[""]}],"projects":[{"name":"","background":"","responsibilities":[""],"techStack":[""],"challenges":[""],"solutions":[""],"results":[""],"risks":[""]}]},"job":{"role":"","responsibilities":[""],"requiredSkills":[""],"preferredExperience":[""],"interviewSignals":[""]},"gaps":[""]}'

function extractDocxText(binary) {
  const tempDir = mkdtempSync(join(rootDir, '.resume-'))
  const inputPath = join(tempDir, 'resume.docx')
  writeFileSync(inputPath, binary)
  const unzip = spawn('unzip', ['-p', inputPath, 'word/document.xml'])
  return new Promise((resolveText, rejectText) => {
      const output = []; const errors = []
      unzip.stdout.on('data', (chunk) => output.push(chunk)); unzip.stderr.on('data', (chunk) => errors.push(chunk))
      unzip.on('error', rejectText)
      unzip.on('close', (code) => {
        if (code !== 0) { rmSync(tempDir, { recursive: true, force: true }); return rejectText(new Error(`DOCX 解析失败：${Buffer.concat(errors).toString('utf8').trim()}`)) }
        const xml = Buffer.concat(output).toString('utf8')
        rmSync(tempDir, { recursive: true, force: true })
        resolveText(xml.replace(/<w:tab\s*\/?>(\s*)/g, '\t').replace(/<w:br\s*\/?>(\s*)/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+\n/g, '\n').trim())
      })
  })
}

function extractPdfText(binary) {
  const tempDir = mkdtempSync(join(rootDir, '.resume-'))
  const inputPath = join(tempDir, 'resume.pdf')
  writeFileSync(inputPath, binary)
  return new Promise((resolveText, rejectText) => {
    const process = spawn('textutil', ['-convert', 'txt', '-stdout', inputPath])
    const output = []; const errors = []
    process.stdout.on('data', (chunk) => output.push(chunk)); process.stderr.on('data', (chunk) => errors.push(chunk))
    process.on('close', (code) => {
      rmSync(tempDir, { recursive: true, force: true })
      if (code === 0) resolveText(Buffer.concat(output).toString('utf8').trim())
      else rejectText(new Error(`PDF 解析失败：${Buffer.concat(errors).toString('utf8').trim()}`))
    })
  })
}

async function extractResumeText(binary, fileName, mimeType) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.docx') || mimeType.includes('wordprocessingml')) return extractDocxText(binary)
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return extractPdfText(binary)
  if (lower.endsWith('.doc') || mimeType === 'application/msword') throw new Error('暂不支持旧版 .doc，请另存为 .docx 或 PDF 后上传。')
  throw new Error('仅支持 .docx 和 .pdf 简历文件。')
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
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回 JSON 内容。')
  const candidates = [content.trim(), ...Array.from(content.matchAll(/```(?:json|javascript|typescript|js|ts)?\s*([\s\S]*?)```/gi), (match) => match[1].trim())]
  let lastError
  for (const candidate of candidates) {
    for (let start = candidate.indexOf('['); start >= 0; start = candidate.indexOf('[', start + 1)) {
      for (let end = candidate.lastIndexOf(']'); end > start; end = candidate.lastIndexOf(']', end - 1)) {
        try {
          const value = JSON.parse(candidate.slice(start, end + 1))
          if (Array.isArray(value)) return value
        } catch (error) {
          lastError = error
        }
      }
    }
  }
  throw new Error(`模型返回的题目不是有效 JSON。${lastError?.message || ''}`)
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
    referenceAnswer: String(item.referenceAnswer || item.reference_answer || item.expectedPoints || '').trim(),
    followUps: Array.isArray(item.followUps) ? item.followUps.map(String).filter(Boolean).slice(0, 3) : [],
  })).filter((item) => item.question).slice(0, 18)
}

function fallbackBlueprint(profile) {
  const project = profile.projects?.[0]?.name || '你简历中的核心项目'
  return [
    { stage: 'self_introduction', kind: '自我介绍', question: '请做一个 1-2 分钟的自我介绍，重点讲和这个岗位最相关的经历。', focus: '表达结构、岗位匹配度', referenceAnswer: '应包含个人定位、最相关经历、核心能力和与岗位的匹配关系。', followUps: ['为什么考虑这个岗位？'] },
    { stage: 'project_experience', kind: '简历项目题', question: `请介绍一下你在「${project}」项目中的职责、技术选型和最终结果。`, focus: '项目真实性、个人贡献、结果', referenceAnswer: '应说明项目背景、个人职责、关键技术取舍、遇到的难点和可量化结果。', followUps: ['当时最大的技术取舍是什么？'] },
    { stage: 'knowledge', kind: '八股题', question: '在前端应用中，你会如何定位一次明显的性能下降？', focus: '分析方法、指标和验证', referenceAnswer: '应先区分加载、运行时和交互问题，建立指标基线，再使用 Performance、Network 或 Profiler 验证假设。', followUps: ['如果优化没有收益，你会怎么排查？'] },
    { stage: 'scenario', kind: '场景题', question: '如果线上出现偶发的接口变慢和页面卡顿，你会如何组织定位和止损？', focus: '优先级、协作和落地', referenceAnswer: '应先确认影响范围并止损，再通过监控、链路和前后端指标定位，最后补充复盘和监控。', followUps: ['如何判断先处理前端还是后端？'] },
    { stage: 'follow_up', kind: '发散追问', question: '如果重新做一个类似项目，你会保留和改变哪些设计？', focus: '复盘能力、边界意识', referenceAnswer: '应结合真实项目说明保留的设计、改动依据和预期收益，不能只给抽象观点。', followUps: [] },
    { stage: 'candidate_questions', kind: '反问环节', question: '面试接近尾声，你想向面试官了解哪些信息？', focus: '问题质量、岗位理解', referenceAnswer: '应围绕岗位目标、团队协作、技术挑战和成功标准提出具体问题。', followUps: [] },
  ]
}

function normalizeStructuredProfile(value, resumeText = '', jdText = '') {
  const candidate = value?.candidate || {}
  const job = value?.job || {}
  const list = (items) => Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20) : []
  const projects = Array.isArray(candidate.projects) ? candidate.projects.map((item) => ({
    name: String(item?.name || '').trim(), background: String(item?.background || '').trim(), responsibilities: list(item?.responsibilities), techStack: list(item?.techStack), challenges: list(item?.challenges), solutions: list(item?.solutions), results: list(item?.results), risks: list(item?.risks),
  })).filter((item) => item.name).slice(0, 12) : []
  const experiences = Array.isArray(candidate.experiences) ? candidate.experiences.map((item) => ({ company: String(item?.company || '').trim(), title: String(item?.title || '').trim(), period: String(item?.period || '').trim(), responsibilities: list(item?.responsibilities) })).filter((item) => item.company || item.title).slice(0, 12) : []
  return {
    candidate: { name: String(candidate.name || '').trim(), headline: String(candidate.headline || '').trim(), yearsExperience: Math.max(0, Number(candidate.yearsExperience) || 0), skills: list(candidate.skills), experiences, projects, sourceText: resumeText.slice(0, 80_000) },
    job: { role: String(job.role || '').trim(), responsibilities: list(job.responsibilities), requiredSkills: list(job.requiredSkills), preferredExperience: list(job.preferredExperience), interviewSignals: list(job.interviewSignals), sourceText: jdText.slice(0, 30_000) },
    gaps: list(value?.gaps),
  }
}

function fallbackStructuredProfile(resumeText = '', jdText = '', existing = {}) {
  const lines = resumeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const projectHeading = lines.findIndex((line) => /项目|project/i.test(line))
  const projectLine = projectHeading >= 0 ? lines[projectHeading + 1] : ''
  const skillsLine = lines.find((line) => /技能|skill|技术栈/i.test(line)) || ''
  const skills = skillsLine.split(/[：:、,，|/]/).slice(1).flatMap((item) => item.split(/\s+/)).map((item) => item.trim()).filter((item) => item.length > 1).slice(0, 20)
  const role = jdText.split(/\r?\n/).map((line) => line.trim()).find((line) => /岗位|职位|工程师|developer|engineer/i.test(line)) || existing.role || ''
  return normalizeStructuredProfile({ candidate: { name: existing.name || lines[0] || '', headline: existing.headline || '', yearsExperience: existing.yearsExperience || 0, skills, projects: projectLine ? [{ name: projectLine, background: '', responsibilities: [], techStack: skills, challenges: [], solutions: [], results: [], risks: [] }] : [] }, job: { role, responsibilities: [], requiredSkills: [], preferredExperience: [], interviewSignals: [] }, gaps: ['建议补充项目背景、个人职责和量化结果'] }, resumeText, jdText)
}

async function parseStructuredProfile(resumeText = '', jdText = '', existing = {}) {
  const fallback = fallbackStructuredProfile(resumeText, jdText, existing)
  if (!baseUrl || !model || !apiKey || (!resumeText.trim() && !jdText.trim())) return fallback
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: importModel, temperature: 0.1, max_tokens: 2400, messages: [
      { role: 'system', content: `你是简历和岗位画像解析器。只输出 JSON，不得输出代码围栏。严格遵守结构：${profileSchema}。只能提取文本中明确出现的事实；未知字段填空数组，不得编造项目、公司、技术或结果。项目必须保留原文项目名。` },
      { role: 'user', content: JSON.stringify({ resumeText: resumeText.slice(0, 80_000), jdText: jdText.slice(0, 30_000) }) },
    ] }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error?.message || `资料解析失败（${response.status}）。`)
    return normalizeStructuredProfile(extractObject(payload.choices?.[0]?.message?.content || ''), resumeText, jdText)
  } catch (error) {
    console.warn(`Structured profile fallback: ${error.message}`)
    return fallback
  }
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

function fallbackNextAction(session, answer) {
  const current = session.blueprint[session.currentIndex]
  const normalized = answer.trim()
  const hasWeakSignal = normalized.length < 45 || !/[0-9%]|结果|指标|影响|负责/.test(normalized)
  const followUp = current?.followUps?.[0]
  if (followUp && hasWeakSignal && session.currentIndex < session.blueprint.length - 1) return { action: 'follow_up', reason: '回答较短或缺少具体结果，需要继续核实。', question: followUp, kind: '发散追问', focus: current.focus, referenceAnswer: current.referenceAnswer }
  if (session.currentIndex >= session.blueprint.length - 1) return { action: 'finish', reason: '已覆盖面试蓝图中的全部环节。', question: '', kind: '结束', focus: '', referenceAnswer: '' }
  return { action: 'advance_stage', reason: '当前环节已完成，进入下一阶段。', question: '', kind: '进入下一阶段', focus: '', referenceAnswer: '' }
}

async function decideNextAction(session, answer) {
  const fallback = fallbackNextAction(session, answer)
  if (!baseUrl || !model || !apiKey) return fallback
  try {
    const current = session.blueprint[session.currentIndex]
    const response = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: 700, messages: [
      { role: 'system', content: `你是模拟面试编排 Agent。只能输出 JSON，不要代码围栏。${nextActionSchema}。只允许 follow_up、advance_stage、finish。当前阶段未完成时不能 finish；最多只生成一个追问；追问必须基于当前回答，不得编造候选人经历。` },
      { role: 'user', content: JSON.stringify({ current, answer, currentIndex: session.currentIndex, total: session.blueprint.length }) },
    ] }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error?.message || `Agent 请求失败（${response.status}）。`)
    const value = extractObject(payload.choices?.[0]?.message?.content || '')
    if (!['follow_up', 'advance_stage', 'finish'].includes(value.action)) throw new Error('Agent action 不合法。')
    if (value.action === 'follow_up' && !String(value.question || '').trim()) throw new Error('Agent 追问为空。')
    if (value.action !== 'follow_up' && session.currentIndex >= session.blueprint.length - 1) value.action = 'finish'
    return { ...fallback, ...value, question: String(value.question || '').trim(), referenceAnswer: String(value.referenceAnswer || '').trim() }
  } catch (error) {
    console.warn(`Interview next action fallback: ${error.message}`)
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

function normalizeQuestionOutline(value, category) {
  if (!Array.isArray(value) || !value.length) throw new Error('questions 必须是非空数组。')
  return value.map((item) => ({
    title: String(item.title || item.question || '').trim(),
    difficulty: ['简单', '中等', '困难'].includes(item.difficulty) ? item.difficulty : '中等',
    category: String(category || item.category || '未分类').trim() || '未分类',
  })).filter((item) => item.title).slice(0, 50)
}

async function callModel(source) {
  const content = await completeChat({
      model: importModel,
      temperature: 0.1,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: `你是面试题库整理助手。只输出 JSON 数组，不要代码围栏。字段结构：${questionSchema}。缺失字段填空或默认值，保留事实，不编造经历。答案和解析保持简洁。` },
        { role: 'user', content: source },
      ],
    })
  return normalizeDrafts(extractJson(content))
}

async function callEnrichmentModel(outlines, category) {
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
    if (error.name === 'AbortError') throw new Error(`模型请求超过 ${Math.round(requestTimeoutMs / 1000)} 秒，已自动停止。`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || `上游模型请求失败（${response.status}）。`)
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('上游模型没有返回文本内容。')
  const value = extractJson(content)
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

async function enrichQuestionBatch(outlines, category) {
  const chunks = []
  for (let index = 0; index < outlines.length; index += 6) chunks.push(outlines.slice(index, index + 6))
  const results = await Promise.all(chunks.map(async (chunk) => {
    let lastError
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await callEnrichmentModel(chunk, category)
      } catch (error) {
        lastError = error
        if (attempt === 0 && !/配置不完整|请求超过/.test(error.message || '')) await new Promise((resolveRetry) => setTimeout(resolveRetry, 250))
        else break
      }
    }
    throw lastError
  }))
  return results.flat()
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
  if (await handleLlmRoutes(request, response, { baseUrl, model, importModel, apiKey, provider }, { callModel, normalizeQuestionOutline, enrichQuestionBatch, scoreAnswer, fallbackScore })) return
  if (await handleMediaRoutes(request, response, { sttBaseUrl, sttModel, sttApiKey, sttProvider }, { extractResumeText, transcribeAudio })) return
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
      return jsonResponse(response, 400, { error: error.message || '资料解析失败。' })
    }
  }
  if (await handleInterviewRoutes(request, response, { parseStructuredProfile, generateInterviewBlueprint, scoreAnswer, decideNextAction, generateInterviewReport })) return
  if (await handleStudyRoutes(request, response)) return
  if (await handleQuestionRoutes(request, response)) return
  jsonResponse(response, 404, { error: 'Not Found' })
}

createServer((request, response) => handle(request, response).catch((error) => jsonResponse(response, 500, { error: error.message }))).listen(port, '127.0.0.1', () => {
  console.log(`InterviewPrep LLM Gateway listening on http://127.0.0.1:${port}`)
})
