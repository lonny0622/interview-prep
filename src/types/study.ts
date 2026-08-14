import type { ScoreResult } from './interview'
import type { Mastery } from './question'

export type LearningFilters = {
  category: string
  difficulty: string
  mastery: string
}

export type MasteryCounts = Record<Mastery, number>

export type LearningStats = {
  todayLearned: number
  totalQuestions: number
  mastery: MasteryCounts
  categories: Array<{
    name: string
    total: number
    mastery: MasteryCounts
  }>
}

export type PracticeFilters = LearningFilters

export type PracticeState = PracticeFilters & {
  questionIds: string[]
  index: number
  sessionId: string
  answer: string
  submitted: boolean
  scoring: boolean
  score: ScoreResult | null
}
