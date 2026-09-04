import type { Difficulty, QuestionDraft } from '../types/question'
import { normalizeFollowUps } from './followUps'

export type DifficultyHint = '简单' | '中等' | '困难'

export type QuestionOutline = {
  title: string
  difficulty: DifficultyHint
}

const difficultyFromLevel = (level = '', stars = '') => {
  const value = Number(String(level || '')) || String(stars || '').length || 2
  return value <= 1 ? '简单' : value === 2 ? '中等' : '困难'
}

const stripListPrefix = (line = '') => String(line || '').replace(/^(?:[-*•]|\d+[.)、]|[一二三四五六七八九十百]+、)\s*/, '').trim()

function markdownSection(content: string, title: string): string {
  const match = new RegExp(`^#{1,6}\\s*${title}[：:]?\\s*$`, 'im').exec(content)
  if (!match || match.index === undefined) return ''
  const tail = content.slice(match.index + match[0].length).replace(/^\s*\n/, '')
  const nextHeading = tail.search(/^#{1,6}\s+/m)
  return (nextHeading >= 0 ? tail.slice(0, nextHeading) : tail).trim()
}

export function sanitizeGeneratedAnswer(value: unknown): string {
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

export function parseQuestionOutline(source = '', categoryOverride = ''): { category: string; questions: QuestionOutline[] } {
  const safeSource = String(source || '')
  const safeCategory = String(categoryOverride || '')
  const lines = safeSource.split(/\r?\n/).map((line) => String(line || '').trim()).filter(Boolean)
  let category = safeCategory.trim()
  let difficulty: DifficultyHint = '中等'
  const questions: QuestionOutline[] = []

  for (const original of lines) {
    const line = original.replace(/^#+\s*/, '').trim()
    const levelMatch = line.match(/^(⭐+|★+)\s*(?:Level\s*)?(\d+)?(?:\s*[~～-]\s*(\d+))?\s*(?:[:：-]\s*(.*))?$/i)
    if (levelMatch) {
      difficulty = difficultyFromLevel(levelMatch[3] || levelMatch[2] || '', levelMatch[1])
      continue
    }
    if (/^(?:Level\s*)\d+/i.test(line)) {
      const levelMatchWithoutStars = line.match(/Level\s*(\d+)/i)
      difficulty = difficultyFromLevel(levelMatchWithoutStars?.[1] || '', '')
      continue
    }
    if (/^(?:---+|分类[:：])/i.test(line)) continue

    const numberedHeading = line.match(/^(?:[一二三四五六七八九十百]+|\d+)[、.)]\s*(.+)$/)
    if (numberedHeading && !/[？?]/.test(numberedHeading[1])) {
      if (!category) category = numberedHeading[1].trim()
      continue
    }
    if (/^#/.test(original) && !/[？?]/.test(line)) {
      if (!category) category = line
      continue
    }

    const title = stripListPrefix(line)
    if (!title || title.length < 4 || /^(?:基础概念|基础|进阶|高级|目录)$/i.test(title)) continue
    questions.push({ title, difficulty })
  }

  return { category: category || '未分类', questions }
}

export function parseImportedQuestions(source = ''): QuestionDraft[] {
  const trimmed = String(source || '').trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed) as { questions?: unknown } | unknown[]
    const items = Array.isArray(parsed) ? parsed : parsed.questions
    if (!Array.isArray(items)) throw new Error('JSON 顶层需要是数组，或包含 questions 数组。')
    return items
      .map((item) => normalizeImportedQuestion(item))
      .filter((item) => item.title)
  } catch (error) {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) throw error
  }

  return trimmed
    .split(/\n(?=---\s*$|##\s+)/gm)
    .map((block) => parseMarkdownQuestion(block))
    .filter((item) => item.title)
}

export function parseStructuredQuestion(source = ''): QuestionDraft {
  const raw = String(source || '').trim()
  if (!raw) throw new Error('请粘贴一道题目的 JSON 数据。')
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const content = fenced?.[1]?.trim() || raw

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('JSON 格式不正确，请检查引号、逗号和括号。')
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [parsed]
  if (items.length !== 1) throw new Error('单题编辑只能覆盖一道题，请只保留一个 JSON 对象。')
  if (!items[0] || typeof items[0] !== 'object' || Array.isArray(items[0])) throw new Error('JSON 内容必须是一道题目的对象。')

  const draft = normalizeImportedQuestion(items[0], false)
  if (!draft.title) throw new Error('结构化数据中缺少 title（或 question）字段。')
  return draft
}

function normalizeImportedQuestion(value: unknown, sanitizeAnswer = true): QuestionDraft {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const followUps = item.followUps ?? item.follow_up_questions
  const answer = item.answer ?? item.answer_md
  return {
    title: String(item.title ?? item.question ?? '').trim(),
    category: String(item.category ?? '未分类').trim(),
    difficulty: normalizeDifficulty(item.difficulty),
    importance: normalizeImportance(item.importance),
    answer: sanitizeAnswer ? sanitizeGeneratedAnswer(answer) : String(answer ?? '').trim(),
    explanation: String(item.explanation ?? item.explanation_md ?? '').trim(),
    interviewAnswer: String(item.interviewAnswer ?? item.interview_answer ?? '').trim(),
    followUps: normalizeFollowUps(followUps),
  }
}

function parseMarkdownQuestion(block: string): QuestionDraft {
  const title = block.match(/^##\s+(.+)$/m)?.[1]?.trim() ?? block.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
  const value = (label: string) => block.match(new RegExp(`^${label}[:：]\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? ''
  const section = (heading: string) => block.match(new RegExp(`###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, 'i'))?.[1]?.trim() ?? ''
  return {
    title,
    category: value('分类') || '未分类',
    difficulty: normalizeDifficulty(value('难度')),
    importance: normalizeImportance(value('重要性')),
    answer: section('答案'),
    explanation: section('详细解析|解析'),
    interviewAnswer: section('面试时建议的回答|建议回答'),
    followUps: section('发散问题').split('\n').map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean).map((line) => {
      const [question, ...answerParts] = line.split(/\s*(?:=>|\|\||｜)\s*/)
      return { question: question.trim(), answer: answerParts.join(' ').trim() }
    }).filter((item) => item.question),
  }
}

function normalizeDifficulty(value: unknown): Difficulty {
  return value === '简单' || value === '困难' ? value : '中等'
}

function normalizeImportance(value: unknown): number {
  return Math.min(5, Math.max(1, Number(value) || 3))
}
