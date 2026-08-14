import { database } from './db/connection.js'
import './db/schema.js'
import { createQuestions } from './db/repositories/question.repository.js'
export { createCategory, deleteCategory, editQuestion, getQuestion, listCategories, listQuestions, createQuestions, removeQuestion, updateCategory } from './db/repositories/question.repository.js'
export { createJobProfile, createResume, deleteJobProfile, deleteResume, getProfile, listJobProfiles, updateJobProfile, updateProfile, updateResume } from './db/repositories/profile.repository.js'

const now = () => new Date().toISOString()
export function createLearningSession(questionIds) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO learning_sessions (id, question_ids, current_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, JSON.stringify(questionIds), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, createdAt: timestamp }
}

export function saveLearningProgress(questionId, mastery, sessionId = null) {
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
  const categories = database.prepare(`SELECT category, mastery, COUNT(*) AS count
    FROM questions
    GROUP BY category, mastery
    ORDER BY category COLLATE NOCASE ASC`).all()
  const categoryMap = new Map()
  for (const row of categories) {
    if (!categoryMap.has(row.category)) categoryMap.set(row.category, { name: row.category, total: 0, mastery: Object.fromEntries(masteryValues.map((value) => [value, 0])) })
    const item = categoryMap.get(row.category)
    item.mastery[row.mastery] = Number(row.count)
    item.total += Number(row.count)
  }
  return { todayLearned, totalQuestions, mastery, categories: [...categoryMap.values()] }
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
