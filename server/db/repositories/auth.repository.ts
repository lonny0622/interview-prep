import '../schema.js'
import { database } from '../connection.js'
import type { AttemptBucket, AttemptStore } from '../../auth/rate-limiter.js'

export const authAttemptStore: AttemptStore = {
  get(key) {
    return database.prepare('SELECT attempts, window_started_at, blocked_until FROM auth_login_attempts WHERE key = ?').get(key) as AttemptBucket | undefined
  },
  set(key, bucket, now) {
    database.prepare(`INSERT INTO auth_login_attempts (key, attempts, window_started_at, blocked_until, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at`)
      .run(key, bucket.attempts, bucket.window_started_at, bucket.blocked_until, now)
  },
  delete(key) {
    database.prepare('DELETE FROM auth_login_attempts WHERE key = ?').run(key)
  },
  prune(now, maxAgeMs) {
    database.prepare('DELETE FROM auth_login_attempts WHERE blocked_until <= ? AND updated_at < ?').run(now, now - maxAgeMs)
  },
}

export function setActiveSession(sessionId: string, expiresAt: number, now = Date.now()): void {
  database.prepare(`INSERT INTO auth_active_session (singleton, session_id, expires_at, updated_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET session_id = excluded.session_id, expires_at = excluded.expires_at, updated_at = excluded.updated_at`)
    .run(sessionId, expiresAt, now)
}

export function isActiveSession(sessionId: string, now = Date.now()): boolean {
  const row = database.prepare('SELECT session_id, expires_at FROM auth_active_session WHERE singleton = 1').get() as { session_id?: string; expires_at?: number } | undefined
  if (!row || row.expires_at! <= now) {
    if (row) database.prepare('DELETE FROM auth_active_session WHERE singleton = 1').run()
    return false
  }
  return row.session_id === sessionId
}

export function clearActiveSession(sessionId: string): void {
  database.prepare('DELETE FROM auth_active_session WHERE singleton = 1 AND session_id = ?').run(sessionId)
}
