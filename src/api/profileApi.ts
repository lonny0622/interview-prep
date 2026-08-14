import type { JobProfile, ResumeProfile, UserProfile } from '../types/profile'
import { apiRequest } from './http'

export const profileApi = {
  extractResume: (payload: { fileName: string; mimeType: string; fileBase64: string }) => apiRequest<{ text?: string }>('/api/resume/extract', { method: 'POST', body: JSON.stringify(payload) }),
  get: () => apiRequest<{ profile: UserProfile }>('/api/profile'),
  update: (profile: UserProfile) => apiRequest<{ profile: UserProfile }>('/api/profile', { method: 'PATCH', body: JSON.stringify(profile) }),
  listJobs: () => apiRequest<{ jobs: JobProfile[] }>('/api/profile/jobs'),
  createJob: (title: string) => apiRequest<{ job: JobProfile }>('/api/profile/jobs', { method: 'POST', body: JSON.stringify({ title }) }),
  updateJob: (id: string, patch: Partial<Pick<JobProfile, 'title' | 'isDefault'>>) => apiRequest<{ job: JobProfile }>(`/api/profile/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteJob: (id: string) => apiRequest<void>(`/api/profile/jobs/${id}`, { method: 'DELETE' }),
  createResume: (jobId: string, resume: Pick<ResumeProfile, 'fileName' | 'text'>) => apiRequest<{ resume: ResumeProfile }>(`/api/profile/jobs/${jobId}/resumes`, { method: 'POST', body: JSON.stringify(resume) }),
  updateResume: (id: string, patch: Partial<Pick<ResumeProfile, 'fileName' | 'text' | 'isDefault'>>) => apiRequest<{ resume: ResumeProfile }>(`/api/profile/resumes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteResume: (id: string) => apiRequest<void>(`/api/profile/resumes/${id}`, { method: 'DELETE' }),
}
