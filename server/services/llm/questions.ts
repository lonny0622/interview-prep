import { errorMessage } from '../../http/errors.js'
import type { Difficulty, QuestionDraft, QuestionOutline } from '../../domain/question.js'
import { completeChat } from './client.js'
import { extractJsonArray } from './json.js'

export type { QuestionDraft, QuestionOutline } from '../../domain/question.js'

const questionSchema = '[{"title":"问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"答案","explanation":"解析","interviewAnswer":"建议回答","followUps":["追问"]}]'
const enrichedQuestionSchema = '[{"title":"必须原样保留的问题","category":"分类","difficulty":"简单|中等|困难","importance":1,"answer":"只写直接答案，不写详细解析和速记","explanation":"Markdown 格式的详细解析，必须包含 ## 核心结论、## 详细解析、## 速记 三个小节","interviewAnswer":"不超过 120 字、适合面试现场直接说的回答","followUps":["发散问题 1","发散问题 2"]}]'

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
const isDifficulty = (value: unknown): value is Difficulty => value === '简单' || value === '中等' || value === '困难'

function markdownSection(content: string, title: string): string {
  const match = new RegExp(`^#{1,6}\\s*${title}[：:]?\\s*$`, 'im').exec(content)
  if (!match || match.index === undefined) return ''
  const tail = content.slice(match.index + match[0].length).replace(/^\s*\n/, '')
  const nextHeading = tail.search(/^#{1,6}\s+/m)
  return (nextHeading >= 0 ? tail.slice(0, nextHeading) : tail).trim()
}

/** 防御模型把完整解析重复写入 answer：优先提取其中的“核心结论”。 */
export function sanitizeEnrichedAnswer(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const coreConclusion = markdownSection(raw, '核心结论')
  let answer = coreConclusion || raw
  if (!coreConclusion) {
    const detailedHeading = /^#{1,6}\s*(?:详细解析|解析|速记)[：:]?\s*$/im.exec(raw)
    if (detailedHeading?.index) answer = raw.slice(0, detailedHeading.index)
  }
  return answer.replace(/^#{1,6}\s*(?:答案|正确答案|参考答案)[：:]?\s*/i, '').trim()
}

function normalizeDrafts(value: unknown): QuestionDraft[] {
  if (!Array.isArray(value)) throw new Error('模型返回的题目不是数组。')
  return value.map((entry) => {
    const item = asRecord(entry)
    const followUps = item.followUps ?? item.follow_up_questions
    return {
      title: String(item.title ?? item.question ?? '').trim(),
      category: String(item.category ?? '未分类').trim(),
      difficulty: isDifficulty(item.difficulty) ? item.difficulty : '中等',
      importance: Math.min(5, Math.max(1, Number(item.importance) || 3)),
      answer: String(item.answer ?? item.answer_md ?? '').trim(),
      explanation: String(item.explanation ?? item.explanation_md ?? '').trim(),
      interviewAnswer: String(item.interviewAnswer ?? item.interview_answer ?? '').trim(),
      followUps: Array.isArray(followUps) ? followUps.map(String).filter(Boolean) : [],
    }
  }).filter((item) => item.title)
}

/** 校验批量生成输入，并限制一次最多处理 50 道题。 */
export function normalizeQuestionOutline(value: unknown, category: string): QuestionOutline[] {
  if (!Array.isArray(value) || !value.length) throw new Error('questions 必须是非空数组。')
  return value.map((entry) => {
    const item = asRecord(entry)
    return {
      title: String(item.title || item.question || '').trim(),
      difficulty: isDifficulty(item.difficulty) ? item.difficulty : '中等',
      category: String(category || item.category || '未分类').trim() || '未分类',
    }
  }).filter((item) => item.title).slice(0, 50)
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

type EnrichQuestionChunk = (outlines: QuestionOutline[], category: string, model: string, context?: string) => Promise<QuestionDraft[]>
const QUESTION_CHUNK_SIZE = 3
const SINGLE_QUESTION_ATTEMPTS = 2

async function enrichQuestionChunk(outlines: QuestionOutline[], category: string, model: string, context = ''): Promise<QuestionDraft[]> {
  const projectInstruction = context
    ? '对于项目经历、工程实践或场景类问题，只能依据 projectContext 中的事实生成参考回答；没有证据的能力必须明确说“仓库中未确认”，不要虚构上线效果、事故、指标、团队规模或个人贡献。'
    : ''
  const content = await completeChat({
    model,
    temperature: 0.15,
    max_tokens: Math.min(6_000, Math.max(1_400, outlines.length * 900)),
    messages: [
      { role: 'system', content: `你是一名资深 React Native 面试教练和题库编辑。只输出 JSON 数组，不要代码围栏。字段结构：${enrichedQuestionSchema}。技术背景以当前主流 React Native + TypeScript 为准，覆盖 React Native 0.7x/0.8x、Hermes、新架构 Fabric/TurboModules/JSI 等能力时必须说明版本或适用边界，不能把已经废弃的方案当成唯一正确答案。answer 只写直接答案，控制在 1-3 段或不超过 5 个要点，禁止出现“核心结论”“详细解析”“速记”等小节，禁止复制 explanation。explanation 才负责展开原理、原因、示例和边界，必须使用 Markdown 且严格包含“## 核心结论”“## 详细解析”“## 速记”三个小节。建议回答要短、自然、可直接在面试中复述，抓住定义、原理和一个关键取舍。每道题生成 2-4 个发散问题。严格按照输入题目顺序返回，title 必须原样保留，不得漏题、合并题目或虚构与题目无关的内容。${projectInstruction}` },
      { role: 'user', content: JSON.stringify({ category, questions: outlines, ...(context ? { projectContext: context.slice(0, 16_000) } : {}) }) },
    ],
  })
  const value = extractJsonArray<unknown>(content, '模型返回的题目不是有效 JSON。')
  if (value.length !== outlines.length) throw new Error(`模型返回 ${value.length} 道题，预期 ${outlines.length} 道。`)
  return outlines.map((outline, index) => {
    const item = asRecord(value[index])
    const answer = sanitizeEnrichedAnswer(item.answer ?? item.answer_md)
    const explanation = String(item.explanation ?? item.explanation_md ?? '').trim()
    const interviewAnswer = String(item.interviewAnswer ?? item.interview_answer ?? '').trim()
    if (!answer || !explanation || !interviewAnswer) throw new Error(`题目“${outline.title}”生成内容不完整。`)
    if (!/^##\s*核心结论/im.test(explanation) || !/^##\s*详细解析/im.test(explanation) || !/^##\s*速记/im.test(explanation)) throw new Error(`题目“${outline.title}”的解析小节不完整。`)
    if (/^#{1,6}\s*(?:详细解析|解析|速记)/im.test(answer)) throw new Error(`题目“${outline.title}”的答案混入了详细解析。`)
    const followUps = item.followUps ?? item.follow_up_questions
    return {
      title: outline.title,
      category,
      difficulty: outline.difficulty,
      importance: Math.min(5, Math.max(1, Number(item.importance) || 3)),
      answer,
      explanation,
      interviewAnswer,
      followUps: Array.isArray(followUps) ? followUps.map(String).filter(Boolean).slice(0, 4) : [],
    }
  })
}

/**
 * 将长任务拆成固定上限的小批次顺序生成。每批完成后立即 yield，调用方可以直接
 * 写入流式 HTTP 响应；顺序执行也避免题目多时同时压满上游模型的并发额度。
 */
export async function* enrichQuestionBatchStream(
  outlines: QuestionOutline[],
  category: string,
  model: string,
  enrich: EnrichQuestionChunk = enrichQuestionChunk,
  context = '',
): AsyncGenerator<QuestionDraft[]> {
  const enrichOne = async (outline: QuestionOutline) => {
    let lastError: unknown
    for (let attempt = 0; attempt < SINGLE_QUESTION_ATTEMPTS; attempt += 1) {
      try {
        return await enrich([outline], category, model, context)
      } catch (error) {
        lastError = error
        if (attempt < SINGLE_QUESTION_ATTEMPTS - 1 && !/配置不完整/.test(errorMessage(error))) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
        else break
      }
    }
    throw lastError
  }

  for (let index = 0; index < outlines.length; index += QUESTION_CHUNK_SIZE) {
    const chunk = outlines.slice(index, index + QUESTION_CHUNK_SIZE)
    try {
      yield await enrich(chunk, category, model, context)
    } catch (error) {
      if (chunk.length === 1 || /配置不完整/.test(errorMessage(error))) throw error
      // 三题批次超时或返回格式不完整时，立即降级为逐题生成。成功的题目会继续
      // 向浏览器推送，不再因为一个大批次失败而丢弃后面的所有题目。
      for (const outline of chunk) yield await enrichOne(outline)
    }
  }
}

/** 保留非流式调用入口，供兼容路由和内部调用复用同一套分批规则。 */
export async function enrichQuestionBatch(outlines: QuestionOutline[], category: string, model: string, context = ''): Promise<QuestionDraft[]> {
  const results: QuestionDraft[] = []
  for await (const chunk of enrichQuestionBatchStream(outlines, category, model, undefined, context)) results.push(...chunk)
  return results
}
