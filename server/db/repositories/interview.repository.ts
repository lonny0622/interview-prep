import { database } from '../connection.js'
import type { InterviewBlueprintItem, InterviewProfile, InterviewReport, InterviewSession, InterviewStage, InterviewTurn, SaveInterviewTurnInput } from '../../domain/interview.js'
import type { ScoreResult } from '../../domain/question.js'

type InterviewRow = {
  id: string
  status: 'active' | 'completed'
  stage: InterviewStage
  profile: string
  blueprint: string
  current_index: number
  report_json: string | null
  created_at: string
  updated_at: string
}

type InterviewTurnRow = {
  id: string
  session_id: string
  stage: InterviewStage
  question: string
  answer_text: string
  score_json: string | null
  created_at: string
}

const now = () => new Date().toISOString()
const toInterview = (row: InterviewRow | undefined): InterviewSession | null => row ? ({
  id: row.id,
  status: row.status,
  stage: row.stage,
  profile: JSON.parse(row.profile || '{}') as InterviewProfile,
  blueprint: JSON.parse(row.blueprint || '[]') as InterviewBlueprintItem[],
  currentIndex: row.current_index,
  report: row.report_json ? JSON.parse(row.report_json) as InterviewReport : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null

export function createInterviewSession(profile: InterviewProfile, blueprint: InterviewBlueprintItem[]): InterviewSession | null {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO interview_sessions (id, status, stage, profile, blueprint, current_index, created_at, updated_at) VALUES (?, \'active\', ?, ?, ?, 0, ?, ?)').run(id, blueprint[0]?.stage || 'self_introduction', JSON.stringify(profile), JSON.stringify(blueprint), timestamp, timestamp)
  return getInterviewSession(id)
}

export function getInterviewSession(id: string) {
  return toInterview(database.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id) as InterviewRow | undefined)
}

export function listInterviewSessions(): InterviewSession[] {
  return (database.prepare('SELECT * FROM interview_sessions ORDER BY updated_at DESC LIMIT 20').all() as InterviewRow[]).map((row) => toInterview(row)).filter((session): session is InterviewSession => Boolean(session))
}

export function saveInterviewTurn(sessionId: string, turn: SaveInterviewTurnInput, score: ScoreResult | null): InterviewTurn | null {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO interview_turns (id, session_id, stage, question, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, sessionId, turn.stage, turn.question, turn.answerText || '', score ? JSON.stringify(score) : null, now())
  const nextIndex = Math.min(session.currentIndex + 1, Math.max(0, session.blueprint.length - 1))
  const nextStage = session.blueprint[nextIndex]?.stage || 'candidate_questions'
  database.prepare('UPDATE interview_sessions SET current_index = ?, stage = ?, updated_at = ? WHERE id = ?').run(nextIndex, nextStage, now(), sessionId)
  return { id, sessionId, stage: turn.stage, question: turn.question, answerText: turn.answerText || '', score: score || null }
}

export function completeInterviewSession(sessionId: string, report: InterviewReport): InterviewSession | null {
  database.prepare('UPDATE interview_sessions SET status = \'completed\', report_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(report), now(), sessionId)
  return getInterviewSession(sessionId)
}

export function listInterviewTurns(sessionId: string): InterviewTurn[] {
  return (database.prepare('SELECT * FROM interview_turns WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as InterviewTurnRow[]).map((row) => ({ id: row.id, sessionId: row.session_id, stage: row.stage, question: row.question, answerText: row.answer_text, score: row.score_json ? JSON.parse(row.score_json) as ScoreResult : null, createdAt: row.created_at }))
}

export function insertInterviewFollowUp(sessionId: string, item: InterviewBlueprintItem): InterviewSession | null {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const blueprint = [...session.blueprint]
  blueprint.splice(session.currentIndex, 0, item)
  database.prepare('UPDATE interview_sessions SET blueprint = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(blueprint), now(), sessionId)
  return getInterviewSession(sessionId)
}
