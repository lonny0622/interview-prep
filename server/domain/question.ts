export type Difficulty = '简单' | '中等' | '困难'
export type Mastery = '未学习' | '了解' | '熟悉' | '掌握'

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
  followUps: string[]
}

export type QuestionDraft = Omit<Question, 'id' | 'mastery'>
export type QuestionPatch = Partial<Omit<Question, 'id'>>

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
