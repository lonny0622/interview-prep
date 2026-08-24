import type { ExplainSession } from '../../types/ai'

const STORAGE_KEY = 'interviewprep:ai-explain-sessions'
const MAX_SESSIONS = 50

export function loadExplainSessions(): ExplainSession[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return []
    const sessions = JSON.parse(value) as ExplainSession[]
    if (!Array.isArray(sessions)) return []
    return sessions.filter((session) => session?.id && session.question && session.selectedText && Array.isArray(session.messages)).slice(0, MAX_SESSIONS)
  } catch {
    return []
  }
}

export function saveExplainSessions(sessions: ExplainSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
  } catch {
    // History is a convenience feature; storage limits must not break the chat flow.
  }
}

export function toExplainSession(state: ExplainSession): ExplainSession {
  return {
    id: state.id,
    question: state.question,
    selectedText: state.selectedText,
    messages: state.messages,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}
