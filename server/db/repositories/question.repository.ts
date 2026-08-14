import { database } from '../connection.js'
import type { Difficulty, Mastery, Question, QuestionCategory, QuestionDraft, QuestionFilters, QuestionPatch } from '../../domain/question.js'

type CategoryRow = {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

type CategoryWithCountRow = CategoryRow & { question_count?: number }

type QuestionRow = {
  id: string
  title: string
  category: string
  difficulty: Difficulty
  importance: number
  mastery: Mastery
  answer: string
  explanation: string
  interview_answer: string
  follow_ups: string
}

const now = () => new Date().toISOString()
const normalizeCategoryName = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)

const toCategory = (row: CategoryWithCountRow): QuestionCategory => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  questionCount: Number(row.question_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toQuestion = (row: QuestionRow): Question => ({
  id: row.id,
  title: row.title,
  category: row.category,
  difficulty: row.difficulty,
  importance: row.importance,
  mastery: row.mastery,
  answer: row.answer,
  explanation: row.explanation,
  interviewAnswer: row.interview_answer,
  followUps: (() => {
    const value: unknown = JSON.parse(row.follow_ups || '[]')
    return Array.isArray(value) ? value.map(String) : []
  })(),
})

const findCategoryByName = database.prepare('SELECT * FROM question_categories WHERE name = ? COLLATE NOCASE')
const findCategoryById = database.prepare('SELECT * FROM question_categories WHERE id = ?')
const insertCategory = database.prepare('INSERT INTO question_categories (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
const insertQuestion = database.prepare(`INSERT INTO questions (id, title, category, difficulty, importance, mastery, answer, explanation, interview_answer, follow_ups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const updateQuestion = database.prepare(`UPDATE questions SET title = ?, category = ?, difficulty = ?, importance = ?, mastery = ?, answer = ?, explanation = ?, interview_answer = ?, follow_ups = ?, updated_at = ? WHERE id = ?`)

const getCategoryByName = (name: string) => findCategoryByName.get(name) as CategoryRow | undefined
const getCategoryById = (id: string) => findCategoryById.get(id) as CategoryRow | undefined

function ensureCategory(name: unknown): CategoryRow {
  const normalized = normalizeCategoryName(name) || '未分类'
  const existing = getCategoryByName(normalized)
  if (existing) return existing
  const timestamp = now()
  const nextRow = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM question_categories').get() as { next?: number } | undefined
  const sortOrder = Number(nextRow?.next ?? 0)
  const id = crypto.randomUUID()
  insertCategory.run(id, normalized, sortOrder, timestamp, timestamp)
  const created = getCategoryById(id)
  if (!created) throw new Error('分类创建后无法读取。')
  return created
}

export function listCategories(): QuestionCategory[] {
  const rows = database.prepare(`SELECT c.*, COUNT(q.id) AS question_count
    FROM question_categories c
    LEFT JOIN questions q ON q.category = c.name COLLATE NOCASE
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`).all() as CategoryWithCountRow[]
  return rows.map(toCategory)
}

export function createCategory(name: unknown): QuestionCategory {
  const normalized = normalizeCategoryName(name)
  if (!normalized) throw new Error('分类名称不能为空。')
  if (getCategoryByName(normalized)) {
    const error = new Error('分类已存在。') as Error & { code?: string }
    error.code = 'CATEGORY_EXISTS'
    throw error
  }
  const category = ensureCategory(normalized)
  return toCategory({ ...category, question_count: 0 })
}

export function updateCategory(id: string, name: unknown): QuestionCategory | null {
  const current = getCategoryById(id)
  if (!current) return null
  const normalized = normalizeCategoryName(name)
  if (!normalized) throw new Error('分类名称不能为空。')
  const duplicate = getCategoryByName(normalized)
  if (duplicate && duplicate.id !== id) {
    const error = new Error('分类已存在。') as Error & { code?: string }
    error.code = 'CATEGORY_EXISTS'
    throw error
  }
  if (normalized === current.name) return listCategories().find((item) => item.id === id) ?? null
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
  return listCategories().find((item) => item.id === id) ?? null
}

export function deleteCategory(id: string) {
  const current = getCategoryById(id)
  if (!current) return false
  const countRow = database.prepare('SELECT COUNT(*) AS count FROM questions WHERE category = ? COLLATE NOCASE').get(current.name) as { count?: number } | undefined
  const count = Number(countRow?.count ?? 0)
  if (count > 0) {
    const error = new Error(`分类下还有 ${count} 道题目，不能删除。`) as Error & { code?: string }
    error.code = 'CATEGORY_IN_USE'
    throw error
  }
  return database.prepare('DELETE FROM question_categories WHERE id = ?').run(id).changes > 0
}

export function listQuestions(filters: QuestionFilters = {}): Question[] {
  const clauses: string[] = []
  const values: string[] = []
  if (filters.q) { clauses.push('(title LIKE ? OR category LIKE ? OR answer LIKE ? OR explanation LIKE ? OR interview_answer LIKE ? OR follow_ups LIKE ?)'); values.push(...Array(6).fill(`%${filters.q}%`)) }
  if (filters.category && filters.category !== '全部分类') { clauses.push('category = ?'); values.push(filters.category) }
  if (filters.difficulty && filters.difficulty !== '全部难度') { clauses.push('difficulty = ?'); values.push(filters.difficulty) }
  if (filters.mastery && filters.mastery !== '全部掌握度') { clauses.push('mastery = ?'); values.push(filters.mastery) }
  const query = `SELECT * FROM questions ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY CASE mastery WHEN '未学习' THEN 0 WHEN '了解' THEN 1 WHEN '熟悉' THEN 2 ELSE 3 END, importance DESC, updated_at DESC`
  return (database.prepare(query).all(...values) as QuestionRow[]).map(toQuestion)
}

export function getQuestion(id: string): Question | null {
  const row = database.prepare('SELECT * FROM questions WHERE id = ?').get(id) as QuestionRow | undefined
  return row ? toQuestion(row) : null
}

export function createQuestions(drafts: QuestionDraft[]): Question[] {
  const timestamp = now()
  const created: Question[] = []
  for (const draft of drafts) ensureCategory(draft.category)
  database.exec('BEGIN')
  try {
    for (const draft of drafts) {
      const question: Question = { id: crypto.randomUUID(), mastery: '未学习', ...draft, category: normalizeCategoryName(draft.category) || '未分类' }
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

export function editQuestion(id: string, patch: QuestionPatch): Question | null {
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
