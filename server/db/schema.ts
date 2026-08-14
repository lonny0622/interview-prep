import { database } from './connection.js'

/** 开发阶段使用全新 schema，不再包含旧版本数据迁移分支。 */
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
`)
