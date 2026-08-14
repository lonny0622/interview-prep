import { apiRequest } from './http'

export type QuestionRecord = {
  id: string
  title: string
  category: string
  difficulty: '简单' | '中等' | '困难'
  importance: number
  mastery: '未学习' | '了解' | '熟悉' | '掌握'
  answer: string
  explanation: string
  interviewAnswer: string
  followUps: string[]
}

export type CategoryRecord = { id: string; name: string; sortOrder: number; questionCount: number }

export const questionApi = {
  list: (filters: Record<string, string> = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    return apiRequest<{ questions: QuestionRecord[] }>(`/api/questions${query.size ? `?${query}` : ''}`)
  },
  categories: () => apiRequest<{ categories: CategoryRecord[] }>('/api/categories'),
  createCategory: (name: string) => apiRequest<{ category: CategoryRecord }>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCategory: (id: string, name: string) => apiRequest<{ category: CategoryRecord }>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCategory: (id: string) => apiRequest<void>(`/api/categories/${id}`, { method: 'DELETE' }),
  create: (questions: Array<Omit<QuestionRecord, 'id' | 'mastery'>>) => apiRequest<{ questions: QuestionRecord[] }>('/api/questions', { method: 'POST', body: JSON.stringify({ questions }) }),
  update: (id: string, patch: Partial<QuestionRecord>) => apiRequest<{ question: QuestionRecord }>(`/api/questions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => apiRequest<void>(`/api/questions/${id}`, { method: 'DELETE' }),
}
