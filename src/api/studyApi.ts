import { apiRequest } from './http'
import type { ScoreResult } from '../types/interview'
import type { Mastery } from '../types/question'
import type { LearningFilters, LearningStats, PracticeFilters } from '../types/study'

export const studyApi = {
  createLearningSession: (questionIds: string[], filters: LearningFilters) => apiRequest<{ session: { id: string } }>('/api/learning-sessions', { method: 'POST', body: JSON.stringify({ questionIds, filters }) }),
  saveLearningProgress: (questionId: string, mastery: Mastery, sessionId: string | null) => apiRequest<{ progress: unknown }>('/api/learning-progress', { method: 'POST', body: JSON.stringify({ questionId, mastery, sessionId }) }),
  learningStats: () => apiRequest<{ stats: LearningStats }>('/api/learning/stats'),
  createPracticeSession: (questionIds: string[], filters: PracticeFilters) => apiRequest<{ session: { id: string } }>('/api/practice-sessions', { method: 'POST', body: JSON.stringify({ questionIds, filters }) }),
  savePracticeAnswer: (payload: { sessionId: string; questionId: string; answerText: string; score: ScoreResult }) => apiRequest<{ answer: unknown }>('/api/practice-answers', { method: 'POST', body: JSON.stringify(payload) }),
}
