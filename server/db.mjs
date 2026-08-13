import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const dataPath = resolve(process.env.INTERVIEWPREP_DATA_DIR || resolve(dirname(new URL(import.meta.url).pathname), '..', 'data'), 'interviewprep.sqlite')
mkdirSync(dirname(dataPath), { recursive: true })
const database = new DatabaseSync(dataPath)

database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('简单', '中等', '困难')),
    importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
    mastery TEXT NOT NULL DEFAULT '未学习' CHECK (mastery IN ('未学习', '了解', '熟悉', '掌握')),
    answer TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    interview_answer TEXT NOT NULL DEFAULT '',
    follow_ups TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS learning_sessions (
    id TEXT PRIMARY KEY,
    question_ids TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY,
    question_ids TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    filters TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS practice_answers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    score_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS interview_sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
    stage TEXT NOT NULL DEFAULT 'self_introduction',
    profile TEXT NOT NULL DEFAULT '{}',
    blueprint TEXT NOT NULL DEFAULT '[]',
    current_index INTEGER NOT NULL DEFAULT 0,
    report_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS interview_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    question TEXT NOT NULL,
    answer_text TEXT NOT NULL DEFAULT '',
    score_json TEXT,
    created_at TEXT NOT NULL
  );
`)

const now = () => new Date().toISOString()
const toQuestion = (row) => ({
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

const insertQuestion = database.prepare(`INSERT INTO questions (id, title, category, difficulty, importance, mastery, answer, explanation, interview_answer, follow_ups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const updateQuestion = database.prepare(`UPDATE questions SET title = ?, category = ?, difficulty = ?, importance = ?, mastery = ?, answer = ?, explanation = ?, interview_answer = ?, follow_ups = ?, updated_at = ? WHERE id = ?`)

export function listQuestions(filters = {}) {
  const clauses = []
  const values = []
  if (filters.q) { clauses.push('(title LIKE ? OR category LIKE ? OR answer LIKE ? OR explanation LIKE ? OR interview_answer LIKE ? OR follow_ups LIKE ?)'); values.push(...Array(6).fill(`%${filters.q}%`)) }
  if (filters.category && filters.category !== '全部分类') { clauses.push('category = ?'); values.push(filters.category) }
  if (filters.difficulty && filters.difficulty !== '全部难度') { clauses.push('difficulty = ?'); values.push(filters.difficulty) }
  if (filters.mastery && filters.mastery !== '全部掌握度') { clauses.push('mastery = ?'); values.push(filters.mastery) }
  const query = `SELECT * FROM questions ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY CASE mastery WHEN '未学习' THEN 0 WHEN '了解' THEN 1 WHEN '熟悉' THEN 2 ELSE 3 END, importance DESC, updated_at DESC`
  return database.prepare(query).all(...values).map(toQuestion)
}

export function getQuestion(id) {
  const row = database.prepare('SELECT * FROM questions WHERE id = ?').get(id)
  return row ? toQuestion(row) : null
}

export function createQuestions(drafts) {
  const timestamp = now()
  const created = []
  database.exec('BEGIN')
  try {
    for (const draft of drafts) {
      const question = { id: crypto.randomUUID(), mastery: '未学习', ...draft }
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

export function editQuestion(id, patch) {
  const current = getQuestion(id)
  if (!current) return null
  const next = { ...current, ...patch, id }
  updateQuestion.run(next.title, next.category, next.difficulty, next.importance, next.mastery, next.answer, next.explanation, next.interviewAnswer, JSON.stringify(next.followUps), now(), id)
  return getQuestion(id)
}

export function removeQuestion(id) {
  return database.prepare('DELETE FROM questions WHERE id = ?').run(id).changes > 0
}

export function createLearningSession(questionIds) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO learning_sessions (id, question_ids, current_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, JSON.stringify(questionIds), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, createdAt: timestamp }
}

export function createPracticeSession(questionIds, filters = {}) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO practice_sessions (id, question_ids, current_index, filters, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)').run(id, JSON.stringify(questionIds), JSON.stringify(filters), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, filters, createdAt: timestamp }
}

export function savePracticeAnswer(sessionId, questionId, answerText, score) {
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO practice_answers (id, session_id, question_id, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, sessionId, questionId, answerText, score ? JSON.stringify(score) : null, now())
  return { id, sessionId, questionId, answerText, score: score || null }
}

const toInterview = (row) => row ? ({
  id: row.id,
  status: row.status,
  stage: row.stage,
  profile: JSON.parse(row.profile || '{}'),
  blueprint: JSON.parse(row.blueprint || '[]'),
  currentIndex: row.current_index,
  report: row.report_json ? JSON.parse(row.report_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null

export function createInterviewSession(profile, blueprint) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO interview_sessions (id, status, stage, profile, blueprint, current_index, created_at, updated_at) VALUES (?, \'active\', ?, ?, ?, 0, ?, ?)').run(id, blueprint[0]?.stage || 'self_introduction', JSON.stringify(profile), JSON.stringify(blueprint), timestamp, timestamp)
  return getInterviewSession(id)
}

export function getInterviewSession(id) {
  return toInterview(database.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id))
}

export function listInterviewSessions() {
  return database.prepare('SELECT * FROM interview_sessions ORDER BY updated_at DESC LIMIT 20').all().map(toInterview)
}

export function saveInterviewTurn(sessionId, turn, score) {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO interview_turns (id, session_id, stage, question, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, sessionId, turn.stage, turn.question, turn.answerText || '', score ? JSON.stringify(score) : null, now())
  const nextIndex = Math.min(session.currentIndex + 1, Math.max(0, session.blueprint.length - 1))
  const nextStage = session.blueprint[nextIndex]?.stage || 'candidate_questions'
  database.prepare('UPDATE interview_sessions SET current_index = ?, stage = ?, updated_at = ? WHERE id = ?').run(nextIndex, nextStage, now(), sessionId)
  return { id, sessionId, stage: turn.stage, question: turn.question, answerText: turn.answerText || '', score: score || null }
}

export function completeInterviewSession(sessionId, report) {
  database.prepare('UPDATE interview_sessions SET status = \'completed\', report_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(report), now(), sessionId)
  return getInterviewSession(sessionId)
}

export function listInterviewTurns(sessionId) {
  return database.prepare('SELECT * FROM interview_turns WHERE session_id = ? ORDER BY created_at ASC').all(sessionId).map((row) => ({ id: row.id, sessionId: row.session_id, stage: row.stage, question: row.question, answerText: row.answer_text, score: row.score_json ? JSON.parse(row.score_json) : null, createdAt: row.created_at }))
}

export function insertInterviewFollowUp(sessionId, item) {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const blueprint = [...session.blueprint]
  blueprint.splice(session.currentIndex, 0, item)
  database.prepare('UPDATE interview_sessions SET blueprint = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(blueprint), now(), sessionId)
  return getInterviewSession(sessionId)
}

export function seedQuestionsIfEmpty() {
  if (database.prepare('SELECT COUNT(*) AS count FROM questions').get().count > 0) return
  createQuestions([
    { title: 'React 中为什么需要 key？key 变化时会发生什么？', category: 'React', difficulty: '中等', importance: 5, answer: 'key 用来标识列表中的稳定身份，帮助 React 在协调阶段复用正确的 Fiber。', explanation: 'key 参与 Diff。稳定且唯一的 key 可以让节点在位置变化时保持状态；使用 index 作为 key，在插入、删除或排序时可能造成状态错位。', interviewAnswer: '我会先说明 key 是列表项的身份标识，再结合列表插入和组件状态错位的例子解释为什么不建议随意使用 index。', followUps: ['什么时候 index 可以作为 key？', 'key 变化为什么会导致组件重新挂载？'] },
    { title: '如何定位前端页面的性能瓶颈？', category: '性能优化', difficulty: '困难', importance: 5, answer: '先定义指标和用户感知，再通过 Performance、Network 和 React Profiler 分层定位。', explanation: '不要一开始就改代码。先区分加载、运行时和交互响应问题，建立基线后再验证资源体积、长任务、渲染次数和接口瀑布等假设。', interviewAnswer: '我会按指标、采样、假设、验证四步讲，并给出一个真实项目中从长任务定位到组件拆分的例子。', followUps: ['LCP 和 INP 分别反映什么？', '如何避免优化后引入新的问题？'] },
    { title: '项目中遇到过最棘手的线上问题是什么？', category: '项目题', difficulty: '中等', importance: 4, answer: '用 STAR 结构回答：背景、任务、行动、结果，并明确个人贡献。', explanation: '重点不在于把事故讲得多严重，而在于说明你如何定位问题、如何做取舍，以及最后有没有留下监控或流程改进。', interviewAnswer: '我会控制在两分钟内，先交代影响范围，再讲定位过程和关键决策，最后量化结果和后续改进。', followUps: ['如果重新做一次，你会改变什么？'] },
  ])
}

seedQuestionsIfEmpty()
