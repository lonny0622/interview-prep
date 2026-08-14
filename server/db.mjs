import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const dataPath = resolve(process.env.INTERVIEWPREP_DATA_DIR || resolve(dirname(new URL(import.meta.url).pathname), '..', 'data'), 'interviewprep.sqlite')
mkdirSync(dirname(dataPath), { recursive: true })
const database = new DatabaseSync(dataPath)
database.exec('PRAGMA foreign_keys = ON;')

database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('简单', '中等', '困难')),
    importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
    mastery TEXT NOT NULL DEFAULT '未学习' CHECK (mastery IN ('未学习', '了解', '熟悉', '掌握')),
    answer TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    interview_answer TEXT NOT NULL DEFAULT '',
    follow_ups TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS question_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS learning_sessions (
    id TEXT PRIMARY KEY,
    question_ids TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY,
    question_ids TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    filters TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS practice_answers (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    score_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS interview_sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
    stage TEXT NOT NULL DEFAULT 'self_introduction',
    profile TEXT NOT NULL DEFAULT '{}',
    blueprint TEXT NOT NULL DEFAULT '[]',
    current_index INTEGER NOT NULL DEFAULT 0,
    report_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS interview_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    question TEXT NOT NULL,
    answer_text TEXT NOT NULL DEFAULT '',
    score_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    headline TEXT NOT NULL DEFAULT '',
    years_experience REAL NOT NULL DEFAULT 0,
    target_roles TEXT NOT NULL DEFAULT '[]',
    resume_text TEXT NOT NULL DEFAULT '',
    resume_file_name TEXT NOT NULL DEFAULT '',
    resumes_json TEXT NOT NULL DEFAULT '[]',
    candidate_profile_json TEXT NOT NULL DEFAULT '{}',
    parsed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS job_profiles (
    id TEXT PRIMARY KEY,
    profile_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS resumes (
    id TEXT PRIMARY KEY,
    job_profile_id TEXT NOT NULL REFERENCES job_profiles(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    candidate_profile_json TEXT NOT NULL DEFAULT '{}',
    parsed_at TEXT,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profile_migrations (
    key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`)

// Keep existing single-user databases forward compatible with the structured profile fields.
for (const statement of [
  "ALTER TABLE user_profile ADD COLUMN candidate_profile_json TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE user_profile ADD COLUMN parsed_at TEXT",
  "ALTER TABLE user_profile ADD COLUMN resumes_json TEXT NOT NULL DEFAULT '[]'",
]) {
  try { database.exec(statement) } catch (error) { if (!String(error.message).includes('duplicate column')) throw error }
}

const now = () => new Date().toISOString()
const parseJson = (value, fallback) => { try { return JSON.parse(value || '') } catch { return fallback } }
const normalizeCategoryName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
const toCategory = (row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order, questionCount: Number(row.question_count || 0), createdAt: row.created_at, updatedAt: row.updated_at })
const toResume = (row) => ({ id: row.id, jobProfileId: row.job_profile_id, fileName: row.file_name, text: row.text, candidateProfile: parseJson(row.candidate_profile_json, null), parsedAt: row.parsed_at || null, isDefault: Boolean(row.is_default), createdAt: row.created_at, updatedAt: row.updated_at })
const toJobProfile = (row) => ({ id: row.id, title: row.title, sortOrder: row.sort_order, isDefault: Boolean(row.is_default), resumes: [] })
const toProfile = (row) => {
  if (!row) return null
  const legacyResume = row.resume_text ? [{ id: 'legacy-default', role: parseJson(row.target_roles, [])[0] || '通用', fileName: row.resume_file_name || '个人简历', text: row.resume_text, candidateProfile: parseJson(row.candidate_profile_json, null), parsedAt: row.parsed_at || null }] : []
  return { id: row.id, name: row.name, headline: row.headline, yearsExperience: row.years_experience, targetRoles: parseJson(row.target_roles, []), resumeText: row.resume_text, resumeFileName: row.resume_file_name, resumes: parseJson(row.resumes_json, []).length ? parseJson(row.resumes_json, []) : legacyResume, candidateProfile: parseJson(row.candidate_profile_json, null), parsedAt: row.parsed_at || null, createdAt: row.created_at, updatedAt: row.updated_at }
}
const toQuestion = (row) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  difficulty: row.difficulty,
  importance: row.importance,
  mastery: row.mastery,
  answer: row.answer,
  explanation: row.explanation,
  interviewAnswer: row.interview_answer,
  followUps: JSON.parse(row.follow_ups || '[]'),
})

const insertQuestion = database.prepare(`INSERT INTO questions (id, title, category, difficulty, importance, mastery, answer, explanation, interview_answer, follow_ups, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const updateQuestion = database.prepare(`UPDATE questions SET title = ?, category = ?, difficulty = ?, importance = ?, mastery = ?, answer = ?, explanation = ?, interview_answer = ?, follow_ups = ?, updated_at = ? WHERE id = ?`)
const findCategoryByName = database.prepare('SELECT * FROM question_categories WHERE name = ? COLLATE NOCASE')
const findCategoryById = database.prepare('SELECT * FROM question_categories WHERE id = ?')
const insertCategory = database.prepare('INSERT INTO question_categories (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')

function ensureCategory(name) {
  const normalized = normalizeCategoryName(name) || '未分类'
  const existing = findCategoryByName.get(normalized)
  if (existing) return existing
  const timestamp = now()
  const sortOrder = database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM question_categories').get().next
  const id = crypto.randomUUID()
  insertCategory.run(id, normalized, sortOrder, timestamp, timestamp)
  return findCategoryById.get(id)
}

// Backfill categories for databases created before category management existed.
for (const row of database.prepare("SELECT DISTINCT TRIM(category) AS name FROM questions WHERE TRIM(category) <> ''").all()) ensureCategory(row.name)

export function listCategories() {
  return database.prepare(`SELECT c.*, COUNT(q.id) AS question_count
    FROM question_categories c
    LEFT JOIN questions q ON q.category = c.name COLLATE NOCASE
    GROUP BY c.id
    ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`).all().map(toCategory)
}

export function createCategory(name) {
  const normalized = normalizeCategoryName(name)
  if (!normalized) throw new Error('分类名称不能为空。')
  if (findCategoryByName.get(normalized)) { const error = new Error('分类已存在。'); error.code = 'CATEGORY_EXISTS'; throw error }
  const category = ensureCategory(normalized)
  return toCategory({ ...category, question_count: 0 })
}

export function updateCategory(id, name) {
  const current = findCategoryById.get(id)
  if (!current) return null
  const normalized = normalizeCategoryName(name)
  if (!normalized) throw new Error('分类名称不能为空。')
  const duplicate = findCategoryByName.get(normalized)
  if (duplicate && duplicate.id !== id) { const error = new Error('分类已存在。'); error.code = 'CATEGORY_EXISTS'; throw error }
  if (normalized === current.name) return listCategories().find((item) => item.id === id)
  const timestamp = now()
  database.exec('BEGIN')
  try {
    database.prepare('UPDATE question_categories SET name = ?, updated_at = ? WHERE id = ?').run(normalized, timestamp, id)
    database.prepare('UPDATE questions SET category = ?, updated_at = ? WHERE category = ? COLLATE NOCASE').run(normalized, timestamp, current.name)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  return listCategories().find((item) => item.id === id)
}

export function deleteCategory(id) {
  const current = findCategoryById.get(id)
  if (!current) return false
  const count = database.prepare('SELECT COUNT(*) AS count FROM questions WHERE category = ? COLLATE NOCASE').get(current.name).count
  if (count > 0) { const error = new Error(`分类下还有 ${count} 道题目，不能删除。`); error.code = 'CATEGORY_IN_USE'; throw error }
  return database.prepare('DELETE FROM question_categories WHERE id = ?').run(id).changes > 0
}

export function listQuestions(filters = {}) {
  const clauses = []
  const values = []
  if (filters.q) { clauses.push('(title LIKE ? OR category LIKE ? OR answer LIKE ? OR explanation LIKE ? OR interview_answer LIKE ? OR follow_ups LIKE ?)'); values.push(...Array(6).fill(`%${filters.q}%`)) }
  if (filters.category && filters.category !== '全部分类') { clauses.push('category = ?'); values.push(filters.category) }
  if (filters.difficulty && filters.difficulty !== '全部难度') { clauses.push('difficulty = ?'); values.push(filters.difficulty) }
  if (filters.mastery && filters.mastery !== '全部掌握度') { clauses.push('mastery = ?'); values.push(filters.mastery) }
  const query = `SELECT * FROM questions ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY CASE mastery WHEN '未学习' THEN 0 WHEN '了解' THEN 1 WHEN '熟悉' THEN 2 ELSE 3 END, importance DESC, updated_at DESC`
  return database.prepare(query).all(...values).map(toQuestion)
}

export function getProfile() {
  const profile = toProfile(database.prepare('SELECT * FROM user_profile WHERE id = 1').get()) || { id: 1, name: '', headline: '', yearsExperience: 0, targetRoles: [], resumeText: '', resumeFileName: '', resumes: [], candidateProfile: null, parsedAt: null }
  return { ...profile, jobs: listJobProfiles() }
}

export function listJobProfiles() {
  const jobs = database.prepare('SELECT * FROM job_profiles WHERE profile_id = 1 ORDER BY sort_order ASC, created_at ASC').all().map(toJobProfile)
  const resumes = database.prepare('SELECT * FROM resumes WHERE job_profile_id IN (SELECT id FROM job_profiles WHERE profile_id = 1) ORDER BY created_at ASC').all().map(toResume)
  return jobs.map((job) => ({ ...job, resumes: resumes.filter((resume) => resume.jobProfileId === job.id).map((resume) => ({ ...resume, role: job.title })) }))
}

export function createJobProfile(title) {
  const timestamp = now()
  const id = crypto.randomUUID()
  const hasJobs = database.prepare('SELECT COUNT(*) AS count FROM job_profiles WHERE profile_id = 1').get().count > 0
  database.prepare('INSERT INTO job_profiles (id, profile_id, title, sort_order, is_default, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?)').run(id, String(title || '').trim(), database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM job_profiles WHERE profile_id = 1').get().next, hasJobs ? 0 : 1, timestamp, timestamp)
  return listJobProfiles().find((job) => job.id === id)
}

export function updateJobProfile(id, patch) {
  const current = database.prepare('SELECT * FROM job_profiles WHERE id = ? AND profile_id = 1').get(id)
  if (!current) return null
  const title = String(patch.title ?? current.title).trim()
  database.prepare('UPDATE job_profiles SET title = ?, updated_at = ? WHERE id = ?').run(title, now(), id)
  if (patch.isDefault) database.prepare('UPDATE job_profiles SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE profile_id = 1').run(id)
  return listJobProfiles().find((job) => job.id === id)
}

export function deleteJobProfile(id) {
  const current = database.prepare('SELECT * FROM job_profiles WHERE id = ? AND profile_id = 1').get(id)
  if (!current) return false
  database.prepare('DELETE FROM job_profiles WHERE id = ?').run(id)
  const remaining = listJobProfiles()
  if (current.is_default && remaining[0]) database.prepare('UPDATE job_profiles SET is_default = 1 WHERE id = ?').run(remaining[0].id)
  return true
}

export function createResume(jobProfileId, data) {
  const job = database.prepare('SELECT id FROM job_profiles WHERE id = ? AND profile_id = 1').get(jobProfileId)
  if (!job) return null
  const timestamp = now(); const id = crypto.randomUUID()
  const hasResume = database.prepare('SELECT 1 FROM resumes WHERE job_profile_id = ? LIMIT 1').get(jobProfileId)
  database.prepare('INSERT INTO resumes (id, job_profile_id, file_name, text, candidate_profile_json, parsed_at, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, jobProfileId, String(data.fileName || ''), String(data.text || ''), JSON.stringify(data.candidateProfile || {}), data.parsedAt || null, hasResume ? 0 : 1, timestamp, timestamp)
  return listJobProfiles().flatMap((item) => item.resumes).find((resume) => resume.id === id)
}

export function updateResume(id, patch) {
  const current = database.prepare('SELECT * FROM resumes WHERE id = ?').get(id)
  if (!current) return null
  database.prepare('UPDATE resumes SET file_name = ?, text = ?, candidate_profile_json = ?, parsed_at = ?, updated_at = ? WHERE id = ?').run(String(patch.fileName ?? current.file_name), String(patch.text ?? current.text), JSON.stringify(patch.candidateProfile ?? parseJson(current.candidate_profile_json, {})), patch.parsedAt ?? current.parsed_at, now(), id)
  if (patch.isDefault) database.prepare('UPDATE resumes SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE job_profile_id = ?').run(id, current.job_profile_id)
  return listJobProfiles().flatMap((item) => item.resumes).find((resume) => resume.id === id)
}

export function deleteResume(id) {
  const current = database.prepare('SELECT * FROM resumes WHERE id = ?').get(id)
  if (!current) return false
  database.prepare('DELETE FROM resumes WHERE id = ?').run(id)
  if (current.is_default) { const replacement = database.prepare('SELECT id FROM resumes WHERE job_profile_id = ? ORDER BY created_at ASC LIMIT 1').get(current.job_profile_id); if (replacement) database.prepare('UPDATE resumes SET is_default = 1 WHERE id = ?').run(replacement.id) }
  return true
}

function migrateLegacyJobProfiles() {
  if (database.prepare('SELECT COUNT(*) AS count FROM job_profiles').get().count > 0) return
  const profile = toProfile(database.prepare('SELECT * FROM user_profile WHERE id = 1').get())
  if (!profile) return
  const roles = profile.targetRoles.length ? profile.targetRoles : (profile.resumeText ? ['通用'] : [])
  const legacyResumes = profile.resumes || []
  const usedResumeIds = new Set()
  const roleResume = new Map()
  for (const resume of legacyResumes) {
    const role = String(resume.role || '').trim()
    if (role && !roleResume.has(role)) roleResume.set(role, resume)
  }
  const hasRoleSpecificResume = roles.some((title) => roleResume.has(title))
  for (const [index, title] of roles.entries()) {
    const job = createJobProfile(title)
    let resume = roleResume.get(title)
    if (!resume && !hasRoleSpecificResume && index === 0 && profile.resumeText) resume = { fileName: profile.resumeFileName, text: profile.resumeText, candidateProfile: profile.candidateProfile, parsedAt: profile.parsedAt }
    if (resume?.id) {
      if (usedResumeIds.has(resume.id)) resume = null
      else usedResumeIds.add(resume.id)
    }
    if (job && resume?.text) createResume(job.id, resume)
  }
}

migrateLegacyJobProfiles()

// Repair the only ambiguous legacy case we can prove: identical file/content copied
// to several jobs while the legacy record names the intended role.
function repairLegacyResumeDuplicates() {
  if (database.prepare('SELECT 1 FROM profile_migrations WHERE key = ?').get('legacy_resume_dedup')) return
  const profile = toProfile(database.prepare('SELECT * FROM user_profile WHERE id = 1').get())
  const roleByFingerprint = new Map()
  for (const resume of profile?.resumes || []) {
    if (!resume.role || !resume.text) continue
    const fingerprint = `${resume.fileName}\n${resume.text}`
    if (!roleByFingerprint.has(fingerprint)) roleByFingerprint.set(fingerprint, resume.role)
  }
  const rows = database.prepare(`SELECT resumes.id, resumes.file_name, resumes.text, job_profiles.title
    FROM resumes JOIN job_profiles ON job_profiles.id = resumes.job_profile_id
    WHERE job_profiles.profile_id = 1 ORDER BY resumes.created_at ASC`).all()
  const groups = new Map()
  for (const row of rows) {
    const fingerprint = `${row.file_name}\n${row.text}`
    if (!groups.has(fingerprint)) groups.set(fingerprint, [])
    groups.get(fingerprint).push(row)
  }
  for (const [fingerprint, group] of groups) {
    if (group.length < 2 || !roleByFingerprint.has(fingerprint)) continue
    const intendedRole = roleByFingerprint.get(fingerprint)
    const preferred = group.find((row) => row.title === intendedRole)
    if (!preferred) continue
    for (const duplicate of group) if (duplicate.id !== preferred.id) database.prepare('DELETE FROM resumes WHERE id = ?').run(duplicate.id)
  }
  database.prepare('INSERT OR IGNORE INTO profile_migrations (key, applied_at) VALUES (?, ?)').run('legacy_resume_dedup', now())
}

repairLegacyResumeDuplicates()

export function updateProfile(patch) {
  const current = getProfile()
  const next = { ...current, ...patch, id: 1, targetRoles: Array.isArray(patch.targetRoles) ? patch.targetRoles.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 10) : current.targetRoles }
  const timestamp = now()
  const candidateProfile = patch.candidateProfile !== undefined ? patch.candidateProfile : current.candidateProfile
  const parsedAt = patch.parsedAt !== undefined ? patch.parsedAt : current.parsedAt
  const resumes = Array.isArray(patch.resumes) ? patch.resumes.slice(0, 20).map((item) => ({ id: String(item.id || crypto.randomUUID()), role: String(item.role || '通用').trim(), fileName: String(item.fileName || '').trim(), text: String(item.text || ''), candidateProfile: item.candidateProfile || null, parsedAt: item.parsedAt || null })).filter((item) => item.text) : (current.resumes || [])
  database.prepare(`INSERT INTO user_profile (id, name, headline, years_experience, target_roles, resume_text, resume_file_name, resumes_json, candidate_profile_json, parsed_at, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, headline = excluded.headline, years_experience = excluded.years_experience, target_roles = excluded.target_roles, resume_text = excluded.resume_text, resume_file_name = excluded.resume_file_name, resumes_json = excluded.resumes_json, candidate_profile_json = excluded.candidate_profile_json, parsed_at = excluded.parsed_at, updated_at = excluded.updated_at`).run(String(next.name || '').trim(), String(next.headline || '').trim(), Math.max(0, Number(next.yearsExperience) || 0), JSON.stringify(next.targetRoles), String(next.resumeText || ''), String(next.resumeFileName || ''), JSON.stringify(resumes), JSON.stringify(candidateProfile || {}), parsedAt || null, current.createdAt || timestamp, timestamp)
  return getProfile()
}

export function getQuestion(id) {
  const row = database.prepare('SELECT * FROM questions WHERE id = ?').get(id)
  return row ? toQuestion(row) : null
}

export function createQuestions(drafts) {
  const timestamp = now()
  const created = []
  for (const draft of drafts) ensureCategory(draft.category)
  database.exec('BEGIN')
  try {
    for (const draft of drafts) {
      const question = { id: crypto.randomUUID(), mastery: '未学习', ...draft, category: normalizeCategoryName(draft.category) || '未分类' }
      insertQuestion.run(question.id, question.title, question.category, question.difficulty, question.importance, question.mastery, question.answer, question.explanation, question.interviewAnswer, JSON.stringify(question.followUps), timestamp, timestamp)
      created.push(question)
    }
    database.exec('COMMIT')
    return created
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function editQuestion(id, patch) {
  const current = getQuestion(id)
  if (!current) return null
  const next = { ...current, ...patch, id, category: normalizeCategoryName(patch.category ?? current.category) || '未分类' }
  ensureCategory(next.category)
  updateQuestion.run(next.title, next.category, next.difficulty, next.importance, next.mastery, next.answer, next.explanation, next.interviewAnswer, JSON.stringify(next.followUps), now(), id)
  return getQuestion(id)
}

export function removeQuestion(id) {
  return database.prepare('DELETE FROM questions WHERE id = ?').run(id).changes > 0
}

export function createLearningSession(questionIds) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO learning_sessions (id, question_ids, current_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, JSON.stringify(questionIds), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, createdAt: timestamp }
}

export function createPracticeSession(questionIds, filters = {}) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO practice_sessions (id, question_ids, current_index, filters, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)').run(id, JSON.stringify(questionIds), JSON.stringify(filters), timestamp, timestamp)
  return { id, questionIds, currentIndex: 0, filters, createdAt: timestamp }
}

export function savePracticeAnswer(sessionId, questionId, answerText, score) {
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO practice_answers (id, session_id, question_id, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, sessionId, questionId, answerText, score ? JSON.stringify(score) : null, now())
  return { id, sessionId, questionId, answerText, score: score || null }
}

const toInterview = (row) => row ? ({
  id: row.id,
  status: row.status,
  stage: row.stage,
  profile: JSON.parse(row.profile || '{}'),
  blueprint: JSON.parse(row.blueprint || '[]'),
  currentIndex: row.current_index,
  report: row.report_json ? JSON.parse(row.report_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null

export function createInterviewSession(profile, blueprint) {
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO interview_sessions (id, status, stage, profile, blueprint, current_index, created_at, updated_at) VALUES (?, \'active\', ?, ?, ?, 0, ?, ?)').run(id, blueprint[0]?.stage || 'self_introduction', JSON.stringify(profile), JSON.stringify(blueprint), timestamp, timestamp)
  return getInterviewSession(id)
}

export function getInterviewSession(id) {
  return toInterview(database.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id))
}

export function listInterviewSessions() {
  return database.prepare('SELECT * FROM interview_sessions ORDER BY updated_at DESC LIMIT 20').all().map(toInterview)
}

export function saveInterviewTurn(sessionId, turn, score) {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO interview_turns (id, session_id, stage, question, answer_text, score_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, sessionId, turn.stage, turn.question, turn.answerText || '', score ? JSON.stringify(score) : null, now())
  const nextIndex = Math.min(session.currentIndex + 1, Math.max(0, session.blueprint.length - 1))
  const nextStage = session.blueprint[nextIndex]?.stage || 'candidate_questions'
  database.prepare('UPDATE interview_sessions SET current_index = ?, stage = ?, updated_at = ? WHERE id = ?').run(nextIndex, nextStage, now(), sessionId)
  return { id, sessionId, stage: turn.stage, question: turn.question, answerText: turn.answerText || '', score: score || null }
}

export function completeInterviewSession(sessionId, report) {
  database.prepare('UPDATE interview_sessions SET status = \'completed\', report_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(report), now(), sessionId)
  return getInterviewSession(sessionId)
}

export function listInterviewTurns(sessionId) {
  return database.prepare('SELECT * FROM interview_turns WHERE session_id = ? ORDER BY created_at ASC').all(sessionId).map((row) => ({ id: row.id, sessionId: row.session_id, stage: row.stage, question: row.question, answerText: row.answer_text, score: row.score_json ? JSON.parse(row.score_json) : null, createdAt: row.created_at }))
}

export function insertInterviewFollowUp(sessionId, item) {
  const session = getInterviewSession(sessionId)
  if (!session) return null
  const blueprint = [...session.blueprint]
  blueprint.splice(session.currentIndex, 0, item)
  database.prepare('UPDATE interview_sessions SET blueprint = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(blueprint), now(), sessionId)
  return getInterviewSession(sessionId)
}

export function seedQuestionsIfEmpty() {
  if (database.prepare('SELECT COUNT(*) AS count FROM questions').get().count > 0) return
  createQuestions([
    { title: 'React 中为什么需要 key？key 变化时会发生什么？', category: 'React', difficulty: '中等', importance: 5, answer: 'key 用来标识列表中的稳定身份，帮助 React 在协调阶段复用正确的 Fiber。', explanation: 'key 参与 Diff。稳定且唯一的 key 可以让节点在位置变化时保持状态；使用 index 作为 key，在插入、删除或排序时可能造成状态错位。', interviewAnswer: '我会先说明 key 是列表项的身份标识，再结合列表插入和组件状态错位的例子解释为什么不建议随意使用 index。', followUps: ['什么时候 index 可以作为 key？', 'key 变化为什么会导致组件重新挂载？'] },
    { title: '如何定位前端页面的性能瓶颈？', category: '性能优化', difficulty: '困难', importance: 5, answer: '先定义指标和用户感知，再通过 Performance、Network 和 React Profiler 分层定位。', explanation: '不要一开始就改代码。先区分加载、运行时和交互响应问题，建立基线后再验证资源体积、长任务、渲染次数和接口瀑布等假设。', interviewAnswer: '我会按指标、采样、假设、验证四步讲，并给出一个真实项目中从长任务定位到组件拆分的例子。', followUps: ['LCP 和 INP 分别反映什么？', '如何避免优化后引入新的问题？'] },
    { title: '项目中遇到过最棘手的线上问题是什么？', category: '项目题', difficulty: '中等', importance: 4, answer: '用 STAR 结构回答：背景、任务、行动、结果，并明确个人贡献。', explanation: '重点不在于把事故讲得多严重，而在于说明你如何定位问题、如何做取舍，以及最后有没有留下监控或流程改进。', interviewAnswer: '我会控制在两分钟内，先交代影响范围，再讲定位过程和关键决策，最后量化结果和后续改进。', followUps: ['如果重新做一次，你会改变什么？'] },
  ])
}

seedQuestionsIfEmpty()
