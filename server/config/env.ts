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

export const appConfig = {
  rootDir,
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
  port: Number(get('LLM_GATEWAY_PORT', '8787')),
  requestTimeoutMs: Number(get('LLM_REQUEST_TIMEOUT_MS', '90000')),
} as const
