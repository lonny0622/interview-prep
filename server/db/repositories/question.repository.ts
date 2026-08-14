import { database } from '../connection.js'

const now = () => new Date().toISOString()
const normalizeCategoryName = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)

const toCategory = (row: any) => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  questionCount: Number(row.question_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toQuestion = (row: any) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  difficulty: row.difficulty,
  importance: row.importance,
  mastery: row.mastery,
  answer: row.answer,
  explanation: row.explanation,
  interviewAnswer: row.interview_answer,
  followUps: JSON.parse(row.follow_ups || '[]'),
})

const findCategoryByName = database.prepare('SELECT * FROM question_categories WHERE name = ? COLLATE NOCASE')
const findCategoryById = database.prepare('SELECT * FROM question_categories WHERE id = ?')
const insertCategory = database.prepare('INSERT INTO question_categories (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
const insertQuestion = database.prepare(`INSERT INTO questions (id, title, category, difficulty, importance, mastery, answer, explanation, interview_answer, follow_ups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const updateQuestion = database.prepare(`UPDATE questions SET title = ?, category = ?, difficulty = ?, importance = ?, mastery = ?, answer = ?, explanation = ?, interview_answer = ?, follow_ups = ?, updated_at = ? WHERE id = ?`)

function ensureCategory(name: unknown): any {
  const normalized = normalizeCategoryName(name) || '未分类'
  const existing = findCategoryByName.get(normalized)
  if (existing) return existing
  const timestamp = now()
  const sortOrder = Number(database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM question_categories').get()?.next ?? 0)
  const id = crypto.randomUUID()
  insertCategory.run(id, normalized, sortOrder, timestamp, timestamp)
  return findCategoryById.get(id)
}

export function listCategories() {
  return database.prepare(`SELECT c.*, COUNT(q.id) AS question_count
    FROM question_categories c
    LEFT JOIN questions q ON q.category = c.name COLLATE NOCASE
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`).all().map(toCategory)
}

export function createCategory(name: unknown) {
  const normalized = normalizeCategoryName(name)
  if (!normalized) throw new Error('分类名称不能为空。')
  if (findCategoryByName.get(normalized)) {
    const error = new Error('分类已存在。') as Error & { code?: string }
    error.code = 'CATEGORY_EXISTS'
    throw error
  }
  const category = ensureCategory(normalized)
  return toCategory({ ...category, question_count: 0 })
}

export function updateCategory(id: string, name: unknown) {
  const current = findCategoryById.get(id)
  if (!current) return null
  const normalized = normalizeCategoryName(name)
  if (!normalized) throw new Error('分类名称不能为空。')
  const duplicate = findCategoryByName.get(normalized)
  if (duplicate && duplicate.id !== id) {
    const error = new Error('分类已存在。') as Error & { code?: string }
    error.code = 'CATEGORY_EXISTS'
    throw error
  }
  if (normalized === current.name) return listCategories().find((item) => item.id === id)
  const timestamp = now()
  database.exec('BEGIN')
  try {
    database.prepare('UPDATE question_categories SET name = ?, updated_at = ? WHERE id = ?').run(normalized, timestamp, id)
    database.prepare('UPDATE questions SET category = ?, updated_at = ? WHERE category = ? COLLATE NOCASE').run(normalized, timestamp, current.name)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  return listCategories().find((item) => item.id === id)
}

export function deleteCategory(id: string) {
  const current = findCategoryById.get(id)
  if (!current) return false
  const count = Number(database.prepare('SELECT COUNT(*) AS count FROM questions WHERE category = ? COLLATE NOCASE').get(current.name)?.count ?? 0)
  if (count > 0) {
    const error = new Error(`分类下还有 ${count} 道题目，不能删除。`) as Error & { code?: string }
    error.code = 'CATEGORY_IN_USE'
    throw error
  }
  return database.prepare('DELETE FROM question_categories WHERE id = ?').run(id).changes > 0
}

export function listQuestions(filters: Record<string, string> = {}) {
  const clauses: string[] = []
  const values: string[] = []
  if (filters.q) { clauses.push('(title LIKE ? OR category LIKE ? OR answer LIKE ? OR explanation LIKE ? OR interview_answer LIKE ? OR follow_ups LIKE ?)'); values.push(...Array(6).fill(`%${filters.q}%`)) }
  if (filters.category && filters.category !== '全部分类') { clauses.push('category = ?'); values.push(filters.category) }
  if (filters.difficulty && filters.difficulty !== '全部难度') { clauses.push('difficulty = ?'); values.push(filters.difficulty) }
  if (filters.mastery && filters.mastery !== '全部掌握度') { clauses.push('mastery = ?'); values.push(filters.mastery) }
  const query = `SELECT * FROM questions ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY CASE mastery WHEN '未学习' THEN 0 WHEN '了解' THEN 1 WHEN '熟悉' THEN 2 ELSE 3 END, importance DESC, updated_at DESC`
  return database.prepare(query).all(...values).map(toQuestion)
}

export function getQuestion(id: string) {
  const row = database.prepare('SELECT * FROM questions WHERE id = ?').get(id)
  return row ? toQuestion(row) : null
}

export function createQuestions(drafts: any[]) {
  const timestamp = now()
  const created: any[] = []
  for (const draft of drafts) ensureCategory(draft.category)
  database.exec('BEGIN')
  try {
    for (const draft of drafts) {
      const question = { id: crypto.randomUUID(), mastery: '未学习', ...draft, category: normalizeCategoryName(draft.category) || '未分类' }
      insertQuestion.run(question.id, question.title, question.category, question.difficulty, question.importance, question.mastery, question.answer, question.explanation, question.interviewAnswer, JSON.stringify(question.followUps), timestamp, timestamp)
      created.push(question)
    }
    database.exec('COMMIT')
    return created
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function editQuestion(id: string, patch: any) {
  const current = getQuestion(id)
  if (!current) return null
  const next = { ...current, ...patch, id, category: normalizeCategoryName(patch.category ?? current.category) || '未分类' }
  ensureCategory(next.category)
  updateQuestion.run(next.title, next.category, next.difficulty, next.importance, next.mastery, next.answer, next.explanation, next.interviewAnswer, JSON.stringify(next.followUps), now(), id)
  return getQuestion(id)
}

export function removeQuestion(id: string) {
  return database.prepare('DELETE FROM questions WHERE id = ?').run(id).changes > 0
}
