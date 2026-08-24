import '../schema.js'
import { database } from '../connection.js'
import type { CreateResumeInput, JobProfile, JobProfilePatch, ResumePatch, ResumeProfile, StructuredProfile, UserProfile, UserProfilePatch } from '../../domain/profile.js'

type ResumeRow = {
  id: string
  job_profile_id: string
  file_name: string
  text: string
  candidate_profile_json: string
  parsed_at: string | null
  is_default: number
  created_at: string
  updated_at: string
}

type JobProfileRow = {
  id: string
  title: string
  sort_order: number
  is_default: number
  created_at: string
  updated_at: string
}

type UserProfileRow = {
  id: number
  name: string
  headline: string
  years_experience: number
  target_roles: string
  resume_text: string
  resume_file_name: string
  resumes_json: string
  candidate_profile_json: string
  parsed_at: string | null
  created_at: string
  updated_at: string
}

type StoredResume = Omit<ResumeProfile, 'role'>
type StoredUserProfile = Omit<UserProfile, 'jobs'>

const now = () => new Date().toISOString()
const parseJson = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value || '')) as T } catch { return fallback }
}

const toResume = (row: ResumeRow): StoredResume => ({
  id: row.id,
  jobProfileId: row.job_profile_id,
  fileName: row.file_name,
  text: row.text,
  candidateProfile: parseJson<StructuredProfile | null>(row.candidate_profile_json, null),
  parsedAt: row.parsed_at || null,
  isDefault: Boolean(row.is_default),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toJobProfile = (row: JobProfileRow): JobProfile => ({ id: row.id, title: row.title, sortOrder: row.sort_order, isDefault: Boolean(row.is_default), resumes: [] })

const toProfile = (row: UserProfileRow | undefined): StoredUserProfile | null => row ? ({
  id: row.id,
  name: row.name,
  headline: row.headline,
  yearsExperience: row.years_experience,
  targetRoles: parseJson<string[]>(row.target_roles, []),
  resumeText: row.resume_text,
  resumeFileName: row.resume_file_name,
  resumes: parseJson<ResumeProfile[]>(row.resumes_json, []),
  candidateProfile: parseJson<StructuredProfile | null>(row.candidate_profile_json, null),
  parsedAt: row.parsed_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null

export function listJobProfiles(): JobProfile[] {
  const jobs = (database.prepare('SELECT * FROM job_profiles WHERE profile_id = 1 ORDER BY sort_order ASC, created_at ASC').all() as JobProfileRow[]).map(toJobProfile)
  const resumes = (database.prepare('SELECT * FROM resumes WHERE job_profile_id IN (SELECT id FROM job_profiles WHERE profile_id = 1) ORDER BY created_at ASC').all() as ResumeRow[]).map(toResume)
  return jobs.map((job) => ({ ...job, resumes: resumes.filter((resume) => resume.jobProfileId === job.id).map((resume) => ({ ...resume, role: job.title })) }))
}

export function getProfile(): UserProfile {
  const row = database.prepare('SELECT * FROM user_profile WHERE id = 1').get() as UserProfileRow | undefined
  const profile = toProfile(row) || {
    id: 1, name: '', headline: '', yearsExperience: 0, targetRoles: [], resumeText: '', resumeFileName: '', resumes: [], candidateProfile: null, parsedAt: null, createdAt: '', updatedAt: '',
  }
  return { ...profile, jobs: listJobProfiles() }
}

export function createJobProfile(title: unknown): JobProfile | null {
  const timestamp = now()
  const id = crypto.randomUUID()
  const countRow = database.prepare('SELECT COUNT(*) AS count FROM job_profiles WHERE profile_id = 1').get() as { count?: number } | undefined
  const sortRow = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM job_profiles WHERE profile_id = 1').get() as { next?: number } | undefined
  const hasJobs = Number(countRow?.count ?? 0) > 0
  const sortOrder = Number(sortRow?.next ?? 0)
  database.prepare('INSERT INTO job_profiles (id, profile_id, title, sort_order, is_default, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?)').run(id, String(title || '').trim(), sortOrder, hasJobs ? 0 : 1, timestamp, timestamp)
  return listJobProfiles().find((job) => job.id === id) ?? null
}

export function updateJobProfile(id: string, patch: JobProfilePatch): JobProfile | null {
  const current = database.prepare('SELECT * FROM job_profiles WHERE id = ? AND profile_id = 1').get(id) as JobProfileRow | undefined
  if (!current) return null
  const title = String(patch.title ?? current.title).trim()
  database.prepare('UPDATE job_profiles SET title = ?, updated_at = ? WHERE id = ?').run(title, now(), id)
  if (patch.isDefault) database.prepare('UPDATE job_profiles SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE profile_id = 1').run(id)
  return listJobProfiles().find((job) => job.id === id) ?? null
}

export function deleteJobProfile(id: string) {
  const current = database.prepare('SELECT * FROM job_profiles WHERE id = ? AND profile_id = 1').get(id) as JobProfileRow | undefined
  if (!current) return false
  database.prepare('DELETE FROM job_profiles WHERE id = ?').run(id)
  const remaining = listJobProfiles()
  if (current.is_default && remaining[0]) database.prepare('UPDATE job_profiles SET is_default = 1 WHERE id = ?').run(remaining[0].id)
  return true
}

export function createResume(jobProfileId: string, data: CreateResumeInput): ResumeProfile | null {
  const job = database.prepare('SELECT id FROM job_profiles WHERE id = ? AND profile_id = 1').get(jobProfileId)
  if (!job) return null
  const timestamp = now()
  const id = crypto.randomUUID()
  const hasResume = database.prepare('SELECT 1 FROM resumes WHERE job_profile_id = ? LIMIT 1').get(jobProfileId)
  database.prepare('INSERT INTO resumes (id, job_profile_id, file_name, text, candidate_profile_json, parsed_at, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, jobProfileId, String(data.fileName || ''), String(data.text || ''), JSON.stringify(data.candidateProfile ?? null), data.parsedAt || null, hasResume ? 0 : 1, timestamp, timestamp)
  return listJobProfiles().flatMap((item) => item.resumes).find((resume) => resume.id === id) ?? null
}

export function updateResume(id: string, patch: ResumePatch): ResumeProfile | null {
  const current = database.prepare('SELECT * FROM resumes WHERE id = ?').get(id) as ResumeRow | undefined
  if (!current) return null
  database.prepare('UPDATE resumes SET file_name = ?, text = ?, candidate_profile_json = ?, parsed_at = ?, updated_at = ? WHERE id = ?').run(String(patch.fileName ?? current.file_name), String(patch.text ?? current.text), JSON.stringify(patch.candidateProfile ?? parseJson(current.candidate_profile_json, {})), patch.parsedAt ?? current.parsed_at, now(), id)
  if (patch.isDefault) database.prepare('UPDATE resumes SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE job_profile_id = ?').run(id, current.job_profile_id)
  return listJobProfiles().flatMap((item) => item.resumes).find((resume) => resume.id === id) ?? null
}

export function deleteResume(id: string) {
  const current = database.prepare('SELECT * FROM resumes WHERE id = ?').get(id) as ResumeRow | undefined
  if (!current) return false
  database.prepare('DELETE FROM resumes WHERE id = ?').run(id)
  if (current.is_default) {
    const replacement = database.prepare('SELECT id FROM resumes WHERE job_profile_id = ? ORDER BY created_at ASC LIMIT 1').get(current.job_profile_id) as { id: string } | undefined
    if (replacement) database.prepare('UPDATE resumes SET is_default = 1 WHERE id = ?').run(replacement.id)
  }
  return true
}

export function updateProfile(patch: UserProfilePatch): UserProfile {
  const current = getProfile()
  const targetRoles = Array.isArray(patch.targetRoles) ? patch.targetRoles.map(String).map((item: string) => item.trim()).filter(Boolean).slice(0, 10) : current.targetRoles
  const timestamp = now()
  const candidateProfile = patch.candidateProfile !== undefined ? patch.candidateProfile : current.candidateProfile
  const parsedAt = patch.parsedAt !== undefined ? patch.parsedAt : current.parsedAt
  const resumes = Array.isArray(patch.resumes) ? patch.resumes.slice(0, 20).map((item) => ({ ...item, id: String(item.id || crypto.randomUUID()), jobProfileId: String(item.jobProfileId || ''), role: String(item.role || '通用').trim(), fileName: String(item.fileName || '').trim(), text: String(item.text || ''), candidateProfile: item.candidateProfile || null, parsedAt: item.parsedAt || null, isDefault: Boolean(item.isDefault), createdAt: item.createdAt || timestamp, updatedAt: timestamp })).filter((item) => item.text) : current.resumes
  database.prepare(`INSERT INTO user_profile (id, name, headline, years_experience, target_roles, resume_text, resume_file_name, resumes_json, candidate_profile_json, parsed_at, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, headline = excluded.headline, years_experience = excluded.years_experience, target_roles = excluded.target_roles, resume_text = excluded.resume_text, resume_file_name = excluded.resume_file_name, resumes_json = excluded.resumes_json, candidate_profile_json = excluded.candidate_profile_json, parsed_at = excluded.parsed_at, updated_at = excluded.updated_at`).run(String(patch.name ?? current.name).trim(), String(patch.headline ?? current.headline).trim(), Math.max(0, Number(patch.yearsExperience ?? current.yearsExperience) || 0), JSON.stringify(targetRoles), String((patch.resumeText ?? current.resumeText) || ''), String((patch.resumeFileName ?? current.resumeFileName) || ''), JSON.stringify(resumes), JSON.stringify(candidateProfile || {}), parsedAt || null, current.createdAt || timestamp, timestamp)
  return getProfile()
}
