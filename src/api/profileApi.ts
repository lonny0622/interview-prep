import type { JobProfile, ResumeProfile, UserProfile } from '../types/profile'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || '请求失败。')
  return payload as T
}

export const profileApi = {
  get: () => request<{ profile: UserProfile }>('/api/profile'),
  update: (profile: UserProfile) => request<{ profile: UserProfile }>('/api/profile', { method: 'PATCH', body: JSON.stringify(profile) }),
  listJobs: () => request<{ jobs: JobProfile[] }>('/api/profile/jobs'),
  createJob: (title: string) => request<{ job: JobProfile }>('/api/profile/jobs', { method: 'POST', body: JSON.stringify({ title }) }),
  updateJob: (id: string, patch: Partial<Pick<JobProfile, 'title' | 'isDefault'>>) => request<{ job: JobProfile }>(`/api/profile/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteJob: (id: string) => request<void>(`/api/profile/jobs/${id}`, { method: 'DELETE' }),
  createResume: (jobId: string, resume: Pick<ResumeProfile, 'fileName' | 'text'>) => request<{ resume: ResumeProfile }>(`/api/profile/jobs/${jobId}/resumes`, { method: 'POST', body: JSON.stringify(resume) }),
  updateResume: (id: string, patch: Partial<Pick<ResumeProfile, 'fileName' | 'text' | 'isDefault'>>) => request<{ resume: ResumeProfile }>(`/api/profile/resumes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteResume: (id: string) => request<void>(`/api/profile/resumes/${id}`, { method: 'DELETE' }),
}
