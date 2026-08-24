import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

type LogLevel = 'info' | 'warn' | 'error'
type LogFields = Record<string, string | number | boolean | null | undefined>

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields })
  if (level === 'error') console.error(payload)
  else if (level === 'warn') console.warn(payload)
  else console.log(payload)
}

export function attachRequestLogging(request: IncomingMessage, response: ServerResponse): string {
  const requestId = randomUUID()
  const startedAt = performance.now()
  response.setHeader('X-Request-Id', requestId)
  response.once('finish', () => logEvent('info', 'http_request', {
    requestId,
    method: request.method || '',
    path: request.url?.split('?')[0] || '',
    statusCode: response.statusCode,
    durationMs: Math.round(performance.now() - startedAt),
  }))
  return requestId
}
