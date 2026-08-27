import { database } from './connection.js'

database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;')

const version = Number((database.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version || 0)

/** Every migration is idempotent and committed before repositories prepare statements. */
if (version < 1) database.exec(`
  BEGIN IMMEDIATE;
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
  CREATE TABLE IF NOT EXISTS learning_progress (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    session_id TEXT,
    mastery TEXT NOT NULL CHECK (mastery IN ('未学习', '了解', '熟悉', '掌握')),
    learned_at TEXT NOT NULL
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
  PRAGMA user_version = 1;
  COMMIT;
`)

if (version < 2) database.exec(`
  BEGIN IMMEDIATE;
  CREATE TABLE IF NOT EXISTS auth_login_attempts (
    key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    window_started_at INTEGER NOT NULL,
    blocked_until INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_active_session (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    session_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  PRAGMA user_version = 2;
  COMMIT;
`)

if (version < 3) database.exec(`
  BEGIN IMMEDIATE;
  CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_learning_progress_question ON learning_progress(question_id, learned_at);
  CREATE INDEX IF NOT EXISTS idx_interview_turns_session ON interview_turns(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_resumes_job ON resumes(job_profile_id, created_at);
  PRAGMA user_version = 3;
  COMMIT;
`)

if (version < 4) database.exec(`
  BEGIN IMMEDIATE;
  CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO auth_sessions (session_id, expires_at, updated_at)
    SELECT session_id, expires_at, updated_at FROM auth_active_session;
  DROP TABLE auth_active_session;
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
  PRAGMA user_version = 4;
  COMMIT;
`)
