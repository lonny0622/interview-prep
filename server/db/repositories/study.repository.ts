import { database } from '../connection.js'

const now = () => new Date().toISOString()

export function createLearningSession(questionIds: string[]) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO learning_sessions (id, question_ids, current_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, JSON.stringify(questionIds), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, createdAt: timestamp }
}

export function saveLearningProgress(questionId: string, mastery: string, sessionId: string | null = null) {
  const question = database.prepare('SELECT id FROM questions WHERE id = ?').get(questionId)
  if (!question) return null
  const id = crypto.randomUUID()
  const learnedAt = now()
  database.prepare('INSERT INTO learning_progress (id, question_id, session_id, mastery, learned_at) VALUES (?, ?, ?, ?, ?)').run(id, questionId, sessionId || null, mastery, learnedAt)
  return { id, questionId, sessionId: sessionId || null, mastery, learnedAt }
}

export function getLearningStats() {
  const masteryValues = ['未学习', '了解', '熟悉', '掌握']
  const mastery = Object.fromEntries(masteryValues.map((value) => [value, 0]))
  for (const row of database.prepare('SELECT mastery, COUNT(*) AS count FROM questions GROUP BY mastery').all()) mastery[row.mastery] = Number(row.count)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayLearned = Number(database.prepare('SELECT COUNT(DISTINCT question_id) AS count FROM learning_progress WHERE learned_at >= ?').get(startOfToday.toISOString()).count)
  const totalQuestions = Number(database.prepare('SELECT COUNT(*) AS count FROM questions').get().count)
  const categories = database.prepare(`SELECT category, mastery, COUNT(*) AS count FROM questions GROUP BY category, mastery ORDER BY category COLLATE NOCASE ASC`).all()
  const categoryMap = new Map()
  for (const row of categories) {
    if (!categoryMap.has(row.category)) categoryMap.set(row.category, { name: row.category, total: 0, mastery: Object.fromEntries(masteryValues.map((value) => [value, 0])) })
    const item = categoryMap.get(row.category)
    item.mastery[row.mastery] = Number(row.count)
    item.total += Number(row.count)
  }
  return { todayLearned, totalQuestions, mastery, categories: [...categoryMap.values()] }
}

export function createPracticeSession(questionIds: string[], filters: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO practice_sessions (id, question_ids, current_index, filters, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)').run(id, JSON.stringify(questionIds), JSON.stringify(filters), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, filters, createdAt: timestamp }
}

export function savePracticeAnswer(sessionId: string, questionId: string, answerText: string, score: unknown) {
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO practice_answers (id, session_id, question_id, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, sessionId, questionId, answerText, score ? JSON.stringify(score) : null, now())
  return { id, sessionId, questionId, answerText, score: score || null }
}
