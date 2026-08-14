import type { QuestionRecord } from './questionApi'
import type { InterviewNextAction, InterviewReport, InterviewSession, InterviewSetup, InterviewTurn, SaveInterviewTurnInput, ScoreResult } from '../types/interview'
import { apiRequest } from './http'

type QuestionDraft = Omit<QuestionRecord, 'id' | 'mastery'>
type EnrichQuestionsInput = { category: string; questions: Array<{ title: string; difficulty: string }>; source?: string }

export const interviewApi = {
  create: (profile: InterviewSetup) => apiRequest<{ session: InterviewSession }>('/api/interview-sessions', { method: 'POST', body: JSON.stringify({ profile }) }),
  saveTurn: (id: string, payload: SaveInterviewTurnInput) => apiRequest<{ turn: InterviewTurn }>(`/api/interview-sessions/${id}/turns`, { method: 'POST', body: JSON.stringify(payload) }),
  nextAction: (id: string, answerText: string) => apiRequest<{ action: InterviewNextAction; session: InterviewSession }>(`/api/interview-sessions/${id}/next-action`, { method: 'POST', body: JSON.stringify({ answerText }) }),
  complete: (id: string) => apiRequest<{ session: InterviewSession; report: InterviewReport }>(`/api/interview-sessions/${id}/complete`, { method: 'POST' }),
}

export const speechApi = {
  transcribe: (audioBase64: string, mimeType: string) => apiRequest<{ text: string }>('/api/stt/transcribe', { method: 'POST', body: JSON.stringify({ audioBase64, mimeType }) }),
}

export const scoringApi = {
  score: (question: Pick<QuestionRecord, 'title' | 'answer' | 'interviewAnswer'>, answer: string) => apiRequest<{ score: ScoreResult }>('/api/score-answer', { method: 'POST', body: JSON.stringify({ question, answer }) }),
}

export const llmApi = {
  enrichQuestions: (payload: EnrichQuestionsInput, signal?: AbortSignal) => apiRequest<{ drafts: QuestionDraft[] }>('/api/llm/enrich-questions', { method: 'POST', body: JSON.stringify(payload), signal }),
}
