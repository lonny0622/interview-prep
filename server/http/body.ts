import type { IncomingMessage } from 'node:http'

export async function readJson<T>(request: IncomingMessage, limit = 1_000_000): Promise<T> {
  const raw = await readBody(request, limit)
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('请求体必须是合法 JSON。')
  }
}

export function readBody(request: IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > limit) reject(new Error(`请求内容超过 ${Math.round(limit / 1_000_000)}MB 限制。`))
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}
