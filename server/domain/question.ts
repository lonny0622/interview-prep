export type Difficulty = '简单' | '中等' | '困难'
export type Mastery = '未学习' | '了解' | '熟悉' | '掌握'

export type FollowUp = {
  question: string
  answer: string
}

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

/** 兼容历史 string[]，并过滤模型或客户端返回的无效追问。 */
export function normalizeFollowUps(value: unknown, limit = 10): FollowUp[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const question = entry.trim()
      return question ? [{ question, answer: '' }] : []
    }
    const item = asRecord(entry)
    const question = String(item.question ?? item.title ?? item.followUp ?? '').trim()
    if (!question) return []
    return [{ question, answer: String(item.answer ?? item.response ?? '').trim() }]
  }).slice(0, limit)
}

export type Question = {
  id: string
  title: string
  category: string
  difficulty: Difficulty
  importance: number
  mastery: Mastery
  answer: string
  explanation: string
  interviewAnswer: string
  followUps: FollowUp[]
}

export type QuestionDraft = Omit<Question, 'id' | 'mastery'>
export type QuestionPatch = Partial<Omit<Question, 'id'>>

export type GeneratedQuestionContentUpdate = Pick<Question, 'id' | 'answer' | 'explanation' | 'interviewAnswer' | 'followUps' | 'importance'>

export type FollowUpAnswerContext = Pick<Question, 'title' | 'category' | 'difficulty' | 'answer'>

export type QuestionOutline = Pick<QuestionDraft, 'title' | 'difficulty' | 'category'>

export type QuestionCategory = {
  id: string
  name: string
  sortOrder: number
  questionCount: number
  createdAt: string
  updatedAt: string
}

export type QuestionFilters = Partial<Record<'q' | 'category' | 'difficulty' | 'mastery', string>>

export type ScoreQuestion = Pick<Question, 'title' | 'answer' | 'interviewAnswer'>

export type ScoreResult = {
  score: number
  dimensions?: Record<string, number>
  strengths: string[]
  gaps: string[]
  betterAnswer: string
  source?: string
  fallbackReason?: string
}
