import { errorMessage } from '../../http/errors.js'
import { completeChat } from './client.js'
import { extractJsonArray } from './json.js'

export type QuestionOutline = {
  title: string
  difficulty: string
  category: string
}

export type QuestionDraft = QuestionOutline & {
  importance: number
  answer: string
  explanation: string
  interviewAnswer: string
  followUps: string[]
}

const questionSchema = '[{"title":"问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"答案","explanation":"解析","interviewAnswer":"建议回答","followUps":["追问"]}]'
const enrichedQuestionSchema = '[{"title":"必须原样保留的问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"Markdown 格式的正确答案","explanation":"Markdown 格式的详细解析，必须包含 ## 核心结论、## 详细解析、## 速记 三个小节","interviewAnswer":"不超过 120 字、适合面试现场直接说的回答","followUps":["发散问题 1","发散问题 2"]}]'

function normalizeDrafts(value: any): QuestionDraft[] {
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

/** 校验批量生成输入，并限制一次最多处理 50 道题。 */
export function normalizeQuestionOutline(value: unknown, category: string): QuestionOutline[] {
  if (!Array.isArray(value) || !value.length) throw new Error('questions 必须是非空数组。')
  return value.map((item: any) => ({
    title: String(item.title || item.question || '').trim(),
    difficulty: ['简单', '中等', '困难'].includes(item.difficulty) ? item.difficulty : '中等',
    category: String(category || item.category || '未分类').trim() || '未分类',
  })).filter((item) => item.title).slice(0, 50)
}

/** 将自由文本整理为可直接写入题库的结构化草稿。 */
export async function parseQuestionSource(source: string, model: string): Promise<QuestionDraft[]> {
  const content = await completeChat({
    model,
    temperature: 0.1,
    max_tokens: 1800,
    messages: [
      { role: 'system', content: `你是面试题库整理助手。只输出 JSON 数组，不要代码围栏。字段结构：${questionSchema}。缺失字段填空或默认值，保留事实，不编造经历。答案和解析保持简洁。` },
      { role: 'user', content: source },
    ],
  })
  return normalizeDrafts(extractJsonArray(content, '模型返回的题目不是有效 JSON。'))
}

async function enrichQuestionChunk(outlines: QuestionOutline[], category: string, model: string): Promise<QuestionDraft[]> {
  const content = await completeChat({
    model,
    temperature: 0.15,
    max_tokens: Math.min(8_000, Math.max(2_000, outlines.length * 1_150)),
    messages: [
      { role: 'system', content: `你是一名资深 React Native 面试教练和题库编辑。只输出 JSON 数组，不要代码围栏。字段结构：${enrichedQuestionSchema}。技术背景以当前主流 React Native + TypeScript 为准，覆盖 React Native 0.7x/0.8x、Hermes、新架构 Fabric/TurboModules/JSI 等能力时必须说明版本或适用边界，不能把已经废弃的方案当成唯一正确答案。答案必须准确，解析要让初学者能理解，并解释为什么；解析必须使用 Markdown 且严格包含“## 核心结论”“## 详细解析”“## 速记”三个小节。建议回答要短、自然、可直接在面试中复述，抓住定义、原理和一个关键取舍。每道题生成 2-4 个发散问题。严格按照输入题目顺序返回，title 必须原样保留，不得漏题、合并题目或虚构与题目无关的内容。` },
      { role: 'user', content: JSON.stringify({ category, questions: outlines }) },
    ],
  })
  const value = extractJsonArray<any>(content, '模型返回的题目不是有效 JSON。')
  if (value.length !== outlines.length) throw new Error(`模型返回 ${value.length} 道题，预期 ${outlines.length} 道。`)
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

/** 按 6 道题分块并发生成，每块对非配置/超时错误重试一次。 */
export async function enrichQuestionBatch(outlines: QuestionOutline[], category: string, model: string): Promise<QuestionDraft[]> {
  const chunks: QuestionOutline[][] = []
  for (let index = 0; index < outlines.length; index += 6) chunks.push(outlines.slice(index, index + 6))
  const results = await Promise.all(chunks.map(async (chunk) => {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await enrichQuestionChunk(chunk, category, model)
      } catch (error) {
        lastError = error
        if (attempt === 0 && !/配置不完整|请求超过/.test(errorMessage(error))) await new Promise((resolve) => setTimeout(resolve, 250))
        else break
      }
    }
    throw lastError
  }))
  return results.flat()
}
