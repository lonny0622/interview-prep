import { apiRequest } from './http'
import type { Question, QuestionCategory, QuestionDraft } from '../types/question'

export const questionApi = {
  list: (filters: Record<string, string> = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    return apiRequest<{ questions: Question[] }>(`/api/questions${query.size ? `?${query}` : ''}`)
  },
  categories: () => apiRequest<{ categories: QuestionCategory[] }>('/api/categories'),
  createCategory: (name: string) => apiRequest<{ category: QuestionCategory }>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCategory: (id: string, name: string) => apiRequest<{ category: QuestionCategory }>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  moveCategoryQuestions: (sourceId: string, targetCategoryId: string) => apiRequest<{ moved: number; source: QuestionCategory; target: QuestionCategory }>(`/api/categories/${sourceId}/move-questions`, { method: 'POST', body: JSON.stringify({ targetCategoryId }) }),
  deleteCategory: (id: string) => apiRequest<void>(`/api/categories/${id}`, { method: 'DELETE' }),
  create: (questions: QuestionDraft[]) => apiRequest<{ questions: Question[] }>('/api/questions', { method: 'POST', body: JSON.stringify({ questions }) }),
  update: (id: string, patch: Partial<Question>) => apiRequest<{ question: Question }>(`/api/questions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  replaceGeneratedContent: (updates: Array<Pick<Question, 'id' | 'importance' | 'answer' | 'explanation' | 'interviewAnswer' | 'followUps'>>) => apiRequest<{ questions: Question[] }>('/api/questions/generated-content', { method: 'PATCH', body: JSON.stringify({ updates }) }),
  remove: (id: string) => apiRequest<void>(`/api/questions/${id}`, { method: 'DELETE' }),
}
