import { apiRequest } from './http'

export type InterviewSessionRecord = {
  id: string
  status: 'active' | 'completed'
  stage: string
  profile: Record<string, unknown>
  blueprint: Array<{ stage: string; kind: string; question: string; focus: string; referenceAnswer: string; followUps: string[] }>
  currentIndex: number
  report: any
}

export const interviewApi = {
  create: (profile: unknown) => apiRequest<{ session: InterviewSessionRecord }>('/api/interview-sessions', { method: 'POST', body: JSON.stringify({ profile }) }),
  saveTurn: (id: string, payload: unknown) => apiRequest<{ turn: any }>(`/api/interview-sessions/${id}/turns`, { method: 'POST', body: JSON.stringify(payload) }),
  nextAction: (id: string, answerText: string) => apiRequest<{ action: any; session: InterviewSessionRecord }>(`/api/interview-sessions/${id}/next-action`, { method: 'POST', body: JSON.stringify({ answerText }) }),
  complete: (id: string) => apiRequest<{ session: InterviewSessionRecord; report: any }>(`/api/interview-sessions/${id}/complete`, { method: 'POST' }),
}

export const speechApi = {
  transcribe: (audioBase64: string, mimeType: string) => apiRequest<{ text: string }>('/api/stt/transcribe', { method: 'POST', body: JSON.stringify({ audioBase64, mimeType }) }),
}

export const scoringApi = {
  score: (question: unknown, answer: string) => apiRequest<{ score: unknown }>('/api/score-answer', { method: 'POST', body: JSON.stringify({ question, answer }) }),
}

export const llmApi = {
  enrichQuestions: (payload: unknown, signal?: AbortSignal) => apiRequest<{ drafts: any[] }>('/api/llm/enrich-questions', { method: 'POST', body: JSON.stringify(payload), signal }),
}
