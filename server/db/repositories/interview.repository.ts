import { database } from '../connection.js'

const now = () => new Date().toISOString()
const toInterview = (row: any) => row ? ({
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

export function createInterviewSession(profile: unknown, blueprint: any[]) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO interview_sessions (id, status, stage, profile, blueprint, current_index, created_at, updated_at) VALUES (?, \'active\', ?, ?, ?, 0, ?, ?)').run(id, blueprint[0]?.stage || 'self_introduction', JSON.stringify(profile), JSON.stringify(blueprint), timestamp, timestamp)
  return getInterviewSession(id)
}

export function getInterviewSession(id: string) {
  return toInterview(database.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id))
}

export function listInterviewSessions() {
  return database.prepare('SELECT * FROM interview_sessions ORDER BY updated_at DESC LIMIT 20').all().map(toInterview)
}

export function saveInterviewTurn(sessionId: string, turn: any, score: unknown) {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO interview_turns (id, session_id, stage, question, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, sessionId, turn.stage, turn.question, turn.answerText || '', score ? JSON.stringify(score) : null, now())
  const nextIndex = Math.min(session.currentIndex + 1, Math.max(0, session.blueprint.length - 1))
  const nextStage = session.blueprint[nextIndex]?.stage || 'candidate_questions'
  database.prepare('UPDATE interview_sessions SET current_index = ?, stage = ?, updated_at = ? WHERE id = ?').run(nextIndex, nextStage, now(), sessionId)
  return { id, sessionId, stage: turn.stage, question: turn.question, answerText: turn.answerText || '', score: score || null }
}

export function completeInterviewSession(sessionId: string, report: unknown) {
  database.prepare('UPDATE interview_sessions SET status = \'completed\', report_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(report), now(), sessionId)
  return getInterviewSession(sessionId)
}

export function listInterviewTurns(sessionId: string) {
  return database.prepare('SELECT * FROM interview_turns WHERE session_id = ? ORDER BY created_at ASC').all(sessionId).map((row: any) => ({ id: row.id, sessionId: row.session_id, stage: row.stage, question: row.question, answerText: row.answer_text, score: row.score_json ? JSON.parse(row.score_json) : null, createdAt: row.created_at }))
}

export function insertInterviewFollowUp(sessionId: string, item: unknown) {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const blueprint = [...session.blueprint]
  blueprint.splice(session.currentIndex, 0, item)
  database.prepare('UPDATE interview_sessions SET blueprint = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(blueprint), now(), sessionId)
  return getInterviewSession(sessionId)
}
