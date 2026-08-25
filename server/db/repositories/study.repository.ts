import '../schema.js'
import { database } from '../connection.js'
import type { Mastery } from '../../domain/question.js'
import type { CategoryLearningStats, LearningProgress, LearningSession, LearningStats, PracticeAnswer, PracticeSession } from '../../domain/study.js'

type MasteryCountRow = { mastery: Mastery; count: number }
type CategoryMasteryCountRow = MasteryCountRow & { category: string }

const now = () => new Date().toISOString()

const emptyMastery = (): Record<Mastery, number> => ({ 未学习: 0, 了解: 0, 熟悉: 0, 掌握: 0 })

export function createLearningSession(questionIds: string[]): LearningSession {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO learning_sessions (id, question_ids, current_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, JSON.stringify(questionIds), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, createdAt: timestamp }
}

export function saveLearningProgress(questionId: string, mastery: Mastery, sessionId: string | null = null): LearningProgress | null {
  const question = database.prepare('SELECT id FROM questions WHERE id = ?').get(questionId)
  if (!question) return null
  const id = crypto.randomUUID()
  const learnedAt = now()
  database.exec('BEGIN IMMEDIATE')
  try {
    database.prepare('UPDATE questions SET mastery = ?, updated_at = ? WHERE id = ?').run(mastery, learnedAt, questionId)
    database.prepare('INSERT INTO learning_progress (id, question_id, session_id, mastery, learned_at) VALUES (?, ?, ?, ?, ?)').run(id, questionId, sessionId || null, mastery, learnedAt)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  return { id, questionId, sessionId: sessionId || null, mastery, learnedAt }
}

export function getLearningStats(since?: string): LearningStats {
  const mastery = emptyMastery()
  for (const row of database.prepare('SELECT mastery, COUNT(*) AS count FROM questions GROUP BY mastery').all() as MasteryCountRow[]) mastery[row.mastery] = Number(row.count)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayLearned = Number(database.prepare('SELECT COUNT(DISTINCT question_id) AS count FROM learning_progress WHERE learned_at >= ?').get(since || startOfToday.toISOString())?.count ?? 0)
  const totalQuestions = Number(database.prepare('SELECT COUNT(*) AS count FROM questions').get()?.count ?? 0)
  const categories = database.prepare(`SELECT category, mastery, COUNT(*) AS count FROM questions GROUP BY category, mastery ORDER BY category COLLATE NOCASE ASC`).all() as CategoryMasteryCountRow[]
  const categoryMap = new Map<string, CategoryLearningStats>()
  for (const row of categories) {
    if (!categoryMap.has(row.category)) categoryMap.set(row.category, { name: row.category, total: 0, mastery: emptyMastery() })
    const item = categoryMap.get(row.category)
    if (!item) continue
    item.mastery[row.mastery] = Number(row.count)
    item.total += Number(row.count)
  }
  return { todayLearned, totalQuestions, mastery, categories: [...categoryMap.values()] }
}

export function createPracticeSession(questionIds: string[], filters: Record<string, unknown> = {}): PracticeSession {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO practice_sessions (id, question_ids, current_index, filters, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)').run(id, JSON.stringify(questionIds), JSON.stringify(filters), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, filters, createdAt: timestamp }
}

export function savePracticeAnswer(sessionId: string, questionId: string, answerText: string, score: unknown): PracticeAnswer {
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO practice_answers (id, session_id, question_id, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, sessionId, questionId, answerText, score ? JSON.stringify(score) : null, now())
  return { id, sessionId, questionId, answerText, score: score || null }
}
