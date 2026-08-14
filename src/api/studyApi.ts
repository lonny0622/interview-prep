import { apiRequest } from './http'

export type LearningStats = { todayLearned: number; totalQuestions: number; mastery: Record<string, number>; categories: Array<{ name: string; total: number; mastery: Record<string, number> }> }

export const studyApi = {
  createLearningSession: (questionIds: string[], filters: Record<string, string>) => apiRequest<{ session: { id: string } }>('/api/learning-sessions', { method: 'POST', body: JSON.stringify({ questionIds, filters }) }),
  saveLearningProgress: (questionId: string, mastery: string, sessionId: string | null) => apiRequest<{ progress: unknown }>('/api/learning-progress', { method: 'POST', body: JSON.stringify({ questionId, mastery, sessionId }) }),
  learningStats: () => apiRequest<{ stats: LearningStats }>('/api/learning/stats'),
  createPracticeSession: (questionIds: string[], filters: Record<string, string>) => apiRequest<{ session: { id: string } }>('/api/practice-sessions', { method: 'POST', body: JSON.stringify({ questionIds, filters }) }),
  savePracticeAnswer: (payload: { sessionId: string; questionId: string; answerText: string; score: unknown }) => apiRequest<{ answer: unknown }>('/api/practice-answers', { method: 'POST', body: JSON.stringify(payload) }),
}
