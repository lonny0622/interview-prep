import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function readEnvFile(): Record<string, string> {
  const filePath = resolve(rootDir, '.env.local')
  if (!existsSync(filePath)) return {}

  return Object.fromEntries(readFileSync(filePath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return []
    const separator = trimmed.indexOf('=')
    if (separator < 1) return []
    return [[trimmed.slice(0, separator), trimmed.slice(separator + 1).replace(/^['"]|['"]$/g, '')]]
  }))
}

const fileEnv = readEnvFile()
const get = (name: string, fallback = '') => process.env[name] || fileEnv[name] || fallback
const isProduction = get('NODE_ENV') === 'production'

function booleanValue(name: string, fallback: boolean): boolean {
  const value = get(name)
  if (!value) return fallback
  return value === 'true' || value === '1'
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(get(name, String(fallback)))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const appConfig = {
  rootDir,
  isProduction,
  host: get('HOST', isProduction ? '0.0.0.0' : '127.0.0.1'),
  provider: get('VITE_LLM_PROVIDER', 'openai-compatible'),
  baseUrl: get('VITE_LLM_BASE_URL').replace(/\/$/, ''),
  model: get('VITE_LLM_MODEL'),
  importModel: get('LLM_IMPORT_MODEL', get('VITE_LLM_MODEL')),
  apiKey: get('LLM_API_KEY'),
  sttProvider: get('STT_PROVIDER'),
  sttBaseUrl: get('STT_BASE_URL').replace(/\/$/, ''),
  sttModel: get('STT_MODEL'),
  sttApiKey: get('STT_API_KEY'),
  ffmpegPath: get('STT_FFMPEG_PATH', 'ffmpeg'),
  port: positiveNumber('PORT', positiveNumber('LLM_GATEWAY_PORT', 8787)),
  requestTimeoutMs: positiveNumber('LLM_REQUEST_TIMEOUT_MS', 90000),
  auth: {
    enabled: booleanValue('AUTH_ENABLED', isProduction),
    username: get('AUTH_USERNAME').trim(),
    passwordHash: get('AUTH_PASSWORD_HASH'),
    sessionSecret: get('SESSION_SECRET'),
    sessionTtlSeconds: positiveNumber('AUTH_SESSION_TTL_SECONDS', 43_200),
    maxAttempts: positiveNumber('AUTH_MAX_ATTEMPTS', 5),
    attemptWindowMs: positiveNumber('AUTH_ATTEMPT_WINDOW_SECONDS', 900) * 1_000,
    lockoutMs: positiveNumber('AUTH_LOCKOUT_SECONDS', 900) * 1_000,
    secureCookie: booleanValue('AUTH_COOKIE_SECURE', isProduction),
    trustProxy: booleanValue('TRUST_PROXY', isProduction),
    appOrigin: get('APP_ORIGIN').replace(/\/$/, ''),
  },
} as const
