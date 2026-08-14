import type { Mastery } from './question.js'

export type LearningSession = {
  id: string
  questionIds: string[]
  currentIndex: number
  createdAt: string
}

export type LearningProgress = {
  id: string
  questionId: string
  sessionId: string | null
  mastery: Mastery
  learnedAt: string
}

export type CategoryLearningStats = {
  name: string
  total: number
  mastery: Record<Mastery, number>
}

export type LearningStats = {
  todayLearned: number
  totalQuestions: number
  mastery: Record<Mastery, number>
  categories: CategoryLearningStats[]
}

export type PracticeSession = {
  id: string
  questionIds: string[]
  currentIndex: number
  filters: Record<string, unknown>
  createdAt: string
}

export type PracticeAnswer = {
  id: string
  sessionId: string
  questionId: string
  answerText: string
  score: unknown
}
